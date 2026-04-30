import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { Generator, SpawnedEntity } from "../level/Generator.js";
import { applyTilesToWorld } from "../level/Generator.js";
import type { TileWorld } from "../physics/TileWorld.js";

/**
 * SpawnSystem — bridges the level `Generator` into the live entity list.
 *
 * Call `advance(cameraY, deathPlaneY)` once per frame. It drives the generator,
 * applies new tiles to the world, manages the live entity set, and fires
 * `onSegmentCross` on the event bus when a segment boundary is crossed.
 */
export class SpawnSystem {
  private _gen: Generator;
  private readonly _world: TileWorld;
  private readonly _bus: EventBus<GameEvents>;
  private readonly _liveEntities: SpawnedEntity[] = [];
  private _segmentId = 0;

  constructor(gen: Generator, world: TileWorld, bus: EventBus<GameEvents>) {
    this._gen = gen;
    this._world = world;
    this._bus = bus;
  }

  /**
   * Advance generation and update the live entity set.
   *
   * @param cameraY    - Current world-tile Y of the camera (decreases as player climbs).
   * @param deathPlaneY - Current world-tile Y of the death plane.
   */
  advance(cameraY: number, deathPlaneY: number): void {
    const result = this._gen.advance(cameraY, deathPlaneY);

    // Apply new tiles to the physics world.
    applyTilesToWorld(result.newTiles, this._world);

    // Add new entities.
    for (const spawned of result.newEntities) {
      // Allow entities that opt in via `attachBus` (e.g. Keys) to publish
      // their own gameplay events. Avoids threading the bus through every
      // generator / registry factory.
      const maybeBusAware = spawned.entity as unknown as {
        attachBus?: (bus: EventBus<GameEvents>) => void;
      };
      if (typeof maybeBusAware.attachBus === "function") {
        maybeBusAware.attachBus(this._bus);
      }
      this._liveEntities.push(spawned);
    }

    // Remove despawned entities.
    if (result.despawnedEntityIds.length > 0) {
      const toRemove = new Set(result.despawnedEntityIds);
      for (let i = this._liveEntities.length - 1; i >= 0; i--) {
        if (toRemove.has(this._liveEntities[i]!.entity.id)) {
          this._liveEntities.splice(i, 1);
        }
      }
    }

    // Fire segment-cross event.
    if (result.segmentCrossed) {
      this._bus.emit("onSegmentCross", { segmentId: this._segmentId++ });
    }
  }

  /** All currently live entities managed by this system. */
  get liveEntities(): readonly SpawnedEntity[] {
    return this._liveEntities;
  }

  /**
   * Remove a single live entity by id (used by the game loop to cull
   * defeated enemies and consumed/expired buffs without waiting for the
   * generator's death-plane despawn pass).
   *
   * @returns `true` if an entity was removed, `false` if no match.
   */
  removeById(id: number): boolean {
    for (let i = this._liveEntities.length - 1; i >= 0; i--) {
      if (this._liveEntities[i]!.entity.id === id) {
        this._liveEntities.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all live entities, reset the segment counter, and swap in a new
   * generator for the next run.
   */
  reset(gen: Generator): void {
    this._liveEntities.length = 0;
    this._segmentId = 0;
    this._gen = gen;
  }
}
