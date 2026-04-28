import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { AudioBus, SfxHandle } from "./AudioBus.js";
import type { SfxRegistry, SfxId } from "./SfxRegistry.js";

/**
 * AudioSystem — subscribes to {@link GameEvents} and triggers SFX playback
 * via {@link AudioBus} + {@link SfxRegistry}.
 *
 * Hooks fire from the event bus (not per-frame polling). Call {@link destroy}
 * to unsubscribe all handlers.
 *
 * Some sounds (dash, spring release) are tracked so they can be interrupted
 * when the underlying gameplay event is interrupted (dash ends early, the
 * player is hurt or dies). The {@link AudioBus.playSfx} handle returned for
 * each tracked sound is retained until either the corresponding "end" event
 * fires or it is replaced by a new playback of the same sound.
 */
export class AudioSystem {
  private readonly _bus: AudioBus;
  private readonly _registry: SfxRegistry;
  private readonly _unsubs: Unsubscribe[] = [];

  /** Currently playing dash voice, or null when no dash sfx is active. */
  private _dashHandle: SfxHandle | null = null;
  /** Currently playing spring-release voice, or null when none is active. */
  private _springHandle: SfxHandle | null = null;

  constructor(
    eventBus: EventBus<GameEvents>,
    audioBus: AudioBus,
    registry: SfxRegistry,
  ) {
    this._bus = audioBus;
    this._registry = registry;

    this._unsubs.push(
      eventBus.on("onGameStart", () => this._play("levelStart")),
      eventBus.on("onJump", () => this._play("jump")),
      eventBus.on("onLand", () => this._play("land")),
      eventBus.on("onDash", () => {
        // Replace any in-flight dash sfx so back-to-back dashes don't overlap.
        this._dashHandle?.stop();
        this._dashHandle = this._play("dash");
      }),
      eventBus.on("onDashEnd", () => {
        this._dashHandle?.stop();
        this._dashHandle = null;
      }),
      eventBus.on("onWallKick", () => this._play("wallKick")),
      eventBus.on("onAttack", () => this._play("attack")),
      eventBus.on("onHit", () => this._play("hit")),
      eventBus.on("onKill", () => this._play("kill")),
      eventBus.on("onPatchApplied", () => this._play("patchApplied")),
      eventBus.on("onPickup", () => this._play("pickup")),
      eventBus.on("onSegmentCross", () => this._play("segmentCross")),
      eventBus.on("onBuffApplied", () => this._play("buffApplied")),
      eventBus.on("onGumEnter", () => this._play("gumEnter")),
      eventBus.on("onSpringRelease", () => {
        this._springHandle?.stop();
        this._springHandle = this._play("springRelease");
      }),
      eventBus.on("onPlayerHurt", () => {
        // Damage interrupts in-flight movement sfx so they don't bleed past
        // the knockback / hit-stop frames.
        this._stopInterruptible();
        this._play("playerHurt");
      }),
      eventBus.on("onPlayerDeath", () => {
        this._stopInterruptible();
        this._play("playerDeath");
      }),
    );
  }

  /** Unsubscribe all event handlers. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._stopInterruptible();
  }

  private _play(id: SfxId): SfxHandle | null {
    const buffer = this._registry.get(id);
    if (buffer === undefined) return null;
    return this._bus.playSfx(buffer);
  }

  private _stopInterruptible(): void {
    this._dashHandle?.stop();
    this._dashHandle = null;
    this._springHandle?.stop();
    this._springHandle = null;
  }
}
