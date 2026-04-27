import { describe, it, expect, beforeEach } from "vitest";
import { Gum } from "../../../src/entities/obstacles/Gum.js";
import { Player } from "../../../src/entities/Player.js";
import { DEFAULT_PLAYER_STATS } from "../../../src/entities/components/Stats.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

beforeEach(() => {
  _resetEntityIds();
});

describe("Gum — player outside", () => {
  it("does not modify stats when player is far away", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 100, y: 0 });
    gum.processPlayer(player);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(DEFAULT_PLAYER_STATS.maxSpeed);
    expect(player.effectiveStats.jumpVelocity).toBeCloseTo(DEFAULT_PLAYER_STATS.jumpVelocity);
  });

  it("isPlayerInside is false initially", () => {
    const gum = new Gum({ x: 0, y: 0 });
    expect(gum.isPlayerInside).toBe(false);
  });
});

describe("Gum — player inside", () => {
  it("reduces maxSpeed to SPEED_MULT fraction when overlapping", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    gum.processPlayer(player);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(
      DEFAULT_PLAYER_STATS.maxSpeed * Gum.SPEED_MULT,
    );
  });

  it("reduces jump impulse magnitude to JUMP_MULT fraction when overlapping", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    gum.processPlayer(player);
    // jumpVelocity is negative; mult reduces magnitude → closer to 0.
    expect(Math.abs(player.effectiveStats.jumpVelocity)).toBeCloseTo(
      Math.abs(DEFAULT_PLAYER_STATS.jumpVelocity) * Gum.JUMP_MULT,
    );
  });

  it("isPlayerInside is true while overlapping", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    gum.processPlayer(player);
    expect(gum.isPlayerInside).toBe(true);
  });
});

describe("Gum — player exits", () => {
  it("restores stats when player moves out", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    gum.processPlayer(player); // enter
    player.body.position.x = 100; // move out
    gum.processPlayer(player); // exit
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(DEFAULT_PLAYER_STATS.maxSpeed);
    expect(Math.abs(player.effectiveStats.jumpVelocity)).toBeCloseTo(
      Math.abs(DEFAULT_PLAYER_STATS.jumpVelocity),
    );
  });

  it("isPlayerInside is false after player exits", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    gum.processPlayer(player);
    player.body.position.x = 100;
    gum.processPlayer(player);
    expect(gum.isPlayerInside).toBe(false);
  });
});

describe("Gum — stat composition", () => {
  it("Gum effect composes additively with other active stat mods", () => {
    const gum = new Gum({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    // Permanent patch: adds +2 to maxSpeed
    player.applyStatMod("patch", { maxSpeed: 2 });
    // With patch active, base for gum delta is still player.stats.maxSpeed (not effectiveStats).
    gum.processPlayer(player);
    // Expected: base(8) + patch(+2) + gum delta(8 * (0.4-1) = -4.8) = 5.2
    const expected = DEFAULT_PLAYER_STATS.maxSpeed + 2 + DEFAULT_PLAYER_STATS.maxSpeed * (Gum.SPEED_MULT - 1);
    expect(player.effectiveStats.maxSpeed).toBeCloseTo(expected);
  });
});
