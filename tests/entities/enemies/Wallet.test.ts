import { describe, it, expect, beforeEach } from "vitest";
import { Wallet } from "../../../src/entities/enemies/Wallet.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function steps(enemy: Wallet, n: number, playerX = 999): void {
  for (let i = 0; i < n; i++) enemy.update(DT, playerX, 0);
}

describe("Wallet — state machine", () => {
  it("starts in Patrol state", () => {
    const w = new Wallet({ x: 0, y: 0 });
    expect(w.state).toBe("Patrol");
  });

  it("moves horizontally in Patrol", () => {
    const w = new Wallet({ x: 0, y: 0 });
    steps(w, 10, 999); // player far away
    expect(Math.abs(w.body.velocity.x)).toBeGreaterThan(0);
  });

  it("reverses patrol direction on left wall", () => {
    const w = new Wallet({ x: 0, y: 0 });
    w.body.flags.onWallL = true;
    steps(w, 1, 999);
    expect(w.body.velocity.x).toBeGreaterThan(0); // now moving right
  });

  it("reverses patrol direction on right wall", () => {
    const w = new Wallet({ x: 0, y: 0 });
    w.body.flags.onWallR = true;
    steps(w, 1, 999);
    expect(w.body.velocity.x).toBeLessThan(0); // now moving left
  });

  it("transitions Patrol → Charge when player enters detection range", () => {
    const w = new Wallet({ x: 0, y: 0 });
    steps(w, 1, Wallet.DETECTION_RANGE - 0.1);
    expect(w.state).toBe("Charge");
  });

  it("does not charge when player is outside detection range", () => {
    const w = new Wallet({ x: 0, y: 0 });
    steps(w, 10, Wallet.DETECTION_RANGE + 1);
    expect(w.state).toBe("Patrol");
  });

  it("charge velocity is directed toward player", () => {
    const w = new Wallet({ x: 0, y: 0 });
    // player to the right
    steps(w, 1, Wallet.DETECTION_RANGE - 0.1);
    expect(w.body.velocity.x).toBeGreaterThan(0);
  });

  it("transitions Charge → Patrol after CHARGE_DURATION", () => {
    const w = new Wallet({ x: 0, y: 0 });
    steps(w, 1, Wallet.DETECTION_RANGE - 0.1); // enter Charge
    const chargeSteps = Math.ceil(Wallet.CHARGE_DURATION / DT) + 2;
    // player outside detection range so Patrol state is not immediately re-entered
    steps(w, chargeSteps, Wallet.DETECTION_RANGE + 1);
    expect(w.state).toBe("Patrol");
  });

  it("transitions Charge → Patrol on wall contact", () => {
    const w = new Wallet({ x: 0, y: 0 });
    steps(w, 1, Wallet.DETECTION_RANGE - 0.1); // enter Charge
    w.body.flags.onWallR = true;
    steps(w, 1, 0);
    expect(w.state).toBe("Patrol");
  });
});

describe("Wallet — combat", () => {
  it("takes HP-equivalent damage to die and awards gauge fill", () => {
    const w = new Wallet({ x: 0, y: 0 });
    w.takeDamage(w.hp, 0, 0);
    expect(w.isAlive).toBe(false);
    expect(w.gaugeReward).toBe(2);
  });

  it("deals contact damage to overlapping player", () => {
    const w = new Wallet({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    const before = p.health.current;
    w.applyContactDamage(p);
    expect(p.health.current).toBeLessThan(before);
  });

  it("respects player i-frames on contact", () => {
    const w = new Wallet({ x: 0, y: 0 });
    const p = new Player({ x: 0, y: 0 });
    w.applyContactDamage(p);
    const hp = p.health.current;
    w.applyContactDamage(p);
    expect(p.health.current).toBe(hp);
  });
});
