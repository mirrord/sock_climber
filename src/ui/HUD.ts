import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * HUD — heads-up display overlay.
 *
 * Pre-creates all DOM elements at construction time. Updates are driven
 * exclusively by EventBus subscriptions — no per-frame DOM polling.
 *
 * Call `destroy()` to unsubscribe all listeners when tearing down.
 */
export class HUD {
  private readonly _root: HTMLElement;
  private readonly _hpList: HTMLElement;
  private readonly _gaugeFill: HTMLElement;
  private readonly _distanceEl: HTMLElement;
  private readonly _buffList: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];

  constructor(bus: EventBus<GameEvents>, container: HTMLElement = document.body) {
    // ─── Build DOM structure ────────────────────────────────────────────
    this._root = el("div", ["hidden"], { id: "hud" });

    // HP row
    this._hpList = el("div", [], { id: "hud-hp" });

    // Upgrade gauge
    const gaugeOuter = el("div", ["gauge"], { id: "hud-gauge" });
    this._gaugeFill = el("div", ["gauge-fill"]);
    this._gaugeFill.style.width = "0%";
    gaugeOuter.appendChild(this._gaugeFill);

    // Distance counter
    this._distanceEl = el("span", [], { id: "hud-distance" });
    setText(this._distanceEl, `0 ${TEXT.hud.distanceUnit}`);

    // Active buffs
    this._buffList = el("div", ["buff-list"], { id: "hud-buffs" });

    this._root.appendChild(this._hpList);
    this._root.appendChild(gaugeOuter);
    this._root.appendChild(this._distanceEl);
    this._root.appendChild(this._buffList);
    container.appendChild(this._root);

    // ─── Subscribe to events ────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onHpChanged", ({ current, max, empty }) => {
        this._renderHp(current, max, empty);
      }),
      bus.on("onGaugeChanged", ({ fill }) => {
        this._gaugeFill.style.width = `${Math.round(fill * 100)}%`;
      }),
      bus.on("onBuffApplied", ({ buffId }) => {
        const span = el("span", ["buff-icon"], { "data-id": buffId });
        setText(span, buffId);
        this._buffList.appendChild(span);
      }),
      bus.on("onBuffExpired", ({ buffId }) => {
        const existing = this._buffList.querySelector(`[data-id='${buffId}']`);
        if (existing) this._buffList.removeChild(existing);
      }),
      bus.on("onDistanceChanged", ({ distance }) => {
        setText(this._distanceEl, `${distance} ${TEXT.hud.distanceUnit}`);
      }),
    );
  }

  /** Make the HUD visible. */
  show(): void {
    setVisible(this._root, true);
  }

  /** Unsubscribe all listeners and remove the HUD root from the DOM. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._root.parentElement?.removeChild(this._root);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private _renderHp(current: number, max: number, empty: number): void {
    // Clear existing containers.
    this._hpList.textContent = "";
    for (let i = 0; i < current; i++) {
      const span = el("span", ["hp-container", "filled"]);
      this._hpList.appendChild(span);
    }
    for (let i = 0; i < empty; i++) {
      const span = el("span", ["hp-container", "empty"]);
      this._hpList.appendChild(span);
    }
    // Remaining containers are unused (max - current - empty) — not rendered separately.
    void max; // referenced so TS doesn't complain about the parameter
  }
}
