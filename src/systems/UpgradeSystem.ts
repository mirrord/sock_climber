import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { RNG } from "../core/RNG.js";
import type { Player } from "../entities/Player.js";
import { PATCH_CATALOG } from "./PatchCatalog.js";
import type { PatchEntry } from "./PatchCatalog.js";

/** Fractional gauge fill per enemy kill. */
const FILL_PER_KILL = 0.25;

/**
 * UpgradeSystem — manages the upgrade gauge and patch picker.
 *
 * The gauge fills by `FILL_PER_KILL` per `onKill` event (saturates at 1).
 * When full and the player has at least one empty HP container, the picker
 * opens with 3 randomly sampled eligible patches. Selecting a patch consumes
 * one empty container and applies the stat mod permanently.
 */
export class UpgradeSystem {
  private _gauge = 0;
  private _isPickerOpen = false;
  private _currentOffer: PatchEntry[] | null = null;
  private readonly _appliedPatchIds = new Set<string>();
  private readonly _bus: EventBus<GameEvents>;
  private readonly _rng: RNG;

  constructor(bus: EventBus<GameEvents>, rng: RNG) {
    this._bus = bus;
    this._rng = rng;

    bus.on("onKill", () => {
      this._gauge = Math.min(1, this._gauge + FILL_PER_KILL);
      bus.emit("onGaugeChanged", { fill: this._gauge });
    });
  }

  /**
   * Call once per fixed step. Opens the picker if the gauge is full and the
   * player has at least one empty HP container.
   */
  update(player: Player): void {
    if (this._isPickerOpen) return;
    if (this._gauge < 1) return;
    if (player.emptyContainers < 1) return;

    this._gauge = 0;
    this._currentOffer = this._sampleOffer(player);
    this._bus.emit("onGaugeFull", {});
    this._isPickerOpen = true;
  }

  /**
   * Apply the patch at the given index in the current offer.
   * Consumes one empty HP container and applies the stat mod.
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
    this._bus.emit("onGaugeChanged", { fill: 0 });
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
