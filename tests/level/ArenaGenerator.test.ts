import { describe, it, expect, beforeEach } from "vitest";
import {
  createArenaGenerator,
  ARENA_RADIUS,
  ARENA_CENTRE_X,
  ARENA_CENTRE_Y,
} from "../../src/level/ArenaGenerator.js";
import type { GeneratorOptions } from "../../src/level/Generator.js";
import { _resetEntityIds } from "../../src/entities/Entity.js";

beforeEach(() => {
  _resetEntityIds();
});

function makeOpts(): GeneratorOptions {
  return {
    seed: 12345,
    cameraY: 0,
    worldYMin: -32,
    spawn: { x: 24, y: 12 },
  };
}

describe("ArenaGenerator — initial layout", () => {
  it("first advance() places solid wall tiles outside the inscribed circle", () => {
    const gen = createArenaGenerator(makeOpts());
    const result = gen.advance(0, 0);
    const r2 = ARENA_RADIUS * ARENA_RADIUS;
    let outsideSolid = 0;
    let insideSolid = 0;
    for (const t of result.newTiles) {
      const dx = t.tx - ARENA_CENTRE_X;
      const dy = t.ty - ARENA_CENTRE_Y;
      const inside = dx * dx + dy * dy <= r2;
      if (t.solid) {
        if (inside) insideSolid++;
        else outsideSolid++;
      }
    }
    // Most solid tiles are wall fill outside the circle; the only
    // inside-circle solids that may be emitted are visible fade
    // platforms (≤ FADE_PLATFORM_COUNT * FADE_PLATFORM_WIDTH = 18).
    expect(outsideSolid).toBeGreaterThan(100);
    expect(insideSolid).toBeLessThanOrEqual(18);
  });

  it("first advance() spawns exactly one BossLaundry and three SoftenerBuffs", () => {
    const gen = createArenaGenerator(makeOpts());
    const result = gen.advance(0, 0);
    const bosses = result.newEntities.filter((e) => e.tag === "BossLaundry");
    const buffs = result.newEntities.filter((e) => e.tag === "SoftenerBuff");
    expect(bosses).toHaveLength(1);
    expect(buffs).toHaveLength(3);
    expect(bosses[0]!.kind).toBe("enemy");
    expect(buffs[0]!.kind).toBe("buff");
  });

  it("subsequent advance() emits no new entities", () => {
    const gen = createArenaGenerator(makeOpts());
    gen.advance(0, 0);
    const second = gen.advance(0, 0);
    expect(second.newEntities).toHaveLength(0);
  });

  it("subsequent advance() does not emit walls again", () => {
    const gen = createArenaGenerator(makeOpts());
    gen.advance(0, 0);
    // Burn one tick (no platform should toggle this fast — minimum
    // visible/hidden duration is 1.8s, and dt is 1/120s).
    const second = gen.advance(0, 0);
    // Walls are static — should not appear in delta.
    const r2 = ARENA_RADIUS * ARENA_RADIUS;
    for (const t of second.newTiles) {
      const dx = t.tx - ARENA_CENTRE_X;
      const dy = t.ty - ARENA_CENTRE_Y;
      // Any tile beyond the circle would be a wall re-emit (bug).
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(r2);
    }
  });
});

describe("ArenaGenerator — fade platforms", () => {
  it("eventually toggles a platform within ~3 seconds", () => {
    const gen = createArenaGenerator(makeOpts());
    gen.advance(0, 0);
    let toggled = false;
    const STEPS = Math.ceil(3.0 * 120);
    for (let i = 0; i < STEPS; i++) {
      const r = gen.advance(0, 0);
      if (r.newTiles.length > 0) {
        toggled = true;
        break;
      }
    }
    expect(toggled).toBe(true);
  });
});
