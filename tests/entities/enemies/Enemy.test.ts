import { describe, it, expect, beforeEach } from "vitest";
import { Enemy } from "../../../src/entities/enemies/Enemy.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

// ─── Concrete subclass for testing the abstract base ──────────────────────────

class TestEnemy extends Enemy {
  updateCallCount = 0;

  constructor(position = { x: 0, y: 0 }) {
    super({ position, halfW: 0.5, halfH: 0.5, maxHp: 3, gaugeReward: 2 });
  }

  protected updateAI(_dt: number, _px: number, _py: number): void {
    this.updateCallCount++;
  }
}

beforeEach(() => {
  _resetEntityIds();
});

// ─── Damageable interface ─────────────────────────────────────────────────────

describe("Enemy — Damageable interface", () => {
  it("starts with full hp", () => {
    const e = new TestEnemy();
    expect(e.hp).toBe(3);
  });

  it("takeDamage reduces hp", () => {
    const e = new TestEnemy();
    e.takeDamage(1, 0, 0);
    expect(e.hp).toBe(2);
  });

  it("takeDamage returns true when damage lands", () => {
    const e = new TestEnemy();
    expect(e.takeDamage(1, 0, 0)).toBe(true);
  });

  it("takeDamage returns false during i-frames", () => {
    const e = new TestEnemy();
    e.takeDamage(1, 0, 0); // starts i-frames
    expect(e.takeDamage(1, 0, 0)).toBe(false);
  });

  it("i-frames expire after iFrameDuration", () => {
    const enemy = new TestEnemy({ x: 0, y: 0 });
    enemy.takeDamage(1, 0, 0); // starts 0.5s i-frames
    // Advance past 0.5 s
    for (let i = 0; i < Math.ceil(0.5 / DT) + 1; i++) enemy.update(DT);
    expect(enemy.takeDamage(1, 0, 0)).toBe(true);
  });

  it("hp does not go below 0", () => {
    const e = new TestEnemy();
    e.takeDamage(100, 0, 0);
    expect(e.hp).toBe(0);
  });

  it("isAlive is false when hp reaches 0", () => {
    const e = new TestEnemy();
    e.takeDamage(3, 0, 0);
    expect(e.isAlive).toBe(false);
  });

  it("gaugeReward matches constructor option", () => {
    const e = new TestEnemy();
    expect(e.gaugeReward).toBe(2);
  });

  it("takeDamage applies knockback to body velocity", () => {
    const e = new TestEnemy();
    e.takeDamage(1, 5, -3);
    expect(e.body.velocity.x).toBe(5);
    expect(e.body.velocity.y).toBe(-3);
  });
});

// ─── Contact damage ───────────────────────────────────────────────────────────

describe("Enemy — applyContactDamage", () => {
  it("deals damage to overlapping player", () => {
    const e = new TestEnemy({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    const initial = p.health.current;
    e.applyContactDamage(p);
    expect(p.health.current).toBe(initial - 1);
  });

  it("does not deal damage to non-overlapping player", () => {
    const e = new TestEnemy({ x: 0, y: 0 });
    const p = new Player({ x: 100, y: 0 });
    const initial = p.health.current;
    e.applyContactDamage(p);
    expect(p.health.current).toBe(initial);
  });

  it("respects player i-frames", () => {
    const e = new TestEnemy({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    e.applyContactDamage(p); // triggers i-frames
    const hpAfterFirst = p.health.current;
    const result = e.applyContactDamage(p); // should be blocked
    expect(result).toBe(false);
    expect(p.health.current).toBe(hpAfterFirst);
  });
});

// ─── AI gating ────────────────────────────────────────────────────────────────

describe("Enemy — AI gating", () => {
  it("updateAI is not called when dead", () => {
    const e = new TestEnemy();
    e.takeDamage(3, 0, 0); // kill
    const countBefore = e.updateCallCount;
    e.update(DT);
    expect(e.updateCallCount).toBe(countBefore); // no extra calls
  });

  it("spawn resets hp and iFrameTimer", () => {
    const e = new TestEnemy();
    e.takeDamage(3, 0, 0);
    e.spawn();
    expect(e.hp).toBe(3);
    expect(e.iFrameTimer).toBe(0);
  });
});
