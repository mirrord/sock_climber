import { describe, it, expect } from "vitest";
import { SpawnSystem } from "../../src/systems/SpawnSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import type { Generator, AdvanceResult, SpawnedEntity } from "../../src/level/Generator.js";
import { TileWorld } from "../../src/physics/TileWorld.js";
import type { Enemy } from "../../src/entities/enemies/Enemy.js";

// ─── Minimal Generator stub ───────────────────────────────────────────────

function makeEntity(id: number): SpawnedEntity {
  return {
    kind: "enemy",
    tag: "Keys" as const,
    position: { x: 0, y: 0 },
    entity: { id, position: { x: 0, y: 0 }, hp: 1, update() {}, takeDamage: () => true, halfExtents: { x: 0.4, y: 0.4 } } as unknown as Enemy,
  };
}

function makeGenerator(results: AdvanceResult[]): Generator {
  let call = 0;
  return {
    advance(): AdvanceResult {
      return results[call++] ?? { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: false };
    },
    get chunks() {
      return [];
    },
  };
}

function makeWorld(): TileWorld {
  return new TileWorld(100, 100);
}

// ─── Entity lifecycle ─────────────────────────────────────────────────────

describe("SpawnSystem — entity lifecycle", () => {
  it("starts with no live entities", () => {
    const bus = createEventBus<GameEvents>();
    const gen = makeGenerator([]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    expect(sys.liveEntities.length).toBe(0);
  });

  it("adds entities from newEntities after advance()", () => {
    const bus = createEventBus<GameEvents>();
    const entity = makeEntity(1);
    const gen = makeGenerator([
      { newTiles: [], newEntities: [entity], despawnedEntityIds: [], segmentCrossed: false },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    expect(sys.liveEntities.length).toBe(1);
    expect(sys.liveEntities[0]!.entity.id).toBe(1);
  });

  it("removes entities listed in despawnedEntityIds", () => {
    const bus = createEventBus<GameEvents>();
    const e1 = makeEntity(1);
    const e2 = makeEntity(2);
    const gen = makeGenerator([
      { newTiles: [], newEntities: [e1, e2], despawnedEntityIds: [], segmentCrossed: false },
      { newTiles: [], newEntities: [], despawnedEntityIds: [1], segmentCrossed: false },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    sys.advance(0, 20);
    expect(sys.liveEntities.length).toBe(1);
    expect(sys.liveEntities[0]!.entity.id).toBe(2);
  });

  it("no duplicate entity ids in live set after multiple advances", () => {
    const bus = createEventBus<GameEvents>();
    const e1 = makeEntity(1);
    const e2 = makeEntity(2);
    const gen = makeGenerator([
      { newTiles: [], newEntities: [e1], despawnedEntityIds: [], segmentCrossed: false },
      { newTiles: [], newEntities: [e2], despawnedEntityIds: [], segmentCrossed: false },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    sys.advance(0, 20);
    const ids = sys.liveEntities.map((e) => e.entity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Segment cross event ──────────────────────────────────────────────────

describe("SpawnSystem — onSegmentCross", () => {
  it("fires onSegmentCross when segmentCrossed is true", () => {
    const bus = createEventBus<GameEvents>();
    const crossings: number[] = [];
    bus.on("onSegmentCross", ({ segmentId }) => crossings.push(segmentId));

    const gen = makeGenerator([
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: true },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    expect(crossings.length).toBe(1);
  });

  it("does NOT fire onSegmentCross when segmentCrossed is false", () => {
    const bus = createEventBus<GameEvents>();
    let count = 0;
    bus.on("onSegmentCross", () => count++);

    const gen = makeGenerator([
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: false },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    expect(count).toBe(0);
  });

  it("segmentId is monotonically increasing across multiple crossings", () => {
    const bus = createEventBus<GameEvents>();
    const ids: number[] = [];
    bus.on("onSegmentCross", ({ segmentId }) => ids.push(segmentId));

    const gen = makeGenerator([
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: true },
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: true },
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: true },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    sys.advance(0, 20);
    sys.advance(0, 20);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBeLessThan(ids[1]!);
    expect(ids[1]).toBeLessThan(ids[2]!);
  });

  it("fires onSegmentCross exactly once per crossing, not zero or two", () => {
    const bus = createEventBus<GameEvents>();
    let count = 0;
    bus.on("onSegmentCross", () => count++);

    const gen = makeGenerator([
      { newTiles: [], newEntities: [], despawnedEntityIds: [], segmentCrossed: true },
    ]);
    const sys = new SpawnSystem(gen, makeWorld(), bus);
    sys.advance(0, 20);
    expect(count).toBe(1);
  });
});
