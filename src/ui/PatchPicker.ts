import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { UpgradeSystem } from "../systems/UpgradeSystem.js";
import type { Player } from "../entities/Player.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * PatchPicker — modal overlay for selecting an upgrade patch.
 *
 * Listens for `onGaugeFull`, reads the current offer from `UpgradeSystem`,
 * shows 3 patch buttons, pauses the simulation, and resumes on selection.
 *
 * The player *must* choose — Escape is intentionally ignored while open.
 */
export class PatchPicker {
  private readonly _modal: HTMLElement;
  private readonly _buttons: [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
  private readonly _unsubs: Unsubscribe[] = [];
  private _upgradeSystem: UpgradeSystem;
  private _player: Player;
  private _bus: EventBus<GameEvents>;

  constructor(
    bus: EventBus<GameEvents>,
    upgradeSystem: UpgradeSystem,
    player: Player,
    container: HTMLElement = document.body,
  ) {
    this._bus = bus;
    this._upgradeSystem = upgradeSystem;
    this._player = player;

    // ─── Build DOM ──────────────────────────────────────────────────────
    this._modal = el("div", ["hidden"], { id: "patch-picker" });
    const heading = el("h2", []);
    setText(heading, TEXT.patch.heading);
    const options = el("div", ["patch-options"]);

    this._buttons = [
      this._makeButton(0),
      this._makeButton(1),
      this._makeButton(2),
    ];
    for (const btn of this._buttons) options.appendChild(btn);

    this._modal.appendChild(heading);
    this._modal.appendChild(options);
    container.appendChild(this._modal);

    // ─── Subscribe ──────────────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onGaugeFull", () => {
        const offer = upgradeSystem.currentOffer;
        if (offer === null) return;

        for (let i = 0; i < 3; i++) {
          const entry = offer[i];
          if (entry === undefined) continue;
          const btn = this._buttons[i]!;
          btn.dataset.patchId = entry.id;
          setText(btn, `${entry.name}: ${entry.description}`);
        }

        setVisible(this._modal, true);
        bus.emit("onPause", {});
      }),
    );
  }

  /** Unsubscribe all listeners and remove the modal from the DOM. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._modal.parentElement?.removeChild(this._modal);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _makeButton(index: 0 | 1 | 2): HTMLButtonElement {
    const btn = el("button", ["patch-btn"]);
    btn.addEventListener("click", () => {
      this._upgradeSystem.selectPatch(index, this._player);
      setVisible(this._modal, false);
      this._bus.emit("onResume", {});
    });
    return btn;
  }
}
