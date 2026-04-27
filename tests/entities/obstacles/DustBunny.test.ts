import { describe, it, expect, beforeEach } from "vitest";
import { DustBunny } from "../../../src/entities/obstacles/DustBunny.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

describe("DustBunny — explosion on contact", () => {
  it("does not explode without player contact", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    expect(db.hasExploded).toBe(false);
  });

  it("explodes on player contact", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    db.processPlayer(player);
    expect(db.hasExploded).toBe(true);
  });

  it("deals damage to player on explosion", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    const before = player.health.current;
    db.processPlayer(player);
    expect(player.health.current).toBe(before - DustBunny.DAMAGE);
  });

  it("is one-shot — subsequent contact does not deal damage", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    db.processPlayer(player); // explode
    // Expire i-frames then check second contact is inert.
    for (let i = 0; i < Math.ceil(1.1 / DT); i++) {
      db.update(DT);
    }
    const hp = player.health.current;
    const result = db.processPlayer(player);
    expect(result).toBe(false);
    expect(player.health.current).toBe(hp);
  });
});

describe("DustBunny — smoke overlay", () => {
  it("smoke is inactive before explosion", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    expect(db.smokeActive).toBe(false);
  });

  it("smoke activates immediately after explosion", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    db.processPlayer(player);
    expect(db.smokeActive).toBe(true);
  });

  it("smoke clears after SMOKE_DURATION seconds", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    db.processPlayer(player);
    const steps = Math.ceil(DustBunny.SMOKE_DURATION / DT) + 2;
    for (let i = 0; i < steps; i++) db.update(DT);
    expect(db.smokeActive).toBe(false);
  });

  it("smoke is still active just before SMOKE_DURATION expires", () => {
    const db = new DustBunny({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    db.processPlayer(player);
    const steps = Math.floor((DustBunny.SMOKE_DURATION * 0.9) / DT);
    for (let i = 0; i < steps; i++) db.update(DT);
    expect(db.smokeActive).toBe(true);
  });
});
