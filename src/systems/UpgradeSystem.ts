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

  constructor(
    bus: EventBus<GameEvents>,
    rng: RNG,
    climbDir: ClimbDir = CLIMB_DIR_VERTICAL,
  ) {
    this._bus = bus;
    this._rng = rng;
    this._dir = climbDir;

    bus.on("onKill", () => {
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

    this._gauge = 0;
    this._gaugeFullEmitted = false;
    this._currentOffer = this._sampleOffer(player);
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
    } else {
      // All other patches cost one empty HP container.
      player.consumeEmptyContainer();
      player.applyStatMod(entry.id, entry.statMod);
    }

    this._appliedPatchIds.add(entry.id);
    this._bus.emit("onPatchApplied", { patchId: entry.id });

    this._isPickerOpen = false;
    this._currentOffer = null;
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
    this._lastClimbProgress = null;
    this._gaugeFullEmitted = false;
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

  /** Sample 3 distinct eligible patches without replacement using `_rng`. */
  private _sampleOffer(player: Player): PatchEntry[] {
    const eligible = PATCH_CATALOG.filter((p) =>
      p.isEligible(player, this._appliedPatchIds),
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
