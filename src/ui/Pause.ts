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
 */
export class Pause {
  private readonly _overlay: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];

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
      bus.on("onPause", () => { setVisible(this._overlay, true); }),
      bus.on("onResume", () => { setVisible(this._overlay, false); }),
    );
  }

  /** Unsubscribe all listeners and remove the overlay from the DOM. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._overlay.parentElement?.removeChild(this._overlay);
  }
}
