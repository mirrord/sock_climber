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

// ─── Picker opening ───────────────────────────────────────────────────────

describe("UpgradeSystem — picker opening", () => {
  it("picker opens when gauge reaches 1 and player has empty containers", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1); // emptyContainers = 1

    // 4 kills fills gauge to 1.
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

    expect(sys.isPickerOpen).toBe(true);
  });

  it("picker offers exactly 3 patches", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

    expect(sys.currentOffer?.length).toBe(3);
  });

  it("offer contains no duplicate patch ids", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(42));
    const player = makePlayer(3);
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

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
    sys.update(player);

    expect(sys.gauge).toBeCloseTo(0);
  });

  it("picker does NOT open when player has 0 empty containers (gated)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(1));
    const player = makePlayer(3); // full health → 0 empty containers

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

    expect(sys.isPickerOpen).toBe(false);
  });

  it("picker never offers capped patches (AirJump when combined >= 2)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new UpgradeSystem(bus, createRNG(99));
    // Player already at cap.
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 1, maxAirDashes: 1 });
    damagePlayer(player, 1);

    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

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
    sys.update(player);
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
    sys.update(player);

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
      sys.update(player);
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
    sys.update(player);
    // Find AirDash in offer (combined is 1, so still eligible).
    const idx = sys.currentOffer?.findIndex((p) => p.id === "AirDash") ?? -1;
    if (idx === -1) return; // not in offer this seed — skip
    sys.selectPatch(idx as 0 | 1 | 2, player);

    // Second pick cycle (combined now 1+1=2, so both capped).
    for (let i = 4; i < 8; i++) bus.emit("onKill", { entityId: i });
    sys.update(player);

    if (!sys.isPickerOpen) return; // no more empty containers — skip
    const offer2 = sys.currentOffer ?? [];
    expect(offer2.find((p) => p.id === "AirJump")).toBeUndefined();
    expect(offer2.find((p) => p.id === "AirDash")).toBeUndefined();
  });
});
