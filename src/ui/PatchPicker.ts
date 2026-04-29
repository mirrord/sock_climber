import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { UpgradeSystem } from "../systems/UpgradeSystem.js";
import type { Player } from "../entities/Player.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * PatchPicker — modal overlay for selecting an upgrade patch.
 *
 * Listens for `onPickerOpen`, reads the current offer from `UpgradeSystem`,
 * shows 3 patch buttons. Selection emits `onPickerClose`. The simulation
 * is halted by the main loop while the picker is open — the pause menu is
 * intentionally NOT shown.
 *
 * The player *must* choose — Escape is intentionally ignored while open.
 *
 * Gamepad navigation mirrors {@link Pause}: D-pad left/right (buttons 14/15)
 * or left-stick X moves focus among the visible patch buttons; A (button 0)
 * or Start (button 9) confirms the highlighted choice. The focused panel
 * gets a `.focused` class that applies the same gold highlight as the
 * mouse `:hover` state.
 */
export class PatchPicker {
  private readonly _modal: HTMLElement;
  private readonly _buttons: [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
  private readonly _icons: [HTMLImageElement, HTMLImageElement, HTMLImageElement];
  private readonly _names: [HTMLSpanElement, HTMLSpanElement, HTMLSpanElement];
  private readonly _descs: [HTMLSpanElement, HTMLSpanElement, HTMLSpanElement];
  private readonly _unsubs: Unsubscribe[] = [];
  private _upgradeSystem: UpgradeSystem;
  private _player: Player;
  private _focusIndex = 0;

  /** Tracks which gamepad buttons were pressed last poll tick (for edge detection). */
  private _gpPrevButtons = new Set<number>();
  /** Prevents left-stick Y from continuously firing — must re-center first. */
  private _gpAxisTriggered = false;
  private _gpRaf: number | null = null;

  constructor(
    bus: EventBus<GameEvents>,
    upgradeSystem: UpgradeSystem,
    player: Player,
    container: HTMLElement = document.body,
  ) {
    this._upgradeSystem = upgradeSystem;
    this._player = player;

    // ─── Build DOM ──────────────────────────────────────────────────────
    this._modal = el("div", ["hidden"], { id: "patch-picker" });
    const heading = el("h2", []);
    setText(heading, TEXT.patch.heading);
    const options = el("div", ["patch-options"]);

    const icons: HTMLImageElement[] = [];
    const names: HTMLSpanElement[] = [];
    const descs: HTMLSpanElement[] = [];
    this._buttons = [
      this._makeButton(0, icons, names, descs),
      this._makeButton(1, icons, names, descs),
      this._makeButton(2, icons, names, descs),
    ];
    this._icons = icons as [HTMLImageElement, HTMLImageElement, HTMLImageElement];
    this._names = names as [HTMLSpanElement, HTMLSpanElement, HTMLSpanElement];
    this._descs = descs as [HTMLSpanElement, HTMLSpanElement, HTMLSpanElement];
    for (const btn of this._buttons) options.appendChild(btn);

    this._modal.appendChild(heading);
    this._modal.appendChild(options);
    container.appendChild(this._modal);

    // ─── Subscribe ──────────────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onPickerOpen", () => {
        const offer = upgradeSystem.currentOffer;
        if (offer === null) return;

        for (let i = 0; i < 3; i++) {
          const entry = offer[i];
          const btn = this._buttons[i]!;
          if (entry === undefined) {
            // Fewer than 3 eligible patches available — hide the slot.
            setVisible(btn, false);
            continue;
          }
          btn.dataset.patchId = entry.id;
          setText(this._names[i]!, entry.name);
          setText(this._descs[i]!, entry.description);
          const icon = this._icons[i]!;
          if (icon.getAttribute("src") !== entry.icon) {
            icon.setAttribute("src", entry.icon);
          }
          icon.alt = entry.name;
          setVisible(btn, true);
        }

        // Focus the first visible button and start gamepad nav.
        this._focusIndex = this._firstVisibleIndex();
        this._updateFocus();
        setVisible(this._modal, true);
        this._startGamepadNav();
      }),
      bus.on("onPickerClose", () => {
        this._stopGamepadNav();
      }),
    );
  }

  /** Unsubscribe all listeners and remove the modal from the DOM. */
  destroy(): void {
    this._stopGamepadNav();
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._modal.parentElement?.removeChild(this._modal);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _makeButton(
    index: 0 | 1 | 2,
    icons: HTMLImageElement[],
    names: HTMLSpanElement[],
    descs: HTMLSpanElement[],
  ): HTMLButtonElement {
    const btn = el("button", ["patch-btn"]);

    const icon = el("img", ["patch-icon"]);
    icon.setAttribute("alt", "");
    btn.appendChild(icon);
    icons.push(icon);

    const text = el("span", ["patch-text"]);
    const name = el("span", ["patch-name"]);
    const desc = el("span", ["patch-desc"]);
    text.appendChild(name);
    text.appendChild(desc);
    btn.appendChild(text);
    names.push(name);
    descs.push(desc);

    btn.addEventListener("click", () => {
      this._upgradeSystem.selectPatch(index, this._player);
      setVisible(this._modal, false);
    });
    return btn;
  }

  /** Index of the first visible button (falls back to 0 if none). */
  private _firstVisibleIndex(): number {
    for (let i = 0; i < this._buttons.length; i++) {
      if (!this._buttons[i]!.classList.contains("hidden")) return i;
    }
    return 0;
  }

  private _updateFocus(): void {
    for (let i = 0; i < this._buttons.length; i++) {
      this._buttons[i]!.classList.toggle("focused", i === this._focusIndex);
    }
  }

  /** Move focus by `delta`, skipping hidden buttons. */
  private _moveFocus(delta: number): void {
    const n = this._buttons.length;
    let next = this._focusIndex;
    for (let i = 0; i < n; i++) {
      next = (next + delta + n) % n;
      if (!this._buttons[next]!.classList.contains("hidden")) {
        this._focusIndex = next;
        this._updateFocus();
        return;
      }
    }
  }

  // ─── Gamepad navigation (mirrors Pause) ───────────────────────────────

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return;
    // Seed prevButtons with what's currently held so the press that opened
    // the picker (e.g. the ApplyPatch button) isn't read as a fresh confirm.
    this._gpPrevButtons.clear();
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) {
          for (let i = 0; i < pad.buttons.length; i++) {
            if (pad.buttons[i]?.pressed) this._gpPrevButtons.add(i);
          }
          break;
        }
      }
    } catch { /* ignore — no gamepad access */ }
    this._gpAxisTriggered = false;
    const tick = (): void => {
      this._tickGamepadNav();
      if (!this._modal.classList.contains("hidden")) {
        this._gpRaf = requestAnimationFrame(tick);
      } else {
        this._gpRaf = null;
      }
    };
    this._gpRaf = requestAnimationFrame(tick);
  }

  private _stopGamepadNav(): void {
    if (this._gpRaf !== null) {
      cancelAnimationFrame(this._gpRaf);
      this._gpRaf = null;
    }
    this._gpPrevButtons.clear();
    this._gpAxisTriggered = false;
  }

  private _tickGamepadNav(): void {
    let gp: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) { gp = pad; break; }
      }
    } catch { return; }
    if (gp === null) { this._gpPrevButtons.clear(); return; }

    const pressed = new Set<number>();
    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i]?.pressed) pressed.add(i);
    }

    const justPressed = (btn: number): boolean =>
      pressed.has(btn) && !this._gpPrevButtons.has(btn);

    if (justPressed(15)) this._moveFocus(+1); // D-pad right
    if (justPressed(14)) this._moveFocus(-1); // D-pad left
    if (justPressed(0) || justPressed(9)) {   // A or Start → confirm
      this._buttons[this._focusIndex]!.click();
    }

    // Left-stick X — trigger once per deflection, require re-center.
    const stickX = gp.axes[0] ?? 0;
    if (Math.abs(stickX) < 0.5) {
      this._gpAxisTriggered = false;
    } else if (!this._gpAxisTriggered) {
      this._gpAxisTriggered = true;
      this._moveFocus(stickX > 0 ? +1 : -1);
    }

    this._gpPrevButtons = pressed;
  }
}
