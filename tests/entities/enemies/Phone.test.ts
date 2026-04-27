import { describe, it, expect, beforeEach } from "vitest";
import { Phone } from "../../../src/entities/enemies/Phone.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function advanceSeconds(phone: Phone, seconds: number, playerX = 0): void {
  const n = Math.ceil(seconds / DT);
  for (let i = 0; i < n; i++) phone.update(DT, playerX, 0);
}

describe("Phone — state machine", () => {
  it("starts in Vibrate state", () => {
    const p = new Phone({ x: 0, y: 0 });
    expect(p.state).toBe("Vibrate");
  });

  it("stays stationary while Vibrating", () => {
    const p = new Phone({ x: 0, y: 0 });
    p.update(DT, 0, 0);
    expect(p.body.velocity.x).toBe(0);
  });

  it("transitions Vibrate → Dash after VIBRATE_TIME", () => {
    const p = new Phone({ x: 0, y: 0 });
    advanceSeconds(p, Phone.VIBRATE_TIME + DT);
    expect(p.state).toBe("Dash");
  });

  it("dashes toward player (positive X when player is to the right)", () => {
    const p = new Phone({ x: 0, y: 0 });
    advanceSeconds(p, Phone.VIBRATE_TIME + DT, 10);
    expect(p.body.velocity.x).toBeGreaterThan(0);
  });

  it("dashes toward player (negative X when player is to the left)", () => {
    const p = new Phone({ x: 0, y: 0 });
    advanceSeconds(p, Phone.VIBRATE_TIME + DT, -10);
    expect(p.body.velocity.x).toBeLessThan(0);
  });

  it("transitions Dash → Vibrate after DASH_TIME", () => {
    const p = new Phone({ x: 0, y: 0 });
    advanceSeconds(p, Phone.VIBRATE_TIME + Phone.DASH_TIME + DT * 2);
    expect(p.state).toBe("Vibrate");
  });

  it("transitions Dash → Vibrate on wall contact", () => {
    const p = new Phone({ x: 0, y: 0 });
    advanceSeconds(p, Phone.VIBRATE_TIME + DT); // enter Dash
    p.body.flags.onWallR = true;
    p.update(DT);
    expect(p.state).toBe("Vibrate");
  });
});

describe("Phone — combat", () => {
  it("dies on HP-equivalent damage and awards gauge fill", () => {
    const p = new Phone({ x: 0, y: 0 });
    p.takeDamage(p.hp, 0, 0);
    expect(p.isAlive).toBe(false);
    expect(p.gaugeReward).toBe(1);
  });

  it("deals contact damage to overlapping player", () => {
    const ph = new Phone({ x: 0, y: 0 });
    const pl = new Player({ x: 0, y: 0 });
    const before = pl.health.current;
    ph.applyContactDamage(pl);
    expect(pl.health.current).toBeLessThan(before);
  });

  it("respects player i-frames on contact", () => {
    const ph = new Phone({ x: 0, y: 0 });
    const pl = new Player({ x: 0, y: 0 });
    ph.applyContactDamage(pl);
    const hp = pl.health.current;
    ph.applyContactDamage(pl);
    expect(pl.health.current).toBe(hp);
  });
});
