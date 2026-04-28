import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { ScoreSystem } from "../systems/ScoreSystem.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * GameOver — end-of-run score screen.
 *
 * Subscribes to `onPlayerDeath`, reads the final summary from `ScoreSystem`,
 * and shows the overlay with distance + kill count.
 *
 * Clicking Play Again hides the overlay and calls the `onRestart` callback
 * provided at construction.
 *
 * Gamepad navigation: D-pad up/down (buttons 12/13) or left-stick Y moves
 * focus between buttons; A (button 0) or Start (button 9) confirms.
 * A `▶` arrow span next to the focused button provides visual feedback.
 */
export class GameOver {
  private readonly _overlay: HTMLElement;
  private readonly _distanceEl: HTMLElement;
  private readonly _killsEl: HTMLElement;
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
    scoreSystem: ScoreSystem,
    onRestart: () => void,
    container: HTMLElement = document.body,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    this._overlay = el("div", ["hidden"], { id: "game-over" });

    const heading = el("h2", []);
    setText(heading, TEXT.gameOver.heading);

    this._distanceEl = el("p", [], { id: "go-distance" });
    this._killsEl = el("p", [], { id: "go-kills" });

    const restartBtn = el("button", [], { id: "go-restart" });
    setText(restartBtn, TEXT.gameOver.restart);
    restartBtn.addEventListener("click", () => {
      this.hide();
      onRestart();
    });

    // Arrow spans — one per button, prepended inside each button element.
    for (const btn of [restartBtn]) {
      const arrow = el("span", ["menu-arrow", "hidden"]);
      setText(arrow, "▶ ");
      btn.prepend(arrow);
      this._arrows.push(arrow);
      this._buttons.push(btn);
    }

    this._overlay.appendChild(heading);
    this._overlay.appendChild(this._distanceEl);
    this._overlay.appendChild(this._killsEl);
    this._overlay.appendChild(restartBtn);
    container.appendChild(this._overlay);

    // ─── Subscribe ──────────────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onPlayerDeath", () => {
        const summary = scoreSystem.getSummary();
        setText(this._distanceEl, `${TEXT.gameOver.distance}: ${Math.floor(summary.distanceTraversed)} m`);
        setText(this._killsEl, `${TEXT.gameOver.kills}: ${summary.enemiesKilled}`);
        this.show();
      }),
    );
  }

  /** Show the score screen and start gamepad navigation. */
  show(): void {
    this._focusIndex = 0;
    this._updateArrows();
    setVisible(this._overlay, true);
    this._startGamepadNav();
  }

  /** Hide the score screen and stop gamepad navigation. */
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
      setVisible(this._arrows[i]!, i === this._focusIndex);
    }
  }

  private _moveFocus(delta: number): void {
    this._focusIndex = (this._focusIndex + delta + this._buttons.length) % this._buttons.length;
    this._updateArrows();
  }

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return; // already running
    // Seed prevButtons with whatever is currently held so a button pressed at
    // the moment the screen appears is not treated as a fresh press on the
    // first nav tick, which would immediately confirm/restart.
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
