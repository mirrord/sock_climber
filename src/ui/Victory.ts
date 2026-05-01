import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import type { ScoreSystem } from "../systems/ScoreSystem.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Victory — end-of-run win screen for level 4.
 *
 * Subscribes to `onLevelComplete` so the overlay appears automatically
 * when the boss is defeated. Mirrors {@link GameOver}'s focus / gamepad
 * navigation so the same input habits work on either screen.
 */
export class Victory {
  private readonly _overlay: HTMLElement;
  private readonly _killsEl: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];

  private readonly _buttons: HTMLButtonElement[] = [];
  private readonly _arrows: HTMLSpanElement[] = [];
  private _focusIndex = 0;

  private _gpPrevButtons = new Set<number>();
  private _gpAxisTriggered = false;
  private _gpRaf: number | null = null;

  constructor(
    bus: EventBus<GameEvents>,
    scoreSystem: ScoreSystem,
    onRestart: () => void,
    onTitle: () => void,
    container: HTMLElement = document.body,
    onCredits?: () => void,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    this._overlay = el("div", ["hidden"], { id: "victory" });

    const heading = el("h2", []);
    setText(heading, TEXT.victory.heading);

    const subtitle = el("p", [], { id: "vt-subtitle" });
    setText(subtitle, TEXT.victory.subtitle);

    this._killsEl = el("p", [], { id: "vt-kills" });

    const restartBtn = el("button", [], { id: "vt-restart" });
    setText(restartBtn, TEXT.victory.restart);
    restartBtn.addEventListener("click", () => {
      this.hide();
      onRestart();
    });

    const titleBtn = el("button", [], { id: "vt-title" });
    setText(titleBtn, TEXT.victory.title);
    titleBtn.addEventListener("click", () => {
      this.hide();
      onTitle();
    });

    let creditsBtn: HTMLButtonElement | null = null;
    if (onCredits !== undefined) {
      creditsBtn = el("button", [], { id: "vt-credits" });
      setText(creditsBtn, TEXT.victory.credits);
      creditsBtn.addEventListener("click", () => {
        this._fadeOutThen(() => {
          this.hide();
          onCredits();
        });
      });
    }

    const orderedButtons: HTMLButtonElement[] =
      creditsBtn !== null
        ? [restartBtn, creditsBtn, titleBtn]
        : [restartBtn, titleBtn];
    for (const btn of orderedButtons) {
      const arrow = el("span", ["menu-arrow", "hidden"]);
      setText(arrow, "▶ ");
      btn.prepend(arrow);
      this._arrows.push(arrow);
      this._buttons.push(btn);
    }

    this._overlay.appendChild(heading);
    this._overlay.appendChild(subtitle);
    this._overlay.appendChild(this._killsEl);
    this._overlay.appendChild(restartBtn);
    if (creditsBtn !== null) this._overlay.appendChild(creditsBtn);
    this._overlay.appendChild(titleBtn);
    container.appendChild(this._overlay);

    // ─── Subscribe ──────────────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onLevelComplete", () => {
        const summary = scoreSystem.getSummary();
        setText(
          this._killsEl,
          `${TEXT.victory.kills}: ${summary.enemiesKilled}`,
        );
        this.show();
      }),
    );
  }

  show(): void {
    this._focusIndex = 0;
    this._updateArrows();
    setVisible(this._overlay, true);
    this._startGamepadNav();
  }

  hide(): void {
    this._stopGamepadNav();
    setVisible(this._overlay, false);
    // Reset any inline opacity left over from a fade.
    this._overlay.style.opacity = "";
    this._overlay.style.transition = "";
  }

  /**
   * Fade the overlay to transparent over ~0.6 s, then invoke `cb`.
   * Used by the Credits button so the transition into the Credits
   * screen is smooth instead of a hard cut.
   */
  private _fadeOutThen(cb: () => void): void {
    this._stopGamepadNav();
    this._overlay.style.transition = "opacity 0.6s ease";
    // Force a reflow so the browser registers the starting opacity
    // before we change it on the next frame.
    void this._overlay.offsetWidth;
    this._overlay.style.opacity = "0";
    window.setTimeout(cb, 600);
  }

  destroy(): void {
    this._stopGamepadNav();
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  // ─── Gamepad navigation (mirrors GameOver) ───────────────────────────

  private _updateArrows(): void {
    for (let i = 0; i < this._arrows.length; i++) {
      setVisible(this._arrows[i]!, i === this._focusIndex);
    }
  }

  private _moveFocus(delta: number): void {
    this._focusIndex =
      (this._focusIndex + delta + this._buttons.length) % this._buttons.length;
    this._updateArrows();
  }

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return;
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
    } catch { /* ignore */ }
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
    const justPressed = (btn: number): boolean =>
      pressed.has(btn) && !this._gpPrevButtons.has(btn);

    if (justPressed(13)) this._moveFocus(+1);
    if (justPressed(12)) this._moveFocus(-1);
    if (justPressed(0) || justPressed(9)) {
      this._buttons[this._focusIndex]!.click();
    }

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
