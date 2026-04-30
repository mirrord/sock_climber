import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

/**
 * Level identifiers selectable from the LevelSelect screen.
 *
 * Only level `1` is currently playable. Levels `2`–`4` are placeholder
 * entries: the buttons render in a disabled "Coming Soon" state and do not
 * fire the `onLevelSelected` callback when clicked.
 */
export type LevelId = 1 | 2 | 3 | 4;

/** Levels considered playable. Used to gate button enablement. */
const PLAYABLE_LEVELS: ReadonlySet<LevelId> = new Set<LevelId>([1, 2, 3]);

/**
 * LevelSelect — level selection overlay shown between the title screen and
 * gameplay. Replaces the direct title→game transition so the player can
 * eventually pick from multiple levels.
 *
 * Currently only Level 1 is implemented; Levels 2–4 render as disabled
 * placeholders. A Back button returns to the title screen via the
 * `onBack` callback.
 *
 * Gamepad navigation: D-pad up/down (buttons 12/13) or left-stick Y moves
 * focus between buttons; A (button 0) or Start (button 9) confirms; B
 * (button 1) acts as Back. Disabled placeholders are skipped during
 * navigation so focus can never land on a non-playable entry.
 */
export class LevelSelect {
  private readonly _overlay: HTMLElement;
  private readonly _buttons: HTMLButtonElement[] = [];
  private readonly _arrows: HTMLSpanElement[] = [];
  /** Per-button enabled flag, parallel to `_buttons`. */
  private readonly _enabled: boolean[] = [];
  private _focusIndex = 0;

  /** Tracks which gamepad buttons were pressed last poll tick (for edge detection). */
  private _gpPrevButtons = new Set<number>();
  /** Prevents left-stick Y from continuously firing — must re-center first. */
  private _gpAxisTriggered = false;
  private _gpRaf: number | null = null;

  constructor(
    onLevelSelected: (level: LevelId) => void,
    onBack: () => void,
    container: HTMLElement = document.body,
  ) {
    // ─── Build DOM ──────────────────────────────────────────────────────
    // Hidden initially — title screen is shown first; this is opened by
    // main when the player presses Start on the title.
    this._overlay = el("div", ["hidden"], { id: "level-select" });

    const heading = el("h1", []);
    setText(heading, TEXT.levelSelect.heading);

    const subtitle = el("p", ["title-subtitle"]);
    setText(subtitle, TEXT.levelSelect.subtitle);

    this._overlay.appendChild(heading);
    this._overlay.appendChild(subtitle);

    const levelList = el("div", ["level-list"]);
    const levelIds: LevelId[] = [1, 2, 3, 4];
    for (const levelId of levelIds) {
      const btn = el("button", ["level-btn"], { id: `level-select-${levelId}` });
      const isPlayable = PLAYABLE_LEVELS.has(levelId);
      const labelText = TEXT.levelSelect.levels[levelId];

      if (isPlayable) {
        setText(btn, labelText);
      } else {
        // Show a disabled placeholder. The label visually communicates that
        // the level isn't ready yet without removing it from the layout —
        // keeping the slots present preserves the final menu structure.
        setText(btn, `${labelText}  (${TEXT.levelSelect.comingSoon})`);
        btn.disabled = true;
        btn.classList.add("level-btn-disabled");
      }

      const arrow = el("span", ["menu-arrow", "hidden"]);
      setText(arrow, "▶ ");
      btn.prepend(arrow);

      btn.addEventListener("click", () => {
        if (!isPlayable) return;
        this._stopGamepadNav();
        setVisible(this._overlay, false);
        onLevelSelected(levelId);
      });

      levelList.appendChild(btn);
      this._buttons.push(btn);
      this._arrows.push(arrow);
      this._enabled.push(isPlayable);
    }
    this._overlay.appendChild(levelList);

    const backBtn = el("button", ["level-back"], { id: "level-select-back" });
    setText(backBtn, TEXT.levelSelect.back);
    const backArrow = el("span", ["menu-arrow", "hidden"]);
    setText(backArrow, "▶ ");
    backBtn.prepend(backArrow);
    backBtn.addEventListener("click", () => {
      this._stopGamepadNav();
      setVisible(this._overlay, false);
      onBack();
    });
    this._overlay.appendChild(backBtn);
    this._buttons.push(backBtn);
    this._arrows.push(backArrow);
    this._enabled.push(true);

    container.appendChild(this._overlay);

    // Land focus on the first enabled entry (Level 1 today; defensively
    // walk forward in case the playable set ever changes).
    this._focusIndex = this._firstEnabledIndex();
  }

  /** Show the level-select screen. */
  show(): void {
    this._focusIndex = this._firstEnabledIndex();
    this._updateArrows();
    setVisible(this._overlay, true);
    this._startGamepadNav();
  }

  /** Hide the level-select screen without destroying it. */
  hide(): void {
    this._stopGamepadNav();
    setVisible(this._overlay, false);
  }

  /** Remove the level-select overlay from the DOM. */
  destroy(): void {
    this._stopGamepadNav();
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  // ─── Gamepad navigation ───────────────────────────────────────────────

  private _firstEnabledIndex(): number {
    for (let i = 0; i < this._enabled.length; i++) {
      if (this._enabled[i]) return i;
    }
    return 0;
  }

  private _updateArrows(): void {
    for (let i = 0; i < this._arrows.length; i++) {
      setVisible(this._arrows[i]!, i === this._focusIndex);
    }
  }

  private _moveFocus(delta: number): void {
    // Skip disabled entries so focus only ever rests on actionable buttons.
    const n = this._buttons.length;
    let next = this._focusIndex;
    for (let i = 0; i < n; i++) {
      next = (next + delta + n) % n;
      if (this._enabled[next]) {
        this._focusIndex = next;
        this._updateArrows();
        return;
      }
    }
  }

  private _startGamepadNav(): void {
    if (this._gpRaf !== null) return;
    // Seed prevButtons with whatever is currently held so a button still
    // depressed from the title-screen confirm doesn't immediately re-trigger
    // here on the first tick.
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

    const justPressed = (btn: number): boolean =>
      pressed.has(btn) && !this._gpPrevButtons.has(btn);

    if (justPressed(13)) this._moveFocus(+1); // D-pad down
    if (justPressed(12)) this._moveFocus(-1); // D-pad up
    if (justPressed(0) || justPressed(9)) {
      // A or Start → confirm currently focused button.
      this._buttons[this._focusIndex]!.click();
    }
    if (justPressed(1)) {
      // B → Back. Always the last button in the list.
      this._buttons[this._buttons.length - 1]!.click();
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
