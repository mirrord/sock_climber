import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Title — title screen overlay, shown on page load.
 *
 * Clicking Start invokes the `onStart` callback (the host wires this to
 * the level-select screen) and hides the overlay.
 * Clicking Settings calls the `openSettings()` callback.
 *
 * Gamepad navigation: D-pad up/down (buttons 12/13) or left-stick Y moves
 * focus between buttons; A (button 0) or Start (button 9) confirms.
 * A `▶` arrow span next to the focused button provides visual feedback.
 */
export class Title {
  private readonly _overlay: HTMLElement;
  private readonly _buttons: HTMLButtonElement[] = [];
  private readonly _arrows: HTMLSpanElement[] = [];
  private _focusIndex = 0;

  /** Tracks which gamepad buttons were pressed last poll tick (for edge detection). */
  private _gpPrevButtons = new Set<number>();
  /** Prevents left-stick Y from continuously firing — must re-center first. */
  private _gpAxisTriggered = false;
  private _gpRaf: number | null = null;

  constructor(
    onStart: () => void,
    openSettings: () => void,
    container: HTMLElement = document.body,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    // Not hidden initially — title is the first thing the player sees.
    this._overlay = el("div", [], { id: "title" });

    const heading = el("h1", []);
    setText(heading, TEXT.title.heading);

    const subtitle = el("p", ["title-subtitle"]);
    const subtitles = TEXT.title.subtitles;
    setText(subtitle, subtitles[Math.floor(Math.random() * subtitles.length)]!);

    const startBtn = el("button", [], { id: "title-start" });
    setText(startBtn, TEXT.title.start);

    const settingsBtn = el("button", [], { id: "title-settings" });
    setText(settingsBtn, TEXT.title.settings);

    // Arrow spans — one per button, prepended inside each button element.
    for (const btn of [startBtn, settingsBtn]) {
      const arrow = el("span", ["menu-arrow", "hidden"]);
      setText(arrow, "▶ ");
      btn.prepend(arrow);
      this._arrows.push(arrow);
      this._buttons.push(btn);
    }

    this._overlay.appendChild(heading);
    this._overlay.appendChild(subtitle);
    this._overlay.appendChild(startBtn);
    this._overlay.appendChild(settingsBtn);
    container.appendChild(this._overlay);

    // ─── Button handlers ────────────────────────────────────────────────
    startBtn.addEventListener("click", () => {
      this._stopGamepadNav();
      setVisible(this._overlay, false);
      onStart();
    });

    settingsBtn.addEventListener("click", () => {
      openSettings();
    });

    // Title is visible from the start — begin nav immediately.
    this._updateArrows();
    this._startGamepadNav();
  }

  /** Show the title screen. */
  show(): void {
    this._focusIndex = 0;
    this._updateArrows();
    setVisible(this._overlay, true);
    this._startGamepadNav();
  }

  /** Hide the title screen without destroying it. */
  hide(): void {
    this._stopGamepadNav();
    setVisible(this._overlay, false);
  }

  /** Remove the title overlay from the DOM. */
  destroy(): void {
    this._stopGamepadNav();
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  // ─── Gamepad navigation ───────────────────────────────────────────────

  private _updateArrows(): void {
    for (let i = 0; i < this._arrows.length; i++) {
      setVisible(this._arrows[i]!, i === this._focusIndex);
    }
  }

  private _moveFocus(delta: number): void {
    this._focusIndex = (this._focusIndex + delta + this._buttons.length) % this._buttons.length;
    this._updateArrows();
  }

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return; // already running
    // Seed prevButtons with whatever is currently held so a button pressed to
    // navigate away from the pause/game-over screen is not treated as a fresh
    // press on the first tick, which would immediately start the game.
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
      this._buttons[this._focusIndex]!.click();
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
