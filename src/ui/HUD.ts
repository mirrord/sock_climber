import type { EventBus, GameEvents, Unsubscribe } from "../core/EventBus.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";
import { PATCH_CATALOG } from "../systems/PatchCatalog.js";

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
  private readonly _patchList: HTMLElement;
  private readonly _gaugeRoot: HTMLElement;
  private readonly _gaugeFill: HTMLElement;
  private readonly _gaugeTrail: HTMLElement;
  private readonly _distanceEl: HTMLElement;
  private readonly _buffList: HTMLElement;
  /** Boss panel (level 4 only). Hidden until the first boss event. */
  private readonly _bossPanel: HTMLElement;
  private readonly _bossState: HTMLElement;
  private readonly _bossSheets: HTMLElement;
  private readonly _bossStrikes: HTMLElement;
  private readonly _bossDizzy: HTMLElement;
  private readonly _unsubs: Unsubscribe[] = [];
  /** Interval id for the trail-dot emitter; non-null only while bar is full. */
  private _trailIntervalId: ReturnType<typeof setInterval> | null = null;
  /** ms between trail-dot bursts. */
  private static readonly _TRAIL_EMIT_MS = 70;
  /** Number of dots emitted per burst (radial spray). */
  private static readonly _TRAIL_DOTS_PER_BURST = 3;
  /** ms each trail dot remains in the DOM (matches CSS transition duration). */
  private static readonly _TRAIL_DOT_LIFETIME_MS = 700;
  /** Maximum drift distance (px) for a trail dot. */
  private static readonly _TRAIL_DOT_RANGE_PX = 69;

  constructor(bus: EventBus<GameEvents>, container: HTMLElement = document.body) {
    // ─── Build DOM structure ────────────────────────────────────────────
    this._root = el("div", ["hidden"], { id: "hud" });

    // HP row
    this._hpList = el("div", [], { id: "hud-hp" });

    // Applied-patches row (shown beneath HP indicators).
    this._patchList = el("div", [], { id: "hud-patches" });

    // Upgrade gauge — sprite-based: empty bar always visible, full bar
    // revealed left-to-right via the clip wrapper width. A trailing
    // particle container animates only while the bar is full.
    this._gaugeRoot = el("div", ["gauge"], { id: "hud-gauge" });
    const emptyImg = document.createElement("img");
    emptyImg.className = "gauge-empty";
    emptyImg.src = "assets/sprites/bar empty.png";
    emptyImg.alt = "";
    emptyImg.draggable = false;
    this._gaugeFill = el("div", ["gauge-fill"]);
    this._gaugeFill.style.width = "0%";
    const fullImg = document.createElement("img");
    fullImg.className = "gauge-full";
    fullImg.src = "assets/sprites/bar full.png";
    fullImg.alt = "";
    fullImg.draggable = false;
    this._gaugeFill.appendChild(fullImg);
    const trail = el("div", ["gauge-trail"]);
    this._gaugeTrail = trail;
    this._gaugeRoot.appendChild(emptyImg);
    this._gaugeRoot.appendChild(this._gaugeFill);
    this._gaugeRoot.appendChild(trail);

    // Distance counter
    this._distanceEl = el("span", [], { id: "hud-distance" });
    setText(this._distanceEl, `0 ${TEXT.hud.distanceUnit}`);

    // Active buffs
    this._buffList = el("div", ["buff-list"], { id: "hud-buffs" });

    // Boss panel (level 4). Built but hidden until the first
    // `onBossStateChanged` event fires; hidden again on level complete /
    // game start so non-boss runs never see it.
    this._bossPanel = el("div", ["hidden"], { id: "hud-boss" });
    const bossHeading = el("div", ["boss-heading"]);
    setText(bossHeading, "BOSS");
    this._bossState = el("div", ["boss-state"]);
    setText(this._bossState, "—");
    this._bossSheets = el("div", ["boss-sheets"]);
    setText(this._bossSheets, "");
    this._bossStrikes = el("div", ["boss-strikes"]);
    setText(this._bossStrikes, "");
    this._bossDizzy = el("div", ["boss-dizzy"]);
    setText(this._bossDizzy, "");
    this._bossPanel.appendChild(bossHeading);
    this._bossPanel.appendChild(this._bossState);
    this._bossPanel.appendChild(this._bossSheets);
    this._bossPanel.appendChild(this._bossStrikes);
    this._bossPanel.appendChild(this._bossDizzy);

    this._root.appendChild(this._hpList);
    this._root.appendChild(this._patchList);
    this._root.appendChild(this._gaugeRoot);
    this._root.appendChild(this._distanceEl);
    this._root.appendChild(this._buffList);
    this._root.appendChild(this._bossPanel);
    container.appendChild(this._root);

    // ─── Subscribe to events ────────────────────────────────────────────
    this._unsubs.push(
      bus.on("onHpChanged", ({ current, max, empty }) => {
        this._renderHp(current, max, empty);
      }),
      bus.on("onGaugeChanged", ({ fill }) => {
        this._gaugeFill.style.width = `${Math.round(fill * 100)}%`;
        if (fill < 1) {
          this._gaugeRoot.classList.remove("is-full");
          this._stopTrail();
        } else {
          this._gaugeRoot.classList.add("is-full");
          this._startTrail();
        }
      }),
      bus.on("onGaugeFull", () => {
        this._gaugeRoot.classList.add("is-full");
        this._startTrail();
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
      bus.on("onPatchApplied", ({ patchId }) => {
        this._appendPatchIcon(patchId);
      }),
      bus.on("onGameStart", () => {
        this._patchList.textContent = "";
        // Hide boss panel by default at the start of every run; it will
        // re-reveal as soon as the boss publishes its first event.
        setVisible(this._bossPanel, false);
      }),
      bus.on("onBossStateChanged", (e) => {
        setVisible(this._bossPanel, true);
        setText(this._bossState, e.state.toUpperCase());
        setText(
          this._bossSheets,
          `Dryer sheets: ${e.sheetHits} / ${e.sheetsToDizzy}`,
        );
        setText(
          this._bossStrikes,
          `Strikes: ${e.meleeStrikes} / ${e.meleeStrikesToWin}`,
        );
        if (e.state === "Dizzy") {
          setText(this._bossDizzy, `Dizzy: ${e.dizzyTimer.toFixed(1)}s`);
        } else {
          setText(this._bossDizzy, "");
        }
      }),
      bus.on("onLevelComplete", () => {
        setVisible(this._bossPanel, false);
      }),
      bus.on("onPlayerDeath", () => {
        setVisible(this._bossPanel, false);
      }),
    );
  }

  /** Make the HUD visible. */
  show(): void {
    setVisible(this._root, true);
  }

  /** Hide the HUD. */
  hide(): void {
    setVisible(this._root, false);
  }

  /** Unsubscribe all listeners and remove the HUD root from the DOM. */
  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
    this._stopTrail();
    this._root.parentElement?.removeChild(this._root);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /** Begin emitting trail dots (idempotent). */
  private _startTrail(): void {
    if (this._trailIntervalId !== null) return;
    // Emit the first burst immediately so the effect is visible right away.
    this._emitTrailBurst();
    this._trailIntervalId = setInterval(() => this._emitTrailBurst(), HUD._TRAIL_EMIT_MS);
  }

  /** Stop emitting trail dots and clear any in-flight ones. */
  private _stopTrail(): void {
    if (this._trailIntervalId !== null) {
      clearInterval(this._trailIntervalId);
      this._trailIntervalId = null;
    }
    this._gaugeTrail.textContent = "";
  }

  /** Emit a small radial burst of trail dots flying outward in random directions. */
  private _emitTrailBurst(): void {
    for (let i = 0; i < HUD._TRAIL_DOTS_PER_BURST; i++) {
      this._emitTrailDot();
    }
  }

  /** Append one trail dot, trigger its CSS transition, and remove it after the lifetime. */
  private _emitTrailDot(): void {
    const dot = el("span", ["gauge-trail-dot"]);
    // Random direction (full 360°) and random distance up to the configured range.
    const angle = Math.random() * Math.PI * 2;
    const dist = HUD._TRAIL_DOT_RANGE_PX * (0.5 + Math.random() * 0.5);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    dot.style.setProperty("--gauge-trail-dx", `${dx.toFixed(1)}px`);
    dot.style.setProperty("--gauge-trail-dy", `${dy.toFixed(1)}px`);
    this._gaugeTrail.appendChild(dot);
    // Force a reflow so the initial styles commit before we add the transition class,
    // otherwise the browser may collapse the two states into one (no animation).
    void dot.getBoundingClientRect();
    dot.classList.add("gauge-trail-dot-fade");
    setTimeout(() => {
      if (dot.parentElement === this._gaugeTrail) {
        this._gaugeTrail.removeChild(dot);
      }
    }, HUD._TRAIL_DOT_LIFETIME_MS);
  }

  private _renderHp(current: number, max: number, empty: number): void {
    // Clear existing containers.
    this._hpList.textContent = "";
    for (let i = 0; i < current; i++) {
      this._hpList.appendChild(this._makeHpIcon(true));
    }
    for (let i = 0; i < empty; i++) {
      this._hpList.appendChild(this._makeHpIcon(false));
    }
    // Remaining containers are unused (max - current - empty) — not rendered separately.
    void max; // referenced so TS doesn't complain about the parameter
  }

  /** Build a single HP container icon (`<img>`) for the HUD. */
  private _makeHpIcon(filled: boolean): HTMLImageElement {
    const img = el("img", ["hp-container", filled ? "filled" : "empty"]);
    img.src = filled ? "assets/objects/fullhp.png" : "assets/objects/emptyhp.png";
    img.alt = "";
    img.draggable = false;
    return img;
  }

  /** Append a small icon for the patch the player just applied. */
  private _appendPatchIcon(patchId: string): void {
    const entry = PATCH_CATALOG.find((p) => p.id === patchId);
    if (entry === undefined) return;
    const img = el("img", ["patch-applied"], { "data-patch-id": patchId });
    img.src = entry.icon;
    img.alt = entry.name;
    img.draggable = false;
    this._patchList.appendChild(img);
  }
}
