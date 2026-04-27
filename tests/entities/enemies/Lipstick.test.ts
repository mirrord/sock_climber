import { describe, it, expect, beforeEach } from "vitest";
import { Lipstick } from "../../../src/entities/enemies/Lipstick.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function steps(l: Lipstick, n: number): void {
  for (let i = 0; i < n; i++) l.update(DT);
}

describe("Lipstick — rolling behavior", () => {
  it("is always in Rolling state", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    expect(l.state).toBe("Rolling");
    steps(l, 120);
    expect(l.state).toBe("Rolling");
  });

  it("moves horizontally while rolling", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    steps(l, 1);
    expect(Math.abs(l.body.velocity.x)).toBeGreaterThan(0);
  });

  it("reverses direction on left wall contact", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    l.body.flags.onWallL = true;
    steps(l, 1);
    expect(l.body.velocity.x).toBeGreaterThan(0);
  });

  it("reverses direction on right wall contact", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    l.body.flags.onWallR = true;
    steps(l, 1);
    expect(l.body.velocity.x).toBeLessThan(0);
  });
});

describe("Lipstick — slick trail", () => {
  it("starts with an empty trail", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    expect(l.trail.length).toBe(0);
  });

  it("deposits a trail node after TRAIL_INTERVAL seconds", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    const trailSteps = Math.ceil(Lipstick.TRAIL_INTERVAL / DT) + 1;
    steps(l, trailSteps);
    expect(l.trail.length).toBeGreaterThan(0);
  });

  it("trail does not exceed MAX_TRAIL_LENGTH", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    // Run long enough to exceed the cap.
    const manySteps = Math.ceil(
      (Lipstick.TRAIL_INTERVAL * (Lipstick.MAX_TRAIL_LENGTH + 5)) / DT,
    );
    steps(l, manySteps);
    expect(l.trail.length).toBeLessThanOrEqual(Lipstick.MAX_TRAIL_LENGTH);
  });

  it("spawn clears the trail", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    steps(l, Math.ceil(Lipstick.TRAIL_INTERVAL / DT) + 1);
    expect(l.trail.length).toBeGreaterThan(0);
    l.spawn();
    expect(l.trail.length).toBe(0);
  });
});

describe("Lipstick — combat", () => {
  it("dies on HP-equivalent damage and awards gauge fill", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    l.takeDamage(l.hp, 0, 0);
    expect(l.isAlive).toBe(false);
    expect(l.gaugeReward).toBe(1);
  });

  it("deals contact damage to overlapping player", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    const before = p.health.current;
    l.applyContactDamage(p);
    expect(p.health.current).toBeLessThan(before);
  });

  it("respects player i-frames on contact", () => {
    const l = new Lipstick({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    l.applyContactDamage(p);
    const hp = p.health.current;
    l.applyContactDamage(p);
    expect(p.health.current).toBe(hp);
  });
});
