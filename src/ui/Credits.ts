import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Credits — fade-in overlay shown after pressing the "Credits" button on
 * the level-4 Victory screen. Displays placeholder credits text and
 * dismisses on any keyboard, mouse/touch, or gamepad-button input,
 * invoking the supplied `onReturn` callback so the host can switch back
 * to the Title screen and music.
 */
export class Credits {
  private readonly _overlay: HTMLElement;
  private _onReturn: (() => void) | null = null;
  private _attached = false;

  private readonly _onKey = (): void => this._dismiss();
  private readonly _onPointer = (): void => this._dismiss();

  // Gamepad polling — track buttons that were already held when the
  // screen opened so the user doesn't dismiss it instantly with a
  // button they pressed to navigate here.
  private _gpRaf: number | null = null;
  private _gpInitialPressed = new Set<number>();

  constructor(container: HTMLElement = document.body) {
    this._overlay = el("div", ["hidden"], { id: "credits" });

    const heading = el("h2", []);
    setText(heading, TEXT.credits.heading);

    const body = el("p", [], { id: "credits-body" });
    setText(body, TEXT.credits.body);

    const hint = el("p", [], { id: "credits-hint" });
    setText(hint, TEXT.credits.hint);

    this._overlay.appendChild(heading);
    this._overlay.appendChild(body);
    this._overlay.appendChild(hint);
    container.appendChild(this._overlay);
  }

  /**
   * Reveal the overlay with a CSS opacity fade-in and start listening
   * for any-button-to-dismiss input. The triggering input event (the
   * click on the Victory "Credits" button) is filtered out by deferring
   * listener attachment two frames so it cannot dismiss the screen
   * immediately.
   */
  show(onReturn: () => void): void {
    this._onReturn = onReturn;
    // Start invisible so the transition from 0 → 1 actually animates
    // when we remove the `hidden` class on the next frame.
    this._overlay.style.opacity = "0";
    this._overlay.style.transition = "opacity 0.6s ease";
    setVisible(this._overlay, true);
    // Force layout flush, then transition opacity in.
    void this._overlay.offsetWidth;
    this._overlay.style.opacity = "1";

    // Defer input attachment for two frames so the click that opened
    // this screen doesn't immediately close it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._attachInput());
    });
  }

  hide(): void {
    this._detachInput();
    setVisible(this._overlay, false);
    this._overlay.style.opacity = "";
    this._overlay.style.transition = "";
  }

  destroy(): void {
    this._detachInput();
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  // ─── Input ──────────────────────────────────────────────────────────

  private _attachInput(): void {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("pointerdown", this._onPointer);

    // Snapshot currently-held gamepad buttons so we only react to
    // newly-pressed ones.
    this._gpInitialPressed.clear();
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) {
          for (let i = 0; i < pad.buttons.length; i++) {
            if (pad.buttons[i]?.pressed) this._gpInitialPressed.add(i);
          }
          break;
        }
      }
    } catch { /* ignore */ }

    const tick = (): void => {
      if (!this._attached) { this._gpRaf = null; return; }
      this._tickGamepad();
      this._gpRaf = requestAnimationFrame(tick);
    };
    this._gpRaf = requestAnimationFrame(tick);
  }

  private _detachInput(): void {
    if (!this._attached) return;
    this._attached = false;
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("pointerdown", this._onPointer);
    if (this._gpRaf !== null) {
      cancelAnimationFrame(this._gpRaf);
      this._gpRaf = null;
    }
    this._gpInitialPressed.clear();
  }

  private _tickGamepad(): void {
    let gp: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) { gp = pad; break; }
      }
    } catch { return; }
    if (gp === null) return;

    for (let i = 0; i < gp.buttons.length; i++) {
      const pressed = gp.buttons[i]?.pressed === true;
      if (pressed && !this._gpInitialPressed.has(i)) {
        this._dismiss();
        return;
      }
      if (!pressed) this._gpInitialPressed.delete(i);
    }
  }

  private _dismiss(): void {
    const cb = this._onReturn;
    this._onReturn = null;
    this._detachInput();
    // Fade out, then hide and notify the host.
    this._overlay.style.transition = "opacity 0.6s ease";
    void this._overlay.offsetWidth;
    this._overlay.style.opacity = "0";
    window.setTimeout(() => {
      setVisible(this._overlay, false);
      this._overlay.style.opacity = "";
      this._overlay.style.transition = "";
      if (cb !== null) cb();
    }, 600);
  }
}
