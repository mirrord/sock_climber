import { describe, it, expect, beforeEach } from "vitest";
import { UpgradeSystem } from "../../src/systems/UpgradeSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import { createRNG } from "../../src/core/RNG.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { Player } from "../../src/entities/Player.js";

const FILL_PER_KILL = 0.25;

function makePlayer(maxHealth = 3): Player {
  return new Player({ x: 0, y: 0 }, { maxHealth });
}

/** Damage the player down to currentHP so emptyContainers = containers - currentHP. */
function damagePlayer(player: Player, hits: number): void {
  for (let i = 0; i < hits; i++) {
    player.takeDamage(1, 0, 0);
    // Reset i-frames so next hit lands.
    (player as unknown as { _health: { iFrameTimer: number } })._health.iFrameTimer = 0;
  }
}

// ─── Gauge fills ──────────────────────────────────────────────────────────

describe("UpgradeSystem — gauge", () => {
  it("gauge starts at 0", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    expect(sys.gauge).toBe(0);
  });

  it("fills by FILL_PER_KILL per onKill", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeCloseTo(FILL_PER_KILL);
  });

  it("fills by FILL_PER_KILL twice after two kills", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    bus.emit("onKill", { entityId: 1 });
    bus.emit("onKill", { entityId: 2 });
    expect(sys.gauge).toBeCloseTo(FILL_PER_KILL * 2);
  });

  it("gauge saturates at 1.0", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    for (let i = 0; i < 100; i++) {
      bus.emit("onKill", { entityId: i });
    }
    expect(sys.gauge).toBeLessThanOrEqual(1);
  });
});

// ─── Climb-based fill ─────────────────────────────────────────────────────

describe("UpgradeSystem — climb fill", () => {
  it("baselines climb position on first update without filling", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player);
    expect(sys.gauge).toBe(0);
  });

  it("fills from 0 to 1 after 50 world-units of net upward climb", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player); // baseline
    // World Y+ is down; climb upward = decrease y by 50.
    player.body.position.y = 50;
    sys.update(player);
    expect(sys.gauge).toBeCloseTo(1);
  });

  it("partial climb yields proportional fill", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player); // baseline
    player.body.position.y = 90; // 10 units up
    sys.update(player);
    expect(sys.gauge).toBeCloseTo(10 / 50);
  });

  it("descending does not decrease the gauge", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player); // baseline
    player.body.position.y = 80; // climb 20 → gauge 0.4
    sys.update(player);
    const after = sys.gauge;
    player.body.position.y = 200; // fall well below baseline
    sys.update(player);
    expect(sys.gauge).toBeCloseTo(after);
  });

  it("emits onGaugeChanged with the updated fill on climb", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player); // baseline
    let lastFill = -1;
    bus.on("onGaugeChanged", ({ fill }) => {
      lastFill = fill;
    });
    player.body.position.y = 75; // 25 units up
    sys.update(player);
    expect(lastFill).toBeCloseTo(25 / 50);
  });

  it("climb fill combined with kills caps at 1 and emits onGaugeFull once", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);
    let fullCount = 0;
    bus.on("onGaugeFull", () => fullCount++);
    player.body.position.y = 100;
    sys.update(player); // baseline
    bus.emit("onKill", { entityId: 1 }); // 0.25
    bus.emit("onKill", { entityId: 2 }); // 0.50
    player.body.position.y = 50; // +1.0 climb fill, total clamped to 1
    sys.update(player);
    expect(fullCount).toBe(1);
    expect(sys.tryOpenPicker(player)).toBe(true);
    expect(sys.isPickerOpen).toBe(true);
  });

  it("reset() re-baselines the climb position", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    player.body.position.y = 100;
    sys.update(player); // baseline at 100
    player.body.position.y = 50; // fills to 1
    sys.update(player);
    sys.reset();
    expect(sys.gauge).toBe(0);
    // After reset, jumping straight to a much higher altitude should not
    // immediately fill the bar — the next update re-baselines.
    player.body.position.y = 0;
    sys.update(player);
    expect(sys.gauge).toBe(0);
  });
});

// ─── Picker opening ───────────────────────────────────────────────────────

describe("UpgradeSystem — picker opening", () => {
  it("picker opens when tryOpenPicker is called with full gauge and an empty container", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1); // emptyContainers = 1

    // 4 kills fills gauge to 1.
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);
    expect(sys.isPickerOpen).toBe(false); // does NOT auto-open

    expect(sys.tryOpenPicker(player)).toBe(true);
    expect(sys.isPickerOpen).toBe(true);
  });

  it("picker offers exactly 3 patches", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    expect(sys.currentOffer?.length).toBe(3);
  });

  it("offer contains no duplicate patch ids", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(42));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    const offer = sys.currentOffer!;
    const ids = offer.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("gauge resets to 0 when picker opens", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    expect(sys.gauge).toBeCloseTo(0);
  });

  it("tryOpenPicker still opens with 0 empty containers (offer is filtered)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3); // full health → 0 empty containers

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    expect(sys.tryOpenPicker(player)).toBe(true);
    expect(sys.isPickerOpen).toBe(true);
    // Only ExtraHP is eligible without an empty container.
    const offer = sys.currentOffer ?? [];
    for (const p of offer) expect(p.id).toBe("ExtraHP");
  });

  it("tryOpenPicker returns false when full HP and ExtraHP cap reached (regression: no-offer softlock)", () => {
    // Repro: player is at full HP (0 empty containers) and has already
    // maxed the ExtraHP container cap (5). With those constraints every
    // catalog entry becomes ineligible; the picker must NOT open with an
    // empty offer (which would render an undismissable modal and softlock
    // the run).
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3); // full health → 0 empty containers

    // Bring the player up to the ExtraHP container cap so that patch
    // also becomes ineligible.
    player.gainContainer();
    player.gainContainer();

    // Fill the gauge.
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    expect(sys.gauge).toBeCloseTo(1);

    // Picker must refuse to open; gauge must stay full so the player can
    // retry once they take damage.
    expect(sys.tryOpenPicker(player)).toBe(false);
    expect(sys.isPickerOpen).toBe(false);
    expect(sys.gauge).toBeCloseTo(1);
  });

  it("tryOpenPicker returns false when gauge is not full", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeCloseTo(0.25);
    expect(sys.tryOpenPicker(player)).toBe(false);
    expect(sys.isPickerOpen).toBe(false);
  });

  it("emits onPickerOpen exactly once when picker opens", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    let openCount = 0;
    bus.on("onPickerOpen", () => openCount++);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);
    sys.tryOpenPicker(player); // already open — no-op

    expect(openCount).toBe(1);
  });

  it("picker never offers capped patches (AirJump when combined >= 2)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(99));
    // Player already at cap.
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 1, maxAirDashes: 1 });
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    const offer = sys.currentOffer ?? [];
    expect(offer.find((p) => p.id === "AirJump")).toBeUndefined();
    expect(offer.find((p) => p.id === "AirDash")).toBeUndefined();
  });
});

// ─── selectPatch ──────────────────────────────────────────────────────────

describe("UpgradeSystem — selectPatch", () => {
  function openPicker(
    bus: ReturnType<typeof createEventBus<GameEvents>>,
    sys: UpgradeSystem,
    player: Player,
  ): void {
    damagePlayer(player, 1);
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);
  }

  it("closes picker after selection", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    openPicker(bus, sys, player);

    sys.selectPatch(0, player);
    expect(sys.isPickerOpen).toBe(false);
    expect(sys.currentOffer).toBeNull();
  });

  it("consumeEmptyContainer is called — emptyContainers decreases by 1 for non-ExtraHP patch", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 2); // 2 empty containers
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    // Find a non-ExtraHP patch to select (ExtraHP doesn't consume a container).
    const idx = sys.currentOffer!.findIndex((p) => p.id !== "ExtraHP");
    if (idx === -1) return; // all 3 offered are ExtraHP — impossible with current catalog, but guard

    const before = player.emptyContainers;
    sys.selectPatch(idx as 0 | 1 | 2, player);
    expect(player.emptyContainers).toBe(before - 1);
  });

  it("non-ExtraHP patch is applied as a stat mod on the player", () => {
    const bus = createEventBus<GameEvents>();
    // Force the offer to include Speed by seeding so it's in the first slot.
    // We'll just check that a stat mod with the patch's id is applied.
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    openPicker(bus, sys, player);

    const offeredPatch = sys.currentOffer![0]!;
    if (offeredPatch.id === "ExtraHP") return; // skip if first slot is ExtraHP

    const beforeStat = (player.effectiveStats as Record<string, unknown>)[
      Object.keys(offeredPatch.statMod)[0]!
    ] as number;
    sys.selectPatch(0, player);
    const afterStat = (player.effectiveStats as Record<string, unknown>)[
      Object.keys(offeredPatch.statMod)[0]!
    ] as number;
    const delta = Object.values(offeredPatch.statMod)[0]! as number;
    expect(afterStat).toBeCloseTo(beforeStat + delta);
  });

  it("emits onPatchApplied with the correct patchId", () => {
    const bus = createEventBus<GameEvents>();
    const applied: string[] = [];
    bus.on("onPatchApplied", ({ patchId }) => applied.push(patchId));

    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    openPicker(bus, sys, player);

    const selectedId = sys.currentOffer![0]!.id;
    sys.selectPatch(0, player);
    expect(applied).toContain(selectedId);
  });

  it("ExtraHP patch calls gainContainer (containers and current both +1)", () => {
    const bus = createEventBus<GameEvents>();
    // Seed until ExtraHP is in the offer.
    let sys!: UpgradeSystem;
    let player!: Player;
    let found = false;

    for (let seed = 0; seed < 50 && !found; seed++) {
      bus.clear();
      sys = new UpgradeSystem(bus, createRNG(seed));
      player = makePlayer(3);
      damagePlayer(player, 1);
      for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
      sys.tryOpenPicker(player);
      if (sys.currentOffer?.some((p) => p.id === "ExtraHP")) {
        found = true;
      } else {
        bus.clear();
      }
    }

    if (!found) return; // catalog may not include ExtraHP in first 3 for these seeds — skip gracefully

    const idx = sys.currentOffer!.findIndex((p) => p.id === "ExtraHP");
    const beforeContainers = player.health.containers;
    const beforeCurrent = player.health.current;
    sys.selectPatch(idx as 0 | 1 | 2, player);
    expect(player.health.containers).toBe(beforeContainers + 1);
    expect(player.health.current).toBe(beforeCurrent + 1);
  });

  it("applied patch id is tracked — capped patches no longer offered", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 1, maxAirDashes: 0, maxHealth: 3 });
    // Give the player 2 empty containers so we can select twice.
    damagePlayer(player, 2);

    // First pick cycle.
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);
    // Find AirDash in offer (combined is 1, so still eligible).
    const idx = sys.currentOffer?.findIndex((p) => p.id === "AirDash") ?? -1;
    if (idx === -1) return; // not in offer this seed — skip
    sys.selectPatch(idx as 0 | 1 | 2, player);

    // Second pick cycle (combined now 1+1=2, so both capped).
    for (let i = 4; i < 8; i++) bus.emit("onKill", { entityId: i });
    sys.tryOpenPicker(player);

    if (!sys.isPickerOpen) return; // no more empty containers — skip
    const offer2 = sys.currentOffer ?? [];
    expect(offer2.find((p) => p.id === "AirJump")).toBeUndefined();
    expect(offer2.find((p) => p.id === "AirDash")).toBeUndefined();
  });
});

// --- Loadout mode + setEnabled (level 4) --------------------------------

describe("UpgradeSystem � setEnabled", () => {
  it("disabling blocks gauge fill from kills", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBe(0);
  });

  it("disabling zeroes existing gauge", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeGreaterThan(0);
    sys.setEnabled(false);
    expect(sys.gauge).toBe(0);
  });

  it("re-enabling allows further gauge fill", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    sys.setEnabled(true);
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeGreaterThan(0);
  });

  it("reset() re-enables the system", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    sys.reset();
    expect(sys.enabled).toBe(true);
  });
});

describe("UpgradeSystem � openLoadoutOffer", () => {
  it("opens the picker bypassing the gauge requirement", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    expect(sys.gauge).toBe(0);
    sys.openLoadoutOffer(player);
    expect(sys.isPickerOpen).toBe(true);
    expect(sys.currentOffer).not.toBeNull();
  });

  it("emits onPickerOpen", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    let opened = false;
    bus.on("onPickerOpen", () => { opened = true; });
    sys.openLoadoutOffer(player);
    expect(opened).toBe(true);
  });

  it("selectPatch in loadout mode does NOT consume an empty HP container", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    // Player at full HP � no empty containers available.
    expect(player.health.containers - player.health.current).toBe(0);
    sys.openLoadoutOffer(player);
    const offer = sys.currentOffer ?? [];
    // Pick the first non-ExtraHP entry (those use a different code path).
    const idx = offer.findIndex((p) => p.id !== "ExtraHP");
    if (idx === -1) return; // unlikely with the default registry
    const patchId = offer[idx]!.id;
    sys.selectPatch(idx as 0 | 1 | 2, player);
    // Mod was applied (no throw, no HP consumption).
    expect(player.hasStatMod(patchId)).toBe(true);
    // Picker has closed.
    expect(sys.isPickerOpen).toBe(false);
  });
});

// ─── Loadout mode + setEnabled (level 4) ────────────────────────────────

describe("UpgradeSystem — setEnabled", () => {
  it("disabling blocks gauge fill from kills", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBe(0);
  });

  it("disabling zeroes existing gauge", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeGreaterThan(0);
    sys.setEnabled(false);
    expect(sys.gauge).toBe(0);
  });

  it("re-enabling allows further gauge fill", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    sys.setEnabled(true);
    bus.emit("onKill", { entityId: 1 });
    expect(sys.gauge).toBeGreaterThan(0);
  });

  it("reset() re-enables the system", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    sys.setEnabled(false);
    sys.reset();
    expect(sys.enabled).toBe(true);
  });
});

describe("UpgradeSystem — openLoadoutOffer", () => {
  it("opens the picker bypassing the gauge requirement", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    expect(sys.gauge).toBe(0);
    sys.openLoadoutOffer(player);
    expect(sys.isPickerOpen).toBe(true);
    expect(sys.currentOffer).not.toBeNull();
  });

  it("emits onPickerOpen", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    let opened = false;
    bus.on("onPickerOpen", () => { opened = true; });
    sys.openLoadoutOffer(player);
    expect(opened).toBe(true);
  });

  it("selectPatch in loadout mode does NOT consume an empty HP container", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer();
    expect(player.health.containers - player.health.current).toBe(0);
    sys.openLoadoutOffer(player);
    const offer = sys.currentOffer ?? [];
    const idx = offer.findIndex((p) => p.id !== "ExtraHP");
    if (idx === -1) return;
    const patchId = offer[idx]!.id;
    sys.selectPatch(idx as 0 | 1 | 2, player);
    expect(player.hasStatMod(patchId)).toBe(true);
    expect(sys.isPickerOpen).toBe(false);
  });
});
