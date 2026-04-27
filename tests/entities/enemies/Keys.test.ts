import { describe, it, expect, beforeEach } from "vitest";
import { Keys } from "../../../src/entities/enemies/Keys.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function advanceSeconds(enemy: Keys, seconds: number, playerX = 0, playerY = 0): void {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) enemy.update(DT, playerX, playerY);
}

describe("Keys — state machine", () => {
  it("starts in Idle state", () => {
    const k = new Keys({ x: 0, y: 0 });
    expect(k.state).toBe("Idle");
  });

  it("transitions Idle → Telegraph after IDLE_TIME", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + DT);
    expect(k.state).toBe("Telegraph");
  });

  it("transitions Telegraph → Jump after TELEGRAPH_TIME", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + DT * 2);
    expect(k.state).toBe("Jump");
  });

  it("sets upward velocity when entering Jump", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + DT * 2);
    expect(k.body.velocity.y).toBe(Keys.JUMP_VY);
  });

  it("jumps toward player (positive X when player is to the right)", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + DT * 2, 10, 0);
    expect(k.body.velocity.x).toBeGreaterThan(0);
  });

  it("jumps toward player (negative X when player is to the left)", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + DT * 2, -10, 0);
    expect(k.body.velocity.x).toBeLessThan(0);
  });

  it("returns Jump → Idle after JUMP_TIMEOUT when not grounded", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + Keys.JUMP_TIMEOUT + DT * 5);
    expect(k.state).toBe("Idle");
  });

  it("returns Jump → Idle immediately when body.flags.onGround becomes true", () => {
    const k = new Keys({ x: 0, y: 0 });
    advanceSeconds(k, Keys.IDLE_TIME + Keys.TELEGRAPH_TIME + DT * 2); // enter Jump
    expect(k.state).toBe("Jump");
    k.body.flags.onGround = true;
    k.update(DT);
    expect(k.state).toBe("Idle");
  });
});

describe("Keys — combat", () => {
  it("dies after HP-equivalent damage and awards gauge fill", () => {
    const k = new Keys({ x: 0, y: 0 });
    k.takeDamage(k.hp, 0, 0);
    expect(k.isAlive).toBe(false);
    expect(k.gaugeReward).toBe(1);
  });

  it("deals contact damage to overlapping player", () => {
    const k = new Keys({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    const before = p.health.current;
    k.applyContactDamage(p);
    expect(p.health.current).toBeLessThan(before);
  });

  it("respects player i-frames on contact", () => {
    const k = new Keys({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    k.applyContactDamage(p); // trigger i-frames
    const hp = p.health.current;
    k.applyContactDamage(p); // blocked
    expect(p.health.current).toBe(hp);
  });
});
