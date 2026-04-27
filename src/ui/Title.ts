import type { EventBus, GameEvents } from "../core/EventBus.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Title — title screen overlay, shown on page load.
 *
 * Clicking Start emits `onGameStart` and hides the overlay.
 * Clicking Settings calls the `openSettings()` callback.
 */
export class Title {
  private readonly _overlay: HTMLElement;

  constructor(
    bus: EventBus<GameEvents>,
    openSettings: () => void,
    container: HTMLElement = document.body,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    // Not hidden initially — title is the first thing the player sees.
    this._overlay = el("div", [], { id: "title" });

    const heading = el("h1", []);
    setText(heading, TEXT.title.heading);

    const subtitle = el("p", ["title-subtitle"]);
    setText(subtitle, TEXT.title.subtitle);

    const startBtn = el("button", [], { id: "title-start" });
    setText(startBtn, TEXT.title.start);

    const settingsBtn = el("button", [], { id: "title-settings" });
    setText(settingsBtn, TEXT.title.settings);

    this._overlay.appendChild(heading);
    this._overlay.appendChild(subtitle);
    this._overlay.appendChild(startBtn);
    this._overlay.appendChild(settingsBtn);
    container.appendChild(this._overlay);

    // ─── Button handlers ────────────────────────────────────────────────
    startBtn.addEventListener("click", () => {
      setVisible(this._overlay, false);
      bus.emit("onGameStart", {});
    });

    settingsBtn.addEventListener("click", () => {
      openSettings();
    });
  }

  /** Show the title screen. */
  show(): void {
    setVisible(this._overlay, true);
  }

  /** Remove the title overlay from the DOM. */
  destroy(): void {
    this._overlay.parentElement?.removeChild(this._overlay);
  }
}
