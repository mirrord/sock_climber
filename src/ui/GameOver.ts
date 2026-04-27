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
 * Clicking Play Again calls the `onRestart` callback provided at construction.
 */
export class GameOver {
  private readonly _overlay: HTMLElement;
  private readonly _distanceEl: HTMLElement;
  private readonly _killsEl: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];

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
    restartBtn.addEventListener("click", () => onRestart());

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
        setVisible(this._overlay, true);
      }),
    );
  }

  /** Unsubscribe all listeners and remove the overlay from the DOM. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._overlay.parentElement?.removeChild(this._overlay);
  }
}
