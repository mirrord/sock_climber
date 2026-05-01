import { describe, it, expect, beforeEach } from "vitest";
import { BossLaundry } from "../../../src/entities/enemies/BossLaundry.js";
import { createEventBus } from "../../../src/core/EventBus.js";
import { createRNG } from "../../../src/core/RNG.js";
import type { GameEvents } from "../../../src/core/EventBus.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function makeBoss(): {
  boss: BossLaundry;
  bus: ReturnType<typeof createEventBus<GameEvents>>;
} {
  const boss = new BossLaundry({ x: 24, y: -8 });
  boss.setArenaCentre(24, -8);
  boss.setRng(createRNG(42));
  const bus = createEventBus<GameEvents>();
  boss.attachBus(bus);
  boss.spawn();
  return { boss, bus };
}

describe("BossLaundry — armour", () => {
  it("starts in Idle state", () => {
    const { boss } = makeBoss();
    expect(boss.state).toBe("Idle");
  });

  it("ignores melee damage outside Dizzy", () => {
    const { boss } = makeBoss();
    expect(boss.state).not.toBe("Dizzy");
    const ok = boss.takeDamage(1, 0, 0);
    expect(ok).toBe(false);
    expect(boss.meleeStrikesTaken).toBe(0);
  });
});

describe("BossLaundry — Dizzy entry via dryer sheets", () => {
  it("requires SHEETS_TO_DIZZY hits to enter Dizzy", () => {
    const { boss } = makeBoss();
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY - 1; i++) {
      boss.applyDryerSheetHit();
      expect(boss.state).not.toBe("Dizzy");
    }
    boss.applyDryerSheetHit();
    expect(boss.state).toBe("Dizzy");
  });

  it("ignores additional sheet hits while already Dizzy", () => {
    const { boss } = makeBoss();
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY; i++) {
      boss.applyDryerSheetHit();
    }
    expect(boss.state).toBe("Dizzy");
    expect(boss.sheetHits).toBe(0); // reset on Dizzy entry
    boss.applyDryerSheetHit();
    expect(boss.sheetHits).toBe(0);
    expect(boss.state).toBe("Dizzy");
  });

  it("exits Dizzy after DIZZY_DURATION", () => {
    const { boss } = makeBoss();
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY; i++) {
      boss.applyDryerSheetHit();
    }
    expect(boss.state).toBe("Dizzy");
    const steps = Math.ceil(BossLaundry.DIZZY_DURATION / DT) + 2;
    for (let i = 0; i < steps; i++) boss.update(DT, 24, -8);
    expect(boss.state).not.toBe("Dizzy");
  });
});

describe("BossLaundry — defeat condition", () => {
  it("accumulates melee strikes during Dizzy", () => {
    const { boss } = makeBoss();
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY; i++) {
      boss.applyDryerSheetHit();
    }
    expect(boss.state).toBe("Dizzy");
    boss.takeDamage(1, 0, 0);
    expect(boss.meleeStrikesTaken).toBe(1);
  });

  it("emits onLevelComplete exactly once after MELEE_STRIKES_TO_WIN strikes", () => {
    const { boss, bus } = makeBoss();
    const events: Array<{ levelId: number }> = [];
    bus.on("onLevelComplete", (e) => events.push(e));
    // Enter dizzy
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY; i++) {
      boss.applyDryerSheetHit();
    }
    // Land 12 strikes, clearing i-frames between hits.
    for (let i = 0; i < BossLaundry.MELEE_STRIKES_TO_WIN; i++) {
      boss.takeDamage(1, 0, 0);
      (boss as unknown as { _health: { iFrameTimer: number } })._health.iFrameTimer = 0;
    }
    expect(boss.meleeStrikesTaken).toBe(BossLaundry.MELEE_STRIKES_TO_WIN);
    expect(events).toHaveLength(1);
    expect(events[0]!.levelId).toBe(4);
    // Further strikes do not re-emit.
    boss.takeDamage(1, 0, 0);
    expect(events).toHaveLength(1);
  });
});

describe("BossLaundry — onBossStateChanged events", () => {
  type BossEvent = GameEvents["onBossStateChanged"];

  it("emits an initial state event on attachBus", () => {
    // Build manually so we can observe the very first emission.
    const boss = new BossLaundry({ x: 24, y: -8 });
    boss.setArenaCentre(24, -8);
    boss.setRng(createRNG(42));
    const bus = createEventBus<GameEvents>();
    const events: BossEvent[] = [];
    bus.on("onBossStateChanged", (e) => events.push(e));
    boss.attachBus(bus);
    expect(events).toHaveLength(1);
    expect(events[0]!.state).toBe("Idle");
    expect(events[0]!.sheetHits).toBe(0);
    expect(events[0]!.sheetsToDizzy).toBe(BossLaundry.SHEETS_TO_DIZZY);
    expect(events[0]!.meleeStrikes).toBe(0);
    expect(events[0]!.meleeStrikesToWin).toBe(BossLaundry.MELEE_STRIKES_TO_WIN);
    expect(events[0]!.dizzyTimer).toBe(0);
  });

  it("emits on every dryer-sheet hit and on Dizzy entry", () => {
    const { boss, bus } = makeBoss();
    const events: BossEvent[] = [];
    bus.on("onBossStateChanged", (e) => events.push(e));
    boss.applyDryerSheetHit();
    expect(events.at(-1)!.sheetHits).toBe(1);
    expect(events.at(-1)!.state).not.toBe("Dizzy");
    boss.applyDryerSheetHit();
    expect(events.at(-1)!.sheetHits).toBe(2);
    boss.applyDryerSheetHit(); // triggers Dizzy
    const last = events.at(-1)!;
    expect(last.state).toBe("Dizzy");
    expect(last.sheetHits).toBe(0);
    expect(last.dizzyTimer).toBeGreaterThan(0);
  });

  it("emits on every successful melee strike", () => {
    const { boss, bus } = makeBoss();
    for (let i = 0; i < BossLaundry.SHEETS_TO_DIZZY; i++) {
      boss.applyDryerSheetHit();
    }
    const events: BossEvent[] = [];
    bus.on("onBossStateChanged", (e) => events.push(e));
    boss.takeDamage(1, 0, 0);
    (boss as unknown as { _health: { iFrameTimer: number } })._health.iFrameTimer = 0;
    boss.takeDamage(1, 0, 0);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.at(-1)!.meleeStrikes).toBe(2);
    expect(events.at(-1)!.state).toBe("Dizzy");
  });
});
