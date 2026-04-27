import { describe, it, expect, beforeEach } from "vitest";
import { Pen } from "../../../src/entities/obstacles/Pen.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

describe("Pen — always-active damage", () => {
  it("hitbox is always active", () => {
    const pen = new Pen({ x: 0, y: 0 });
    expect(pen.hitbox.active).toBe(true);
    pen.update(DT * 100);
    expect(pen.hitbox.active).toBe(true);
  });

  it("deals damage to overlapping player on contact", () => {
    const pen = new Pen({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    const before = player.health.current;
    pen.applyContactDamage(player);
    expect(player.health.current).toBeLessThan(before);
  });

  it("does not deal damage to non-overlapping player", () => {
    const pen = new Pen({ x: 0, y: 0 });
    const player = new Player({ x: 100, y: 0 });
    const before = player.health.current;
    pen.applyContactDamage(player);
    expect(player.health.current).toBe(before);
  });

  it("respects player i-frames", () => {
    const pen = new Pen({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    pen.applyContactDamage(player); // first hit, triggers i-frames
    const hp = player.health.current;
    pen.applyContactDamage(player); // blocked
    expect(player.health.current).toBe(hp);
  });

  it("hitbox is active again after spawn", () => {
    const pen = new Pen({ x: 0, y: 0 });
    pen.spawn();
    expect(pen.hitbox.active).toBe(true);
  });
});
