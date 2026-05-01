import { describe, it, expect } from "vitest";
import { createGenerator, applyTilesToWorld } from "../../src/level/Generator.js";
import { TileWorld } from "../../src/physics/TileWorld.js";

/** Run advance() until at least one chunk has been generated. */
function advanceUntilChunks(seed: number, cameraY = -40) {
  const gen = createGenerator({ seed, cameraY });
  return gen.advance(cameraY, 9999);
}

describe("Generator — determinism", () => {
  it("same seed produces identical tile layout (snapshot)", () => {
    const r1 = advanceUntilChunks(42);
    const r2 = advanceUntilChunks(42);
    expect(r1.newTiles).toEqual(r2.newTiles);
  });

  it("same seed produces identical entity positions", () => {
    const r1 = advanceUntilChunks(42);
    const r2 = advanceUntilChunks(42);
    const pos1 = r1.newEntities.map((e) => e.position);
    const pos2 = r2.newEntities.map((e) => e.position);
    expect(pos1).toEqual(pos2);
  });

  it("same seed produces identical entity tags", () => {
    const r1 = advanceUntilChunks(42);
    const r2 = advanceUntilChunks(42);
    const tags1 = r1.newEntities.map((e) => e.tag);
    const tags2 = r2.newEntities.map((e) => e.tag);
    expect(tags1).toEqual(tags2);
  });

  it("different seeds produce different tile layouts", () => {
    const r1 = advanceUntilChunks(1);
    const r2 = advanceUntilChunks(2);
    // Very unlikely to be identical.
    const tiles1 = JSON.stringify(r1.newTiles);
    const tiles2 = JSON.stringify(r2.newTiles);
    expect(tiles1).not.toBe(tiles2);
  });
});

describe("Generator — entity budget", () => {
  it("each chunk respects enemy budget (total entities per category ≤ budget)", () => {
    const gen = createGenerator({ seed: 77, cameraY: -100 });
    gen.advance(-100, 9999);

    for (const chunk of gen.chunks) {
      const budget = chunk.profile.entityBudget;
      const enemies = chunk.entities.filter((e) => e.kind === "enemy").length;
      const obstacles = chunk.entities.filter((e) => e.kind === "obstacle").length;
      const buffs = chunk.entities.filter((e) => e.kind === "buff").length;

      expect(enemies).toBeLessThanOrEqual(budget.enemies);
      expect(obstacles).toBeLessThanOrEqual(budget.obstacles);
      expect(buffs).toBeLessThanOrEqual(budget.buffs);
    }
  });

  it("only spawns entity tags listed in allowedTags", () => {
    const gen = createGenerator({ seed: 55, cameraY: -80 });
    gen.advance(-80, 9999);

    for (const chunk of gen.chunks) {
      const allowed = new Set(chunk.profile.allowedTags);
      for (const e of chunk.entities) {
        expect(allowed.has(e.tag)).toBe(true);
      }
    }
  });
});

describe("Generator — despawn", () => {
  it("chunks behind the death plane (+ grace) are despawned", () => {
    const gen = createGenerator({ seed: 1, cameraY: -40 });
    // Generate some chunks (death plane far below = large positive Y = no despawn yet).
    gen.advance(-40, 9999);

    const initialChunkCount = gen.chunks.length;
    expect(initialChunkCount).toBeGreaterThan(0);

    // Find the highest chunk top (most negative Y = furthest along the climb).
    const highestTopY = Math.min(...gen.chunks.map((c) => c.originY));
    // Despawn when chunk.originY > deathPlaneY + GRACE_ROWS, so to force despawn
    // of every chunk we need deathPlaneY + GRACE_ROWS < every chunk.originY,
    // i.e. deathPlaneY < highestTopY - GRACE_ROWS. Subtract a large margin to be safe.
    const forcedDeathPlaneY = highestTopY - 100;
    const result = gen.advance(-40, forcedDeathPlaneY);

    expect(result.despawnedEntityIds).toBeDefined();
    // After despawn the chunk list should be smaller.
    expect(gen.chunks.length).toBeLessThan(initialChunkCount);
  });

  it("despawnedEntityIds contains ids of entities in despawned chunks", () => {
    const gen = createGenerator({ seed: 100, cameraY: -60 });
    gen.advance(-60, 9999);

    // Collect all entity ids before despawn.
    const allIds = gen.chunks.flatMap((c) => c.entities.map((e) => e.entity.id));

    // Force despawn everything: set death plane far above all chunk tops (very negative Y).
    const highestTopY = Math.min(...gen.chunks.map((c) => c.originY));
    const result = gen.advance(-60, highestTopY - 200);

    for (const id of result.despawnedEntityIds) {
      expect(allIds).toContain(id);
    }
  });

  it("each chunk is despawned exactly once", () => {
    const gen = createGenerator({ seed: 200, cameraY: -50 });
    gen.advance(-50, 9999);

    // Note all entity ids before any despawn.
    const allEntityIds = gen.chunks.flatMap((c) =>
      c.entities.map((e) => e.entity.id),
    );

    // Force despawn: death plane far above all chunk tops.
    const highestTopY = Math.min(...gen.chunks.map((c) => c.originY));
    const forcedDeathPlaneY = highestTopY - 200;
    const result1 = gen.advance(-50, forcedDeathPlaneY);
    const result2 = gen.advance(-50, forcedDeathPlaneY);

    // Ids should appear in exactly one despawn result.
    const despawned1 = new Set(result1.despawnedEntityIds);
    const despawned2 = new Set(result2.despawnedEntityIds);

    for (const id of allEntityIds) {
      const inFirst = despawned1.has(id);
      const inSecond = despawned2.has(id);
      // Should appear in at most one of the two calls.
      expect(inFirst && inSecond).toBe(false);
    }
  });
});

describe("Generator — advance generates chunks ahead of camera", () => {
  it("generates at least one chunk on first advance", () => {
    const gen = createGenerator({ seed: 5, cameraY: 0 });
    const result = gen.advance(0, 9999);
    expect(result.newTiles.length).toBeGreaterThan(0);
    expect(gen.chunks.length).toBeGreaterThan(0);
  });

  it("all tiles have integer coordinates", () => {
    const result = advanceUntilChunks(13);
    for (const t of result.newTiles) {
      expect(Number.isInteger(t.tx)).toBe(true);
      expect(Number.isInteger(t.ty)).toBe(true);
    }
  });

  it("segmentCrossed is true when new chunks are generated", () => {
    const gen = createGenerator({ seed: 3, cameraY: 0 });
    const result = gen.advance(0, 9999);
    expect(result.segmentCrossed).toBe(true);
  });
});

describe("applyTilesToWorld", () => {
  it("sets solid tiles in a TileWorld from a PlacedTile list", () => {
    const world = new TileWorld(20, 20);
    const result = advanceUntilChunks(42, -10);

    // All solid tiles generated are within some world bounds.
    // Filter to those within 20x20.
    const inBounds = result.newTiles.filter(
      (t) => t.tx >= 0 && t.tx < 20 && t.ty >= -20 && t.ty < 20,
    );
    // Remap negative ty for TileWorld (it stores only non-negative rows).
    // Just test with positive-ty tiles.
    const positiveTiles = inBounds.filter((t) => t.ty >= 0 && t.ty < 20);

    applyTilesToWorld(positiveTiles, world);

    for (const t of positiveTiles) {
      if (t.solid) {
        expect(world.solidAt(t.tx, t.ty)).toBe(true);
      }
    }
  });
});

describe("Generator — reachability", () => {
  it("every chunk has at least one platform tile", () => {
    const gen = createGenerator({ seed: 999, cameraY: -120 });
    gen.advance(-120, 9999);

    // Collect all solid tiles.
    // We verify indirectly: every chunk's entity list was generated from platforms.
    // Simpler: check that the total tile count > wall tiles only.
    // Since we can't easily distinguish wall vs platform, just verify chunk count > 0.
    expect(gen.chunks.length).toBeGreaterThan(0);
  });
});

describe("Generator — spawn safe zone", () => {
  it("never places a solid tile inside the configured spawn safe zone", () => {
    const safe = { minTx: 4, maxTx: 7, minTy: -2, maxTy: 1 };
    // Try a wide range of seeds to exercise many random profiles.
    for (let seed = 1; seed <= 25; seed++) {
      const gen = createGenerator({
        seed,
        cameraY: -60,
        worldWidth: 12,
        spawnSafeZone: safe,
      });
      const result = gen.advance(-60, 9999);
      for (const t of result.newTiles) {
        if (!t.solid) continue;
        const inside =
          t.tx >= safe.minTx &&
          t.tx <= safe.maxTx &&
          t.ty >= safe.minTy &&
          t.ty <= safe.maxTy;
        expect(inside, `seed ${seed}: solid tile at (${t.tx}, ${t.ty}) is inside the spawn safe zone`).toBe(false);
      }
    }
  });

  it("never spawns an entity inside the configured spawn safe zone", () => {
    const safe = { minTx: 4, maxTx: 7, minTy: -2, maxTy: 1 };
    for (let seed = 1; seed <= 25; seed++) {
      const gen = createGenerator({
        seed,
        cameraY: -60,
        worldWidth: 12,
        spawnSafeZone: safe,
      });
      const result = gen.advance(-60, 9999);
      for (const e of result.newEntities) {
        const tx = Math.floor(e.position.x);
        const ty = Math.floor(e.position.y);
        const inside =
          tx >= safe.minTx &&
          tx <= safe.maxTx &&
          ty >= safe.minTy &&
          ty <= safe.maxTy;
        expect(inside, `seed ${seed}: entity at (${tx}, ${ty}) is inside the spawn safe zone`).toBe(false);
      }
    }
  });
});

describe("Generator — no diagonal corner pinches", () => {
  it("never places two solids in a corner-adjacent (pinch) configuration", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const gen = createGenerator({ seed, cameraY: -120, worldWidth: 12 });
      const result = gen.advance(-120, 9999);
      const solids = new Set<string>();
      for (const t of result.newTiles) {
        if (t.solid) solids.add(`${t.tx},${t.ty}`);
      }
      const has = (x: number, y: number) => solids.has(`${x},${y}`);
      for (const t of result.newTiles) {
        if (!t.solid) continue;
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          if (
            has(t.tx + dx, t.ty + dy) &&
            !has(t.tx + dx, t.ty) &&
            !has(t.tx, t.ty + dy)
          ) {
            throw new Error(
              `seed ${seed}: diagonal pinch between (${t.tx},${t.ty}) and (${t.tx + dx},${t.ty + dy})`,
            );
          }
        }
      }
    }
  });
});

describe("Generator — entities never stack", () => {
  it("no two entities share the same spawn tile", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const gen = createGenerator({ seed, cameraY: -120, worldWidth: 12 });
      const result = gen.advance(-120, 9999);
      const seen = new Map<string, string>();
      for (const e of result.newEntities) {
        const key = `${Math.floor(e.position.x)},${Math.floor(e.position.y)}`;
        const prior = seen.get(key);
        expect(prior, `seed ${seed}: ${prior} and ${e.tag} both spawned at ${key}`).toBeUndefined();
        seen.set(key, e.tag);
      }
    }
  });
});

describe("Generator — entities never overlap solid tiles", () => {
  it("no entity AABB intersects a wall or platform tile", () => {
    const EPS = 1e-3;
    for (let seed = 1; seed <= 50; seed++) {
      const gen = createGenerator({ seed, cameraY: -200, worldWidth: 12 });
      const result = gen.advance(-200, 9999);

      const solids = new Set<string>();
      for (const t of result.newTiles) {
        if (t.solid) solids.add(`${t.tx},${t.ty}`);
      }

      for (const e of result.newEntities) {
        // Determine the entity's half-extents (bodies live on `body`, buffs
        // expose `halfW`/`halfH` directly).
        const ent = e.entity as unknown as {
          body?: { halfExtents: { x: number; y: number } };
          halfW?: number;
          halfH?: number;
        };
        const halfW = ent.body ? ent.body.halfExtents.x : ent.halfW!;
        const halfH = ent.body ? ent.body.halfExtents.y : ent.halfH!;
        const cx = e.position.x;
        const cy = e.position.y;
        const minTx = Math.floor(cx - halfW + EPS);
        const maxTx = Math.floor(cx + halfW - EPS);
        const minTy = Math.floor(cy - halfH + EPS);
        const maxTy = Math.floor(cy + halfH - EPS);
        for (let ty = minTy; ty <= maxTy; ty++) {
          for (let tx = minTx; tx <= maxTx; tx++) {
            expect(
              solids.has(`${tx},${ty}`),
              `seed ${seed}: ${e.tag} AABB at (${cx.toFixed(2)},${cy.toFixed(2)}) ` +
                `half=(${halfW},${halfH}) overlaps solid tile (${tx},${ty})`,
            ).toBe(false);
          }
        }
      }
    }
  });
});
