import { describe, it, expect } from "vitest";
import { SpawnSystem } from "../../src/systems/SpawnSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import type { Generator, AdvanceResult, SpawnedEntity } from "../../src/level/Generator.js";
import { TileWorld } from "../../src/physics/TileWorld.js";
import type { Enemy } from "../../src/entities/enemies/Enemy.js";

function makeEntity(id: number): SpawnedEntity {
  return {
    kind: "enemy",
    tag: "Keys" as const,
    position: { x: 0, y: 0 },
    entity: {
      id,
      position: { x: 0, y: 0 },
      hp: 1,
      update() {},
      takeDamage: () => true,
      halfExtents: { x: 0.4, y: 0.4 },
    } as unknown as Enemy,
  };
}

function makeGenerator(results: AdvanceResult[]): Generator {
  let call = 0;
  return {
    advance(): AdvanceResult {
      return (
        results[call++] ?? {
          newTiles: [],
          newEntities: [],
          despawnedEntityIds: [],
          segmentCrossed: false,
        }
      );
    },
    get chunks() {
      return [];
    },
  };
}

describe("SpawnSystem.removeById", () => {
  it("removes the entity with the matching id and returns true", () => {
    const bus = createEventBus<GameEvents>();
    const e1 = makeEntity(1);
    const e2 = makeEntity(2);
    const sys = new SpawnSystem(
      makeGenerator([
        { newTiles: [], newEntities: [e1, e2], despawnedEntityIds: [], segmentCrossed: false },
      ]),
      new TileWorld(10, 10),
      bus,
    );
    sys.advance(0, 20);

    const removed = sys.removeById(1);

    expect(removed).toBe(true);
    expect(sys.liveEntities.length).toBe(1);
    expect(sys.liveEntities[0]!.entity.id).toBe(2);
  });

  it("returns false when no entity matches the id", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new SpawnSystem(
      makeGenerator([
        { newTiles: [], newEntities: [makeEntity(1)], despawnedEntityIds: [], segmentCrossed: false },
      ]),
      new TileWorld(10, 10),
      bus,
    );
    sys.advance(0, 20);

    expect(sys.removeById(999)).toBe(false);
    expect(sys.liveEntities.length).toBe(1);
  });
});
