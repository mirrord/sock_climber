import { describe, it, expect, beforeEach } from "vitest";
import { Headphones } from "../../../src/entities/enemies/Headphones.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function advanceSeconds(h: Headphones, seconds: number): void {
  const n = Math.ceil(seconds / DT);
  for (let i = 0; i < n; i++) h.update(DT);
}

describe("Headphones — state machine", () => {
  it("starts in Drift state", () => {
    const h = new Headphones({ x: 0, y: 0 });
    expect(h.state).toBe("Drift");
  });

  it("transitions Drift → WindUp after DRIFT_TIME", () => {
    const h = new Headphones({ x: 0, y: 0 });
    advanceSeconds(h, Headphones.DRIFT_TIME + DT);
    expect(h.state).toBe("WindUp");
  });

  it("transitions WindUp → Tangle after WINDUP_TIME", () => {
    const h = new Headphones({ x: 0, y: 0 });
    advanceSeconds(h, Headphones.DRIFT_TIME + Headphones.WINDUP_TIME + DT * 2);
    expect(h.state).toBe("Tangle");
  });

  it("tangleHitbox is inactive during Drift", () => {
    const h = new Headphones({ x: 0, y: 0 });
    h.update(DT);
    expect(h.tangleHitbox.active).toBe(false);
  });

  it("tangleHitbox is inactive during WindUp", () => {
    const h = new Headphones({ x: 0, y: 0 });
    advanceSeconds(h, Headphones.DRIFT_TIME + DT);
    expect(h.state).toBe("WindUp");
    expect(h.tangleHitbox.active).toBe(false);
  });

  it("tangleHitbox becomes active in Tangle state", () => {
    const h = new Headphones({ x: 0, y: 0 });
    advanceSeconds(h, Headphones.DRIFT_TIME + Headphones.WINDUP_TIME + DT * 2);
    expect(h.state).toBe("Tangle");
    expect(h.tangleHitbox.active).toBe(true);
  });

  it("transitions Tangle → Drift after TANGLE_TIME and deactivates hitbox", () => {
    const h = new Headphones({ x: 0, y: 0 });
    advanceSeconds(
      h,
      Headphones.DRIFT_TIME + Headphones.WINDUP_TIME + Headphones.TANGLE_TIME + DT * 3,
    );
    expect(h.state).toBe("Drift");
    expect(h.tangleHitbox.active).toBe(false);
  });

  it("drifts back toward anchor", () => {
    const h = new Headphones({ x: 0, y: 0 });
    // Push the body away from anchor then let it drift back.
    h.body.position.x = 2;
    h.body.position.y = 0;
    h.update(DT);
    // Velocity should point toward anchor (negative X).
    expect(h.body.velocity.x).toBeLessThan(0);
  });
});

describe("Headphones — combat", () => {
  it("dies on HP-equivalent damage and awards gauge fill", () => {
    const h = new Headphones({ x: 0, y: 0 });
    h.takeDamage(h.hp, 0, 0);
    expect(h.isAlive).toBe(false);
    expect(h.gaugeReward).toBe(1);
  });

  it("deals contact damage to overlapping player", () => {
    const h = new Headphones({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    const before = p.health.current;
    h.applyContactDamage(p);
    expect(p.health.current).toBeLessThan(before);
  });

  it("respects player i-frames on contact", () => {
    const h = new Headphones({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    h.applyContactDamage(p);
    const hp = p.health.current;
    h.applyContactDamage(p);
    expect(p.health.current).toBe(hp);
  });
});
