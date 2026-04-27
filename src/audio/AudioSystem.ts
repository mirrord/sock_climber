import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { AudioBus } from "./AudioBus.js";
import type { SfxRegistry, SfxId } from "./SfxRegistry.js";

/**
 * AudioSystem — subscribes to {@link GameEvents} and triggers SFX playback
 * via {@link AudioBus} + {@link SfxRegistry}.
 *
 * Hooks fire from the event bus (not per-frame polling). Call {@link destroy}
 * to unsubscribe all handlers.
 */
export class AudioSystem {
  private readonly _bus: AudioBus;
  private readonly _registry: SfxRegistry;
  private readonly _unsubs: Unsubscribe[] = [];

  constructor(
    eventBus: EventBus<GameEvents>,
    audioBus: AudioBus,
    registry: SfxRegistry,
  ) {
    this._bus = audioBus;
    this._registry = registry;

    this._unsubs.push(
      eventBus.on("onJump", () => this._play("jump")),
      eventBus.on("onLand", () => this._play("land")),
      eventBus.on("onDash", () => this._play("dash")),
      eventBus.on("onAttack", () => this._play("attack")),
      eventBus.on("onHit", () => this._play("hit")),
      eventBus.on("onKill", () => this._play("kill")),
      eventBus.on("onPatchApplied", () => this._play("patchApplied")),
      eventBus.on("onPickup", () => this._play("pickup")),
      eventBus.on("onSegmentCross", () => this._play("segmentCross")),
      eventBus.on("onPlayerDeath", () => this._play("playerDeath")),
    );
  }

  /** Unsubscribe all event handlers. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
  }

  private _play(id: SfxId): void {
    const buffer = this._registry.get(id);
    if (buffer !== undefined) {
      this._bus.playSfx(buffer);
    }
  }
}
