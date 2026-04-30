/** Token returned by `on()`. Pass to `off()` to unsubscribe. */
export type Unsubscribe = () => void;

/** Typed event bus for cross-system communication. */
export interface EventBus<Events extends Record<string, unknown>> {
  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * Subscribers are called in registration order.
   */
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): Unsubscribe;

  /**
   * Unsubscribe a specific handler from an event.
   * Safe to call mid-emit; the handler will not be called again in the current emit.
   */
  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void;

  /**
   * Emit an event, calling all current subscribers.
   * Subscribers added during emit are not called in the current dispatch.
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;

  /** Remove all subscriptions for all events. */
  clear(): void;
}

type Handler<T> = (payload: T) => void;

/**
 * Creates a typed event bus.
 *
 * @example
 * type GameEvents = { onKill: { enemyId: number }; onHit: { damage: number } };
 * const bus = createEventBus<GameEvents>();
 * const unsub = bus.on("onKill", ({ enemyId }) => console.log(enemyId));
 * bus.emit("onKill", { enemyId: 42 });
 * unsub();
 */
export function createEventBus<Events extends Record<string, unknown>>(): EventBus<Events> {
  // Use a Map of arrays; entries are set to null when removed mid-emit.
  const listeners = new Map<keyof Events, Array<Handler<unknown> | null>>();

  function getOrCreate<K extends keyof Events>(event: K): Array<Handler<unknown> | null> {
    let arr = listeners.get(event);
    if (arr === undefined) {
      arr = [];
      listeners.set(event, arr);
    }
    return arr;
  }

  function on<K extends keyof Events>(
    event: K,
    handler: Handler<Events[K]>,
  ): Unsubscribe {
    const arr = getOrCreate(event);
    arr.push(handler as Handler<unknown>);
    return () => off(event, handler);
  }

  function off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    const arr = listeners.get(event);
    if (arr === undefined) return;
    const idx = arr.indexOf(handler as Handler<unknown>);
    if (idx !== -1) {
      // Null the slot to be mid-emit safe; compacted after emit.
      arr[idx] = null;
    }
  }

  function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const arr = listeners.get(event);
    if (arr === undefined) return;

    // Snapshot length so newly added handlers aren't called this emit.
    const len = arr.length;
    for (let i = 0; i < len; i++) {
      const h = arr[i];
      if (h != null) h(payload as unknown);
    }

    // Compact nulled-out entries.
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] === null) arr.splice(i, 1);
    }
  }

  function clear(): void {
    listeners.clear();
  }

  return { on, off, emit, clear };
}

/** Standard game-event map. Extend as phases add systems. */
export type GameEvents = {
  onKill: { entityId: number };
  onHit: { entityId: number; damage: number };
  onSegmentCross: { segmentId: number };
  onPlayerDeath: { reason: string };
  onPatchApplied: { patchId: string };
  // ─── Phase 9: Audio hook events ───────────────────────────────────────
  /** Emitted by Player when any jump is executed (ground, coyote, wall kick, air). */
  onJump: Record<string, never>;
  /** Emitted by Player on the frame the player transitions from airborne to grounded. */
  onLand: Record<string, never>;
  /** Emitted by Player when a dash starts. */
  onDash: Record<string, never>;
  /** Emitted by Player when an active dash ends (timer expired or jump-cancelled). */
  onDashEnd: Record<string, never>;
  /** Emitted by Player when a wall-kick (jump off a wall) fires. */
  onWallKick: Record<string, never>;
  /** Emitted by Player when damage was actually applied (i-frames did not block). */
  onPlayerHurt: { damage: number };
  /** Emitted by CombatSystem when an attack starts. */
  onAttack: Record<string, never>;
  /** Emitted by Player when a spring charge is released (impulse applied). */
  onSpringRelease: Record<string, never>;
  /** Emitted by any system when the player picks up an item. */
  onPickup: { itemId: string };
  // ─── Phase 8: UI events ───────────────────────────────────────────────
  /** Emitted by Player after takeDamage / gainContainer / consumeEmptyContainer. */
  onHpChanged: { current: number; max: number; empty: number };
  /** Emitted by UpgradeSystem whenever the gauge fill fraction changes. */
  onGaugeChanged: { fill: number };
  /** Emitted by UpgradeSystem when the gauge reaches 1 and a picker offer is ready. */
  onGaugeFull: Record<string, never>;
  /** Emitted by Player buff system when a temporary buff is applied. */
  onBuffApplied: { buffId: string; duration: number };
  /** Emitted by Player buff system when a temporary buff expires. */
  onBuffExpired: { buffId: string };
  /** Emitted on the frame the player first overlaps a Gum trigger volume. */
  onGumEnter: Record<string, never>;
  /** Emitted by ScoreSystem when the climbed distance increases by ≥ 1 m. */
  onDistanceChanged: { distance: number };
  /** Emitted by Title screen when the player starts a new run. */
  onGameStart: Record<string, never>;
  /** Emitted to pause game simulation and show the pause menu. */
  onPause: Record<string, never>;
  /** Emitted to resume game simulation from the pause menu. */
  onResume: Record<string, never>;
  /**
   * Emitted by `UpgradeSystem` when the player invokes the patch picker
   * (typically via the `ApplyPatch` input). Halts simulation but does NOT
   * show the pause menu.
   */
  onPickerOpen: Record<string, never>;
  /** Emitted when the patch picker closes (selection made). Resumes simulation. */
  onPickerClose: Record<string, never>;
  /**
   * Emitted by a Keys enemy on the frame it enters its Telegraph state.
   * Payload carries the enemy's world position so audio + particle effects
   * can localise themselves to the source.
   */
  onKeysTelegraph: { x: number; y: number };
};
