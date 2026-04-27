import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Pause — pause menu overlay.
 *
 * Shows on `onPause`, hides on `onResume`.
 * - Resume button → emits `onResume`, hides.
 * - Settings button → calls `openSettings()` callback.
 * - Quit button → calls `onQuit()` callback (does NOT emit `onResume`).
 *
 * Gamepad navigation: D-pad up/down (buttons 12/13) or left-stick Y moves
 * focus between buttons; A (button 0) or Start (button 9) confirms.
 * A `▶` arrow span next to the focused button provides visual feedback.
 */
export class Pause {
  private readonly _overlay: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];

  private readonly _buttons: HTMLButtonElement[] = [];
  private readonly _arrows: HTMLSpanElement[] = [];
  private _focusIndex = 0;

  /** Tracks which gamepad buttons were pressed last poll tick (for edge detection). */
  private _gpPrevButtons = new Set<number>();
  /** Prevents left-stick Y from continuously firing — must re-center first. */
  private _gpAxisTriggered = false;
  private _gpRaf: number | null = null;

  constructor(
    bus: EventBus<GameEvents>,
    onQuit: () => void,
    openSettings: () => void,
    container: HTMLElement = document.body,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    this._overlay = el("div", ["hidden"], { id: "pause" });

    const heading = el("h2", []);
    setText(heading, TEXT.pause.heading);

    const resumeBtn = el("button", [], { id: "pause-resume" });
    setText(resumeBtn, TEXT.pause.resume);

    const settingsBtn = el("button", [], { id: "pause-settings" });
    setText(settingsBtn, TEXT.pause.settings);

    const quitBtn = el("button", [], { id: "pause-quit" });
    setText(quitBtn, TEXT.pause.quit);

    // Arrow spans — one per button, prepended inside each button element.
    for (const btn of [resumeBtn, settingsBtn, quitBtn]) {
      const arrow = el("span", ["menu-arrow", "hidden"]);
      setText(arrow, "▶ ");
      btn.prepend(arrow);
      this._arrows.push(arrow);
      this._buttons.push(btn);
    }

    this._overlay.appendChild(heading);
    this._overlay.appendChild(resumeBtn);
    this._overlay.appendChild(settingsBtn);
    this._overlay.appendChild(quitBtn);
    container.appendChild(this._overlay);

    // ─── Button handlers ────────────────────────────────────────────────
    resumeBtn.addEventListener("click", () => {
      setVisible(this._overlay, false);
      bus.emit("onResume", {});
    });

    settingsBtn.addEventListener("click", () => {
      openSettings();
    });

    quitBtn.addEventListener("click", () => {
      onQuit();
    });

    // ─── Subscribe to bus ───────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onPause", () => { this.show(); }),
      bus.on("onResume", () => { this.hide(); }),
    );
  }

  /** Show the pause menu and start gamepad navigation. */
  show(): void {
    this._focusIndex = 0;
    this._updateArrows();
    setVisible(this._overlay, true);
    this._startGamepadNav();
  }

  /** Hide the pause menu and stop gamepad navigation. */
  hide(): void {
    this._stopGamepadNav();
    setVisible(this._overlay, false);
  }

  /** Unsubscribe all listeners and remove the overlay from the DOM. */
  destroy(): void {
    this._stopGamepadNav();
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  // ─── Gamepad navigation ───────────────────────────────────────────────

  private _updateArrows(): void {
    for (let i = 0; i < this._arrows.length; i++) {
      setVisible(this._arrows[i], i === this._focusIndex);
    }
  }

  private _moveFocus(delta: number): void {
    this._focusIndex = (this._focusIndex + delta + this._buttons.length) % this._buttons.length;
    this._updateArrows();
  }

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return; // already running
    this._gpPrevButtons.clear();
    this._gpAxisTriggered = false;
    const tick = (): void => {
      this._tickGamepadNav();
      if (!this._overlay.classList.contains("hidden")) {
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

    // Edge-detect D-pad and confirm buttons.
    const justPressed = (btn: number): boolean => pressed.has(btn) && !this._gpPrevButtons.has(btn);

    if (justPressed(13)) this._moveFocus(+1); // D-pad down
    if (justPressed(12)) this._moveFocus(-1); // D-pad up
    if (justPressed(0) || justPressed(9)) {   // A or Start → confirm
      this._buttons[this._focusIndex].click();
    }

    // Left-stick Y — trigger once per deflection, require re-center.
    const stickY = gp.axes[1] ?? 0;
    if (Math.abs(stickY) < 0.5) {
      this._gpAxisTriggered = false;
    } else if (!this._gpAxisTriggered) {
      this._gpAxisTriggered = true;
      this._moveFocus(stickY > 0 ? +1 : -1);
    }

    this._gpPrevButtons = pressed;
  }
}
