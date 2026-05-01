import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { RNG } from "../core/RNG.js";
import type { Player } from "../entities/Player.js";
import { CLIMB_DIR_VERTICAL, climbProgress, type ClimbDir } from "../level/Axis.js";
import { PATCH_CATALOG } from "./PatchCatalog.js";
import type { PatchEntry } from "./PatchCatalog.js";

/** Fractional gauge fill per enemy kill. */
const FILL_PER_KILL = 0.25;

/**
 * Fractional gauge fill per world-unit (≈ metre) of net upward climb progress.
 * 50 m of net climb = full bar in the absence of kills.
 */
const FILL_PER_CLIMB_UNIT = 1 / 50;

/**
 * UpgradeSystem — manages the upgrade gauge and patch picker.
 *
 * The gauge fills by `FILL_PER_KILL` per `onKill` event and by
 * `FILL_PER_CLIMB_UNIT` per world-unit of net upward climb progress
 * (saturates at 1). When full and the player has at least one empty HP
 * container, the picker opens with 3 randomly sampled eligible patches.
 * Selecting a patch consumes one empty container and applies the stat mod
 * permanently.
 */
export class UpgradeSystem {
  private _gauge = 0;
  private _isPickerOpen = false;
  private _currentOffer: PatchEntry[] | null = null;
  private readonly _appliedPatchIds = new Set<string>();
  /**
   * Per-patch-id apply count. Used to mint a unique stat-mod key for each
   * application of the same patch (e.g. picking `AirDash` twice) so the
   * stat deltas stack additively instead of overwriting each other in the
   * player's stat-mod map.
   */
  private readonly _applyCounts = new Map<string, number>();
  private readonly _bus: EventBus<GameEvents>;
  private readonly _rng: RNG;
  private _dir: ClimbDir;
  /**
   * Highest climb-progress value (along the configured climb direction)
   * the player has reached so far this run. `null` until the first
   * `update()` call after construction or `reset()`, at which point it
   * is baselined to the player's current progress.
   */
  private _lastClimbProgress: number | null = null;
  /**
   * Latched `true` once `_gauge` reaches 1 and `onGaugeFull` has been emitted
   * for the current cycle. Cleared on `selectPatch` / `reset`. Prevents
   * duplicate `onGaugeFull` emissions while the player waits to apply.
   */
  private _gaugeFullEmitted = false;
  /**
   * When `false`, the gauge no longer fills from kills or climb progress.
   * Used by level 4 (the boss arena) where the upgrade pipeline is
   * driven entirely by the pre-run loadout picker instead of in-run
   * gauge fills. Defaults to `true`.
   */
  private _enabled = true;
  /**
   * `true` while the picker is operating in pre-run loadout mode
   * (level 4). Toggled on by `openLoadoutOffer`; consumed and cleared
   * by the next `selectPatch` so the cost-skip applies to exactly one
   * pick per opening.
   */
  private _loadoutMode = false;

  constructor(
    bus: EventBus<GameEvents>,
    rng: RNG,
    climbDir: ClimbDir = CLIMB_DIR_VERTICAL,
  ) {
    this._bus = bus;
    this._rng = rng;
    this._dir = climbDir;

    bus.on("onKill", () => {
      if (!this._enabled) return;
      this._gauge = Math.min(1, this._gauge + FILL_PER_KILL);
      bus.emit("onGaugeChanged", { fill: this._gauge });
      this._maybeEmitGaugeFull();
    });
  }

  /**
   * Call once per fixed step. Adds climb-derived fill since the last call.
   * The picker is no longer auto-opened here — the player must invoke it
   * explicitly via {@link tryOpenPicker} (bound to the `ApplyPatch` input).
   *
   * For path-axis climb directions (level 3) `pathProgress` must be
   * supplied — the bare body position is opaque to this system.
   */
  update(player: Player, pathProgress?: number): void {
    if (!this._enabled) return;
    // ─── Climb-based fill ──────────────────────────────────────────────
    // Forward climb progress depends on the active climb direction:
    // level 1 (axis="y", sign=-1) → progress = -y; level 2 (axis="x",
    // sign=+1) → progress = +x; level 3 (axis="path") → caller-supplied
    // arc length. Only forward gains add to the gauge.
    const progress = climbProgress(player.body.position, this._dir, pathProgress);
    if (this._lastClimbProgress === null) {
      this._lastClimbProgress = progress;
    } else if (progress > this._lastClimbProgress) {
      const delta = progress - this._lastClimbProgress;
      this._lastClimbProgress = progress;
      const before = this._gauge;
      this._gauge = Math.min(1, this._gauge + delta * FILL_PER_CLIMB_UNIT);
      if (this._gauge !== before) {
        this._bus.emit("onGaugeChanged", { fill: this._gauge });
        this._maybeEmitGaugeFull();
      }
    }
  }

  /**
   * Reconfigure the climb direction (e.g. when switching levels). The
   * climb-progress baseline is cleared so the next `update()` re-baselines
   * against the new axis without spuriously filling the gauge.
   */
  setClimbDir(dir: ClimbDir): void {
    this._dir = dir;
    this._lastClimbProgress = null;
  }

  /**
   * Enable or disable in-run gauge fills (kills + climb progress).
   * Disabling on level 4 keeps the gauge permanently empty so the
   * mid-run patch picker can never auto-open; the pre-run loadout
   * picker is invoked separately via {@link openLoadoutOffer}.
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this._gauge = 0;
      this._gaugeFullEmitted = false;
      this._bus.emit("onGaugeChanged", { fill: 0 });
    }
  }

  /** `true` if in-run gauge fills are accepted. */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Open the patch picker in "loadout" mode — a pre-run draft used by
   * level 4. Bypasses the gauge requirement and arms the next
   * `selectPatch` call so it does not consume an empty HP container.
   * Returns the offer the UI should present.
   */
  openLoadoutOffer(player: Player): readonly PatchEntry[] {
    this._loadoutMode = true;
    this._currentOffer = this._sampleOffer(player);
    this._isPickerOpen = true;
    this._bus.emit("onPickerOpen", {});
    return this._currentOffer;
  }

  /**
   * Attempt to open the patch picker. Succeeds whenever the gauge is full
   * (the only requirement — the offer itself is filtered to patches the
   * player can actually apply, e.g. non-`ExtraHP` patches require an empty
   * HP container). Emits `onPickerOpen` on success.
   *
   * @returns `true` if the picker was opened, `false` otherwise.
   */
  tryOpenPicker(player: Player): boolean {
    if (this._isPickerOpen) return false;
    if (this._gauge < 1) return false;

    // Sample the offer first. If no eligible patches exist (e.g. player is
    // at full HP after already taking ExtraHP, so no empty container is
    // available to "spend" and ExtraHP is exhausted), refuse to open the
    // picker rather than presenting an empty modal that the player cannot
    // dismiss (the picker intentionally blocks Escape). The gauge is left
    // full so the player can retry after taking damage frees a container.
    const offer = this._sampleOffer(player);
    if (offer.length === 0) return false;

    this._gauge = 0;
    this._gaugeFullEmitted = false;
    this._currentOffer = offer;
    this._isPickerOpen = true;
    this._bus.emit("onGaugeChanged", { fill: 0 });
    this._bus.emit("onPickerOpen", {});
    return true;
  }

  /**
   * Apply the patch at the given index in the current offer.
   * Consumes one empty HP container and applies the stat mod, then emits
   * `onPickerClose` so the simulation can resume.
   *
   * @param index  - 0, 1, or 2.
   * @param player - The player to apply the patch to.
   */
  selectPatch(index: 0 | 1 | 2, player: Player): void {
    if (!this._isPickerOpen || this._currentOffer === null) return;

    const entry = this._currentOffer[index];
    if (entry === undefined) return;

    if (entry.id === "ExtraHP") {
      // ExtraHP is unique: it adds a new full HP container without consuming an empty slot.
      player.gainContainer();
    } else if (this._loadoutMode) {
      // Pre-run loadout: skip the empty-container cost so the player
      // doesn't need to take damage before the run begins.
      player.applyStatMod(this._nextStatModKey(entry.id), entry.statMod);
    } else {
      // All other patches cost one empty HP container.
      player.consumeEmptyContainer();
      player.applyStatMod(this._nextStatModKey(entry.id), entry.statMod);
    }

    this._appliedPatchIds.add(entry.id);
    this._bus.emit("onPatchApplied", { patchId: entry.id });

    this._isPickerOpen = false;
    this._currentOffer = null;
    // Loadout mode is single-shot per opening; clear so subsequent
    // mid-run pickings (none in level 4 in practice, but defensive)
    // pay the normal HP-container cost.
    this._loadoutMode = false;
    this._bus.emit("onPickerClose", {});
  }

  /**
   * Dismiss the picker without applying any patch.
   * The gauge cost was already paid when the picker opened, so skipping
   * forfeits the upgrade cycle. No `onPatchApplied` is emitted.
   */
  skipPick(): void {
    if (!this._isPickerOpen) return;
    this._isPickerOpen = false;
    this._currentOffer = null;
    this._loadoutMode = false;
    this._bus.emit("onPickerClose", {});
  }

  /** Upgrade gauge, clamped to [0, 1]. */
  get gauge(): number {
    return this._gauge;
  }

  /** `true` while the patch picker is waiting for a selection. */
  get isPickerOpen(): boolean {
    return this._isPickerOpen;
  }

  /** The 3 patch choices currently on offer, or `null` if picker is closed. */
  get currentOffer(): readonly PatchEntry[] | null {
    return this._currentOffer;
  }

  /** Reset gauge, offer, and applied-patch history for a new run. */
  reset(): void {
    this._gauge = 0;
    this._isPickerOpen = false;
    this._currentOffer = null;
    this._appliedPatchIds.clear();
    this._applyCounts.clear();
    this._lastClimbProgress = null;
    this._gaugeFullEmitted = false;
    this._loadoutMode = false;
    this._enabled = true;
    this._bus.emit("onGaugeChanged", { fill: 0 });
  }

  /**
   * Emit `onGaugeFull` exactly once per fill cycle (transition to ≥ 1).
   * Latch is cleared by `tryOpenPicker` (when the picker actually opens) and
   * by `reset()`.
   */
  private _maybeEmitGaugeFull(): void {
    if (this._gaugeFullEmitted) return;
    if (this._gauge < 1) return;
    this._gaugeFullEmitted = true;
    this._bus.emit("onGaugeFull", {});
  }

  /**
   * Mint a unique stat-mod key for the given patch id, incrementing the
   * per-id apply counter. The first application uses the bare id (so
   * existing buff/gum keying conventions still match); subsequent
   * applications append `#N` to keep the player's stat-mod map entries
   * distinct so multiple stacks of the same patch accumulate additively.
   */
  private _nextStatModKey(id: string): string {
    const count = (this._applyCounts.get(id) ?? 0) + 1;
    this._applyCounts.set(id, count);
    return count === 1 ? id : `${id}#${count}`;
  }

  /** Sample 3 distinct eligible patches without replacement using `_rng`. */
  private _sampleOffer(player: Player): PatchEntry[] {
    const eligible = PATCH_CATALOG.filter((p) =>
      p.isEligible(player, this._appliedPatchIds, {
        ignoreContainerCost: this._loadoutMode,
      }),
    );

    // Shuffle eligible entries using Fisher-Yates via the seeded RNG.
    const pool = eligible.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this._rng.next() * (i + 1));
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }

    return pool.slice(0, 3);
  }
}
