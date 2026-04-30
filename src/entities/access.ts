import type { Body } from "../physics/Body.js";
import type { EventBus, GameEvents } from "../core/EventBus.js";

/**
 * Structural type guards for accessing optional components on the
 * heterogeneous `SpawnedEntity` union (enemies / obstacles / buffs / boss
 * spawns) without importing every concrete entity class.
 *
 * These helpers exist because:
 *   - The renderer ([src/render/Sprites.ts]) needs to read `body`,
 *     `iFrameTimer`, and `spriteVariant` off any spawned entity.
 *   - `SpawnSystem` needs to opt entities into event publishing via
 *     `attachBus` if they expose it.
 *   - `main.ts` needs to read `body` off entities for debug overlays.
 *
 * Each helper performs a runtime probe and is the *single* place a
 * narrowing cast is allowed for that property. Call sites should never
 * use `as unknown as { foo: … }` — call the helper instead.
 */

interface MaybeBody {
  readonly body?: Body;
}

interface MaybeIFrames {
  readonly iFrameTimer?: number;
}

interface MaybeSpriteVariant {
  readonly spriteVariant?: string;
}

interface MaybeBusAware {
  attachBus?: (bus: EventBus<GameEvents>) => void;
}

/**
 * Return the entity's `body` if it has one (enemies, obstacles, boss
 * projectiles, the player), else `null`. Buff pickups intentionally have
 * no body.
 */
export function getBody(entity: unknown): Body | null {
  if (entity === null || typeof entity !== "object") return null;
  const b = (entity as MaybeBody).body;
  return b ?? null;
}

/**
 * Return the entity's i-frame timer (seconds remaining of invulnerability)
 * if it tracks one, else `0`. Used by the renderer to drive the hit-flash
 * blink effect on enemies and the player.
 */
export function getIFrameTimer(entity: unknown): number {
  if (entity === null || typeof entity !== "object") return 0;
  return (entity as MaybeIFrames).iFrameTimer ?? 0;
}

/**
 * Return the entity's current sprite-sheet variant key, if it exposes one
 * (e.g. Keys returns `"KeysTelegraph"` while telegraphing). Falls back to
 * `undefined`, in which case the renderer uses the entity's tag as the
 * sheet key.
 */
export function getSpriteVariant(entity: unknown): string | undefined {
  if (entity === null || typeof entity !== "object") return undefined;
  return (entity as MaybeSpriteVariant).spriteVariant;
}

/**
 * If the entity opts into publishing its own gameplay events via an
 * `attachBus(bus)` method, attach the supplied event bus. No-op
 * otherwise.
 */
export function attachBusIfSupported(
  entity: unknown,
  bus: EventBus<GameEvents>,
): void {
  if (entity === null || typeof entity !== "object") return;
  const attach = (entity as MaybeBusAware).attachBus;
  if (typeof attach === "function") attach.call(entity, bus);
}
