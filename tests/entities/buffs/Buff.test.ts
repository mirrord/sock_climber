import { describe, it, expect, beforeEach } from "vitest";
import { Buff } from "../../../src/entities/buffs/Buff.js";
import { SpeedSock } from "../../../src/entities/buffs/SpeedSock.js";
import { LowGravitySock } from "../../../src/entities/buffs/LowGravitySock.js";
import { HighJumpSock } from "../../../src/entities/buffs/HighJumpSock.js";
import { SlowFloodSock } from "../../../src/entities/buffs/SlowFloodSock.js";
import { PowerSock } from "../../../src/entities/buffs/PowerSock.js";
import { RapidStrikeSock } from "../../../src/entities/buffs/RapidStrikeSock.js";
import { BUFF_REGISTRY, spawnBuff, type BuffTag } from "../../../src/entities/buffs/BuffRegistry.js";
import { Player } from "../../../src/entities/Player.js";
import { DEFAULT_PLAYER_STATS } from "../../../src/entities/components/Stats.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;
const ALL_TAGS: BuffTag[] = [
  "LowGravitySock",
  "SpeedSock",
  "SlowFloodSock",
  "HighJumpSock",
  "PowerSock",
  "RapidStrikeSock",
];

beforeEach(() => {
  _resetEntityIds();
});

// ─── Buff base — apply and revert ────────────────────────────────────────────

describe("Buff — apply and revert", () => {
  it("is not active before collection", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    expect(buff.isActive).toBe(false);
  });

  it("becomes active after tryCollect with overlapping player", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(buff.isActive).toBe(true);
  });

  it("applies the stat delta while active", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(
      DEFAULT_PLAYER_STATS.maxSpeed + SpeedSock.SPEED_DELTA,
    );
  });

  it("reverts the stat delta after duration expires", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    const steps = Math.ceil(SpeedSock.DURATION / DT) + 2;
    for (let i = 0; i < steps; i++) buff.update(DT);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(DEFAULT_PLAYER_STATS.maxSpeed);
    expect(buff.isActive).toBe(false);
  });

  it("does not collect when player is not overlapping", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 100, y: 0 });
    const result = buff.tryCollect(player);
    expect(result).toBe(false);
    expect(buff.isActive).toBe(false);
  });
});

// ─── Re-collection refreshes duration ────────────────────────────────────────

describe("Buff — re-collection refreshes duration", () => {
  it("re-collect resets remainingTime without double magnitude", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    // Advance halfway through the duration.
    const halfway = Math.floor(SpeedSock.DURATION / 2 / DT);
    for (let i = 0; i < halfway; i++) buff.update(DT);
    // Re-collect.
    buff.tryCollect(player);
    // Timer should be back near full duration.
    expect(buff.remainingTime).toBeGreaterThan(SpeedSock.DURATION * 0.9);
  });

  it("re-collection does not double the magnitude", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    buff.tryCollect(player); // re-collect
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(
      DEFAULT_PLAYER_STATS.maxSpeed + SpeedSock.SPEED_DELTA,
    );
  });
});

// ─── Individual buff variants ─────────────────────────────────────────────────

describe("LowGravitySock", () => {
  it("reduces gravity while active", () => {
    const buff = new LowGravitySock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.gravity).toBeCloseTo(
      DEFAULT_PLAYER_STATS.gravity + LowGravitySock.GRAVITY_DELTA,
    );
    expect(player.effectiveStats.gravity).toBeLessThan(DEFAULT_PLAYER_STATS.gravity);
  });
});

describe("SpeedSock", () => {
  it("increases maxSpeed while active", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.maxSpeed).toBeGreaterThan(DEFAULT_PLAYER_STATS.maxSpeed);
  });
});

describe("SlowFloodSock", () => {
  it("reduces deathPlaneSpeedMultiplier while active", () => {
    const buff = new SlowFloodSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.deathPlaneSpeedMultiplier).toBeLessThan(
      DEFAULT_PLAYER_STATS.deathPlaneSpeedMultiplier,
    );
  });
});

describe("HighJumpSock", () => {
  it("increases jump impulse magnitude (more negative jumpVelocity) while active", () => {
    const buff = new HighJumpSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    // jumpVelocity is negative; larger magnitude = more negative.
    expect(Math.abs(player.effectiveStats.jumpVelocity)).toBeGreaterThan(
      Math.abs(DEFAULT_PLAYER_STATS.jumpVelocity),
    );
  });
});

describe("PowerSock", () => {
  it("increases damageMultiplier while active", () => {
    const buff = new PowerSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.damageMultiplier).toBeGreaterThan(
      DEFAULT_PLAYER_STATS.damageMultiplier,
    );
  });
});

describe("RapidStrikeSock", () => {
  it("increases attackSpeedMultiplier while active", () => {
    const buff = new RapidStrikeSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    expect(player.effectiveStats.attackSpeedMultiplier).toBeGreaterThan(
      DEFAULT_PLAYER_STATS.attackSpeedMultiplier,
    );
  });
});

// ─── Stat composition with other mods ────────────────────────────────────────

describe("Buff — stat composition", () => {
  it("buff and a permanent patch compose additively", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    // Simulate a permanent patch that adds +2 to maxSpeed.
    player.applyStatMod("patch", { maxSpeed: 2 });
    buff.tryCollect(player);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(
      DEFAULT_PLAYER_STATS.maxSpeed + 2 + SpeedSock.SPEED_DELTA,
    );
  });

  it("two different buffs stack on independent fields", () => {
    const speed = new SpeedSock({ x: 0, y: 0 });
    const gravity = new LowGravitySock({ x: 1, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    speed.tryCollect(player);
    player.body.position.x = 1; // move to gravity buff
    gravity.tryCollect(player);
    expect(player.effectiveStats.maxSpeed).toBeGreaterThan(DEFAULT_PLAYER_STATS.maxSpeed);
    expect(player.effectiveStats.gravity).toBeLessThan(DEFAULT_PLAYER_STATS.gravity);
  });
});

// ─── Spawn clears buffs ───────────────────────────────────────────────────────

describe("Buff — spawn clears effect", () => {
  it("buff is deactivated when player.spawn() is called", () => {
    const buff = new SpeedSock({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    player.spawn(); // simulates death/respawn
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(DEFAULT_PLAYER_STATS.maxSpeed);
  });
});

// ─── BuffRegistry ─────────────────────────────────────────────────────────────

describe("BuffRegistry", () => {
  it("contains an entry for every buff tag", () => {
    for (const tag of ALL_TAGS) {
      expect(BUFF_REGISTRY[tag]).toBeDefined();
    }
  });

  it("factory returns a new buff instance each call", () => {
    const a = spawnBuff("SpeedSock", { x: 0, y: 0 });
    const b = spawnBuff("SpeedSock", { x: 0, y: 0 });
    expect(a).not.toBe(b);
  });

  it("spawned buff is placed at the requested position", () => {
    const buff = spawnBuff("HighJumpSock", { x: 3, y: -2 });
    expect(buff.position.x).toBe(3);
    expect(buff.position.y).toBe(-2);
  });
});
