import type { Input } from "../input/Input.js";
import type { Action } from "../input/Actions.js";
import { ACTIONS } from "../input/Actions.js";
import type { AudioBus, AudioChannel, AudioSettings } from "../audio/index.js";
import {
  applyAudioSettings,
  createDefaultAudioSettings,
  saveAudioSettings,
} from "../audio/index.js";
import { pollFirstActiveAxis, pollFirstPressedButton } from "../input/Gamepad.js";
import { el, setText, setVisible } from "./dom.js";
import { TEXT } from "./i18n.js";

type ListenState =
  | { kind: "key"; oldKey: string | undefined; action: Action }
  | { kind: "gamepadButton"; oldIndex: number | undefined; action: Action }
  | { kind: "gamepadAxis"; oldIndex: number }
  | null;

/**
 * PlayStation-style labels for standard-mapping gamepad button indices.
 * Buttons not in this table fall back to `"Btn N"`.
 */
const PS_BUTTON_LABELS: Record<number, string> = {
  0: "\u2715 Cross",
  1: "\u25EF Circle",
  2: "\u25A1 Square",
  3: "\u25B3 Triangle",
  4: "L1",
  5: "R1",
  6: "L2",
  7: "R2",
  8: "Create",
  9: "Options",
  10: "L3",
  11: "R3",
  12: "D-Pad \u2191",
  13: "D-Pad \u2193",
  14: "D-Pad \u2190",
  15: "D-Pad \u2192",
  16: "PS",
  17: "Touchpad",
};

function psButtonLabel(index: number): string {
  return PS_BUTTON_LABELS[index] ?? `Btn ${index}`;
}

function firstKeyForAction(
  kb: Readonly<Partial<Record<string, Action>>>,
  action: Action,
): string | undefined {
  for (const [code, a] of Object.entries(kb)) {
    if (a === action) return code;
  }
  return undefined;
}

function firstButtonForAction(
  gp: Readonly<Partial<Record<number, Action>>>,
  action: Action,
): number | undefined {
  for (const [idxStr, a] of Object.entries(gp)) {
    if (a === action) return Number(idxStr);
  }
  return undefined;
}

interface FocusItem {
  /** Element to highlight (gets `.gp-focused` class) and to scroll into view. */
  element: HTMLElement;
  /** Optional arrow span prepended to the element; toggled with focus. */
  arrow: HTMLSpanElement | null;
  /** Invoked on A / Start. */
  onConfirm: () => void;
  /** Invoked on D-pad left/right or stick X. Optional. */
  onAdjust?: (delta: number) => void;
}

const AUDIO_CHANNELS: readonly AudioChannel[] = ["master", "music", "sfx"] as const;
const SLIDER_STEP = 5;
const NAV_REPEAT_INITIAL_MS = 350;
const NAV_REPEAT_INTERVAL_MS = 110;

/**
 * Settings — key/gamepad rebinding and audio options overlay.
 *
 * Call `show()` / `hide()` to open/close. Does not use the EventBus directly —
 * the caller (Pause menu or Title screen) is responsible for opening it.
 *
 * Sections:
 * - Audio: master / music / sfx volume sliders + mute checkboxes.
 * - Keyboard: click a row → press a key to rebind.
 * - Gamepad Buttons / Axes: click a row → press a button or move an axis.
 *
 * Pressing Escape during any listen mode cancels it. Each section has a
 * "Reset to defaults" button.
 *
 * Gamepad navigation:
 * - D-pad up/down (12/13) or left-stick Y → move focus between controls.
 * - D-pad left/right (14/15) or left-stick X → adjust focused slider.
 * - A (0) or Start (9) → confirm focused control (toggle, click, rebind).
 * - B (1) → close the overlay.
 * The focused control is highlighted with a yellow outline and (where it does
 * not break layout) a `▶` arrow.
 *
 * Persists key bindings via `Input.setKeyBinding` / `setGamepadButtonBinding`
 * etc., and audio under the `sock_climber_audio` localStorage key.
 */
export class Settings {
  private readonly _overlay: HTMLElement;
  private readonly _input: Input;
  private readonly _audioBus: AudioBus;
  private readonly _audioSettings: AudioSettings;

  /** Callback invoked when the overlay is closed; cleared after each call. */
  private _onClose: (() => void) | null = null;

  private readonly _bindingTable: HTMLElement;
  private readonly _gpButtonTable: HTMLElement;
  private readonly _gpAxisTable: HTMLElement;
  private readonly _audioRows: Map<
    AudioChannel,
    { slider: HTMLInputElement; mute: HTMLInputElement; value: HTMLElement }
  > = new Map();

  private readonly _audioResetBtn: HTMLButtonElement;
  private readonly _kbResetBtn: HTMLButtonElement;
  private readonly _gpBtnResetBtn: HTMLButtonElement;
  private readonly _gpAxResetBtn: HTMLButtonElement;
  private readonly _closeBtn: HTMLButtonElement;

  /** Active listen mode for any kind of rebinding. */
  private _listening: ListenState = null;
  /** Element whose label changes during listen mode (for restoring on cancel). */
  private _listeningRow: HTMLElement | null = null;

  /** Buttons that were already pressed when listen-mode began; ignored until released. */
  private _listenSeedButtons: Set<number> = new Set();
  /** Axis directions that were already deflected when listen-mode began. */
  private _listenSeedAxes: Map<number, 1 | -1> = new Map();

  private readonly _keyListener: (e: KeyboardEvent) => void;
  private _rafHandle: number | null = null;

  /** Gamepad nav state — separate from the rebind-capture state. */
  private _gpNavPrevButtons = new Set<number>();
  /** Per-axis re-trigger guards (must re-center before triggering again). */
  private _gpAxisTriggered: Map<number, boolean> = new Map();
  /** Timestamp at which the next held-direction repeat for axis Y / X may fire. */
  private _gpAxisYNextRepeat = 0;
  private _gpAxisXNextRepeat = 0;
  /** Timestamps for D-pad held-button repeats. */
  private _gpButtonNextRepeat: Map<number, number> = new Map();

  /** Flat list of focusable controls, rebuilt on every render. */
  private _focusables: FocusItem[] = [];
  private _focusIndex = 0;

  constructor(
    input: Input,
    audioBus: AudioBus,
    audioSettings: AudioSettings,
    container: HTMLElement = document.body,
  ) {
    this._input = input;
    this._audioBus = audioBus;
    this._audioSettings = audioSettings;

    // ─── Build DOM ──────────────────────────────────────────────────────
    this._overlay = el("div", ["hidden"], { id: "settings" });

    const heading = el("h2", []);
    setText(heading, TEXT.settings.heading);
    this._overlay.appendChild(heading);

    // Audio section
    const audioSection = el("section", ["settings-section"], { "data-section": "audio" });
    const audioHeading = el("h3", []);
    setText(audioHeading, TEXT.settings.audio);
    audioSection.appendChild(audioHeading);
    for (const ch of AUDIO_CHANNELS) {
      audioSection.appendChild(this._buildAudioRow(ch));
    }
    this._audioResetBtn = this._buildResetButton("audio", () => this._resetAudio());
    audioSection.appendChild(this._audioResetBtn);
    this._overlay.appendChild(audioSection);

    // Keyboard section
    const kbSection = el("section", ["settings-section"], { "data-section": "keyboard" });
    const kbHeading = el("h3", []);
    setText(kbHeading, TEXT.settings.keybinds);
    kbSection.appendChild(kbHeading);
    this._bindingTable = el("div", ["binding-table"]);
    kbSection.appendChild(this._bindingTable);
    this._kbResetBtn = this._buildResetButton("keyboard", () => {
      this._cancelListen();
      this._input.resetKeyboardBindings();
      this._renderAll();
    });
    kbSection.appendChild(this._kbResetBtn);
    this._overlay.appendChild(kbSection);

    // Gamepad buttons section
    const gpBtnSection = el("section", ["settings-section"], {
      "data-section": "gamepad-buttons",
    });
    const gpBtnHeading = el("h3", []);
    setText(gpBtnHeading, TEXT.settings.gamepadButtons);
    gpBtnSection.appendChild(gpBtnHeading);
    this._gpButtonTable = el("div", ["gamepad-button-table"]);
    gpBtnSection.appendChild(this._gpButtonTable);
    this._gpBtnResetBtn = this._buildResetButton("gamepad-buttons", () => {
      this._cancelListen();
      this._input.resetGamepadBindings();
      this._renderAll();
    });
    gpBtnSection.appendChild(this._gpBtnResetBtn);
    this._overlay.appendChild(gpBtnSection);

    // Gamepad axes section
    const gpAxSection = el("section", ["settings-section"], {
      "data-section": "gamepad-axes",
    });
    const gpAxHeading = el("h3", []);
    setText(gpAxHeading, TEXT.settings.gamepadAxes);
    gpAxSection.appendChild(gpAxHeading);
    this._gpAxisTable = el("div", ["gamepad-axis-table"]);
    gpAxSection.appendChild(this._gpAxisTable);
    this._gpAxResetBtn = this._buildResetButton("gamepad-axes", () => {
      this._cancelListen();
      this._input.resetGamepadBindings();
      this._renderAll();
    });
    gpAxSection.appendChild(this._gpAxResetBtn);
    this._overlay.appendChild(gpAxSection);

    // Close
    this._closeBtn = el("button", [], { id: "settings-close" }) as HTMLButtonElement;
    setText(this._closeBtn, TEXT.settings.close);
    this._prependArrow(this._closeBtn);
    this._closeBtn.addEventListener("click", () => this.hide());
    this._overlay.appendChild(this._closeBtn);

    container.appendChild(this._overlay);

    // ─── Listen-mode keydown handler ────────────────────────────────────
    // Capture phase + stopImmediatePropagation: while the user is rebinding,
    // keys must only set the new binding and never bubble to other handlers
    // (e.g. Pause toggling on Escape, or in-game input on movement keys).
    this._keyListener = (e: KeyboardEvent) => {
      if (this._listening === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Escape always cancels any listen mode (do NOT rebind to Escape).
      if (e.code === "Escape") {
        this._cancelListen();
        return;
      }
      if (this._listening.kind !== "key") {
        // Wrong listen kind for keyboard; swallow the key but ignore.
        return;
      }
      const { oldKey, action } = this._listening;
      this._listening = null;
      this._listeningRow = null;
      this._applyKeyRebind(oldKey, e.code, action);
      this._renderAll();
    };
    document.addEventListener("keydown", this._keyListener, true);
  }

  /** Show the overlay and render the current state. */
  show(onClose?: () => void): void {
    this._onClose = onClose ?? null;
    this._focusIndex = 0;
    this._renderAll();
    setVisible(this._overlay, true);
    this._scheduleGamepadPoll();
  }

  /** Hide the overlay and cancel any pending listen mode. */
  hide(): void {
    this._cancelListen();
    setVisible(this._overlay, false);
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    this._gpNavPrevButtons.clear();
    this._gpAxisTriggered.clear();
    this._gpButtonNextRepeat.clear();
    const cb = this._onClose;
    this._onClose = null;
    cb?.();
  }

  /** Remove all event listeners and detach the overlay. */
  destroy(): void {
    this.hide();
    document.removeEventListener("keydown", this._keyListener, true);
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  /**
   * True while the user is in any rebind listen mode. Callers (e.g. the
   * main loop) should not interpret a Pause press as "close settings"
   * during this time, so the press can be captured as a new binding.
   */
  get isListening(): boolean {
    return this._listening !== null;
  }

  /**
   * Currently focused control element (for tests / introspection).
   * Returns `null` if there are no focusables.
   */
  get focusedElement(): HTMLElement | null {
    return this._focusables[this._focusIndex]?.element ?? null;
  }

  /**
   * Single tick of gamepad navigation polling. Public so tests can drive it
   * deterministically without running a real animation frame loop.
   */
  tickGamepadNav(): void {
    this._tickGamepadNav();
  }

  /**
   * Single tick of gamepad capture polling. Public so tests can drive it
   * deterministically without running a real animation frame loop.
   */
  tickGamepadCapture(): void {
    if (this._listening === null) return;
    this._refreshListenSeeds();
    if (this._listening.kind === "gamepadButton") {
      const result = pollFirstPressedButton(this._listenSeedButtons);
      if (result === null) return;
      const { oldIndex, action } = this._listening;
      this._listening = null;
      this._listeningRow = null;
      this._listenSeedButtons.clear();
      this._listenSeedAxes.clear();
      this._applyButtonRebind(oldIndex, result.index, action);
      this._suppressHeldInputsForNav();
      this._renderAll();
    } else if (this._listening.kind === "gamepadAxis") {
      const result = pollFirstActiveAxis(0.5, this._listenSeedAxes);
      if (result === null) return;
      const { oldIndex } = this._listening;
      const oldMapping = this._input.bindings.gamepadAxes[oldIndex];
      if (oldMapping === undefined) {
        this._listening = null;
        this._listeningRow = null;
        return;
      }
      // Preserve the action pair, optionally swapping if user pushed negative.
      const newMapping =
        result.sign === 1
          ? { positive: oldMapping.positive, negative: oldMapping.negative }
          : { positive: oldMapping.negative, negative: oldMapping.positive };
      this._listening = null;
      this._listeningRow = null;
      this._listenSeedButtons.clear();
      this._listenSeedAxes.clear();
      if (oldIndex !== result.index) {
        this._input.setGamepadAxisBinding(oldIndex, undefined);
      }
      this._input.setGamepadAxisBinding(result.index, newMapping);
      this._suppressHeldInputsForNav();
      this._renderAll();
    }
  }

  /**
   * After completing a rebind capture, treat all currently-held buttons and
   * deflected axes as already-seen by the navigation layer. Without this, the
   * very same press that completed the capture would be detected as a fresh
   * "just pressed" by the next nav tick — e.g. binding an action to Circle
   * (button 1) would immediately close the menu.
   */
  private _suppressHeldInputsForNav(): void {
    let pad: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (const p of pads) { if (p !== null && p.connected) { pad = p; break; } }
    } catch { return; }
    if (pad === null) return;
    const held = new Set<number>();
    for (let i = 0; i < pad.buttons.length; i++) {
      if (pad.buttons[i]?.pressed) held.add(i);
    }
    this._gpNavPrevButtons = held;
    // Mark axes that are currently deflected as already "triggered" so the
    // next nav tick will not register them until they recenter.
    for (let i = 0; i < pad.axes.length; i++) {
      if (Math.abs(pad.axes[i] ?? 0) >= 0.4) {
        this._gpAxisTriggered.set(i, true);
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private _scheduleGamepadPoll(): void {
    if (typeof requestAnimationFrame !== "function") return;
    this._gpNavPrevButtons.clear();
    this._gpAxisTriggered.clear();
    this._gpButtonNextRepeat.clear();
    const tick = (): void => {
      this.tickGamepadCapture();
      this._tickGamepadNav();
      if (!this._overlay.classList.contains("hidden")) {
        this._rafHandle = requestAnimationFrame(tick);
      }
    };
    this._rafHandle = requestAnimationFrame(tick);
  }

  /**
   * Gamepad navigation tick: navigates focus, adjusts sliders, confirms the
   * focused control with A/Start, and closes with B. While capturing a
   * rebind, navigation is suspended (the capture poll handles it).
   */
  private _tickGamepadNav(): void {
    let gp: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) { gp = pad; break; }
      }
    } catch { return; }
    if (gp === null) {
      this._gpNavPrevButtons.clear();
      this._gpAxisTriggered.clear();
      this._gpButtonNextRepeat.clear();
      return;
    }

    const pressed = new Set<number>();
    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i]?.pressed) pressed.add(i);
    }

    // While capturing a rebind, do not navigate (would conflict with capture).
    if (this._listening !== null) {
      this._gpNavPrevButtons = pressed;
      return;
    }

    const now = performance.now();
    const justPressed = (btn: number): boolean =>
      pressed.has(btn) && !this._gpNavPrevButtons.has(btn);

    /** True on initial press AND on auto-repeat while held. */
    const repeatPressed = (btn: number): boolean => {
      if (!pressed.has(btn)) {
        this._gpButtonNextRepeat.delete(btn);
        return false;
      }
      if (justPressed(btn)) {
        this._gpButtonNextRepeat.set(btn, now + NAV_REPEAT_INITIAL_MS);
        return true;
      }
      const next = this._gpButtonNextRepeat.get(btn);
      if (next !== undefined && now >= next) {
        this._gpButtonNextRepeat.set(btn, now + NAV_REPEAT_INTERVAL_MS);
        return true;
      }
      return false;
    };

    // B (1) → close.
    if (justPressed(1)) {
      this._gpNavPrevButtons = pressed;
      this.hide();
      return;
    }

    // A (0) or Start (9) → confirm focused item.
    if (justPressed(0) || justPressed(9)) {
      this._confirmFocused();
      this._gpNavPrevButtons = pressed;
      return;
    }

    // D-pad up/down — move focus.
    if (repeatPressed(13)) this._moveFocus(+1);
    if (repeatPressed(12)) this._moveFocus(-1);

    // D-pad left/right — adjust slider.
    if (repeatPressed(14)) this._adjustFocused(-1);
    if (repeatPressed(15)) this._adjustFocused(+1);

    // Left-stick Y — move focus with auto-repeat after a centered re-trigger.
    const stickY = gp.axes[1] ?? 0;
    if (Math.abs(stickY) < 0.4) {
      this._gpAxisTriggered.set(1, false);
    } else {
      const dir = stickY > 0 ? +1 : -1;
      if (this._gpAxisTriggered.get(1) !== true) {
        this._gpAxisTriggered.set(1, true);
        this._gpAxisYNextRepeat = now + NAV_REPEAT_INITIAL_MS;
        this._moveFocus(dir);
      } else if (now >= this._gpAxisYNextRepeat) {
        this._gpAxisYNextRepeat = now + NAV_REPEAT_INTERVAL_MS;
        this._moveFocus(dir);
      }
    }

    // Left-stick X — adjust focused slider with auto-repeat.
    const stickX = gp.axes[0] ?? 0;
    if (Math.abs(stickX) < 0.4) {
      this._gpAxisTriggered.set(0, false);
    } else {
      const dir = stickX > 0 ? +1 : -1;
      if (this._gpAxisTriggered.get(0) !== true) {
        this._gpAxisTriggered.set(0, true);
        this._gpAxisXNextRepeat = now + NAV_REPEAT_INITIAL_MS;
        this._adjustFocused(dir);
      } else if (now >= this._gpAxisXNextRepeat) {
        this._gpAxisXNextRepeat = now + NAV_REPEAT_INTERVAL_MS;
        this._adjustFocused(dir);
      }
    }

    this._gpNavPrevButtons = pressed;
  }

  private _cancelListen(): void {
    if (this._listening === null) return;
    this._listening = null;
    this._listeningRow = null;
    this._listenSeedButtons.clear();
    this._listenSeedAxes.clear();
    this._renderAll();
  }

  private _renderAll(): void {
    this._renderAudio();
    this._renderKeyboard();
    this._renderGamepad();
    this._collectFocusables();
    this._updateFocus();
  }

  // ─── Audio ──────────────────────────────────────────────────────────────

  private _buildAudioRow(channel: AudioChannel): HTMLElement {
    const row = el("div", ["audio-row"], { "data-channel": channel });

    const label = el("label", ["audio-label"]);
    setText(label, this._audioLabel(channel));
    row.appendChild(label);

    const slider = el("input", ["audio-slider"]) as HTMLInputElement;
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.addEventListener("input", () => {
      const v = Number(slider.value) / 100;
      this._audioBus.setVolume(channel, v);
      this._audioSettings[channel] = v;
      saveAudioSettings(this._audioSettings);
      const valueEl = this._audioRows.get(channel)?.value;
      if (valueEl !== undefined) setText(valueEl, slider.value);
    });
    row.appendChild(slider);

    const value = el("span", ["audio-value"]);
    row.appendChild(value);

    const muteWrap = el("label", ["audio-mute-wrap"]);
    const mute = el("input", ["audio-mute"]) as HTMLInputElement;
    mute.type = "checkbox";
    mute.addEventListener("change", () => {
      this._audioBus.setMute(channel, mute.checked);
      this._setMuteField(channel, mute.checked);
      saveAudioSettings(this._audioSettings);
    });
    muteWrap.appendChild(mute);
    const muteText = el("span", []);
    setText(muteText, TEXT.settings.muted);
    muteWrap.appendChild(muteText);
    row.appendChild(muteWrap);

    this._audioRows.set(channel, { slider, mute, value });
    return row;
  }

  private _renderAudio(): void {
    for (const ch of AUDIO_CHANNELS) {
      const row = this._audioRows.get(ch);
      if (row === undefined) continue;
      const v = this._audioSettings[ch];
      const pct = String(Math.round((v as number) * 100));
      row.slider.value = pct;
      setText(row.value, pct);
      row.mute.checked = this._getMuteField(ch);
    }
  }

  private _resetAudio(): void {
    const defaults = createDefaultAudioSettings();
    this._audioSettings.master = defaults.master;
    this._audioSettings.music = defaults.music;
    this._audioSettings.sfx = defaults.sfx;
    this._audioSettings.mutedMaster = defaults.mutedMaster;
    this._audioSettings.mutedMusic = defaults.mutedMusic;
    this._audioSettings.mutedSfx = defaults.mutedSfx;
    applyAudioSettings(this._audioBus, this._audioSettings);
    saveAudioSettings(this._audioSettings);
    this._renderAll();
  }

  private _audioLabel(channel: AudioChannel): string {
    if (channel === "master") return TEXT.settings.master;
    if (channel === "music") return TEXT.settings.music;
    return TEXT.settings.sfx;
  }

  private _setMuteField(channel: AudioChannel, muted: boolean): void {
    if (channel === "master") this._audioSettings.mutedMaster = muted;
    else if (channel === "music") this._audioSettings.mutedMusic = muted;
    else this._audioSettings.mutedSfx = muted;
  }

  private _getMuteField(channel: AudioChannel): boolean {
    if (channel === "master") return this._audioSettings.mutedMaster;
    if (channel === "music") return this._audioSettings.mutedMusic;
    return this._audioSettings.mutedSfx;
  }

  // ─── Keyboard ───────────────────────────────────────────────────────────

  /**
   * Apply a keyboard rebind, swapping any displaced action onto the freed
   * key instead of dropping it. Re-binding to the current key is a no-op.
   */
  private _applyKeyRebind(
    oldKey: string | undefined,
    newKey: string,
    action: Action,
  ): void {
    if (oldKey === newKey) return;
    const displaced = this._input.bindings.keyboard[newKey];
    if (displaced !== undefined && displaced !== action && oldKey !== undefined) {
      this._input.setKeyBinding(oldKey, displaced);
    } else if (oldKey !== undefined) {
      this._input.setKeyBinding(oldKey, undefined);
    }
    this._input.setKeyBinding(newKey, action);
  }

  private _renderKeyboard(): void {
    this._bindingTable.textContent = "";
    const kb = this._input.bindings.keyboard;
    for (const action of ACTIONS) {
      const code = firstKeyForAction(kb, action);
      const attrs: Record<string, string> = { "data-action": action };
      if (code !== undefined) attrs["data-key"] = code;
      const row = el("div", ["binding-row"], attrs);
      const arrow = this._prependArrow(row);
      const actionLabel = el("span", ["binding-action"]);
      setText(actionLabel, action);
      row.appendChild(actionLabel);
      const keyLabel = el("span", ["binding-key"]);
      const isListening =
        this._listening?.kind === "key" && this._listening.action === action;
      if (isListening) {
        setText(keyLabel, TEXT.settings.listening);
        this._listeningRow = row;
      } else {
        setText(keyLabel, code !== undefined ? code : TEXT.settings.unbound);
      }
      row.appendChild(keyLabel);
      (row as HTMLElement & { _arrow?: HTMLSpanElement })._arrow = arrow;
      row.addEventListener("click", () => {
        this._cancelListen();
        this._enterListen({ kind: "key", oldKey: code, action });
      });
      this._bindingTable.appendChild(row);
    }
  }

  // ─── Gamepad ────────────────────────────────────────────────────────────

  /**
   * Apply a gamepad button rebind, swapping any displaced action onto the
   * freed button index instead of dropping it. Re-binding to the current
   * button is a no-op.
   */
  private _applyButtonRebind(
    oldIndex: number | undefined,
    newIndex: number,
    action: Action,
  ): void {
    if (oldIndex === newIndex) return;
    const displaced = this._input.bindings.gamepadButtons[newIndex];
    if (displaced !== undefined && displaced !== action && oldIndex !== undefined) {
      this._input.setGamepadButtonBinding(oldIndex, displaced);
    } else if (oldIndex !== undefined) {
      this._input.setGamepadButtonBinding(oldIndex, undefined);
    }
    this._input.setGamepadButtonBinding(newIndex, action);
  }

  private _renderGamepad(): void {
    // Buttons — one row per Action, displayed with the PlayStation-style
    // label of its currently bound button (or "—" if unbound).
    this._gpButtonTable.textContent = "";
    const gpBtns = this._input.bindings.gamepadButtons;
    for (const action of ACTIONS) {
      const idx = firstButtonForAction(gpBtns, action);
      const attrs: Record<string, string> = { "data-action": action };
      if (idx !== undefined) attrs["data-index"] = String(idx);
      const row = el("div", ["gamepad-button-row"], attrs);
      const arrow = this._prependArrow(row);
      const actionLabel = el("span", ["binding-action"]);
      setText(actionLabel, action);
      row.appendChild(actionLabel);
      const keyLabel = el("span", ["binding-key"]);
      const isListening =
        this._listening?.kind === "gamepadButton" &&
        this._listening.action === action;
      if (isListening) {
        setText(keyLabel, TEXT.settings.listening);
        this._listeningRow = row;
      } else {
        setText(
          keyLabel,
          idx !== undefined ? psButtonLabel(idx) : TEXT.settings.unbound,
        );
      }
      row.appendChild(keyLabel);
      (row as HTMLElement & { _arrow?: HTMLSpanElement })._arrow = arrow;
      row.addEventListener("click", () => {
        this._cancelListen();
        this._enterListen({ kind: "gamepadButton", oldIndex: idx, action });
      });
      this._gpButtonTable.appendChild(row);
    }

    // Axes
    this._gpAxisTable.textContent = "";
    const gpAxes = this._input.bindings.gamepadAxes;
    for (const [idxStr, mapping] of Object.entries(gpAxes)) {
      if (mapping === undefined) continue;
      const idx = Number(idxStr);
      const row = el("div", ["gamepad-axis-row"], { "data-index": idxStr });
      const arrow = this._prependArrow(row);
      const label = el("span", []);
      setText(label, `Axis ${idxStr}: + ${mapping.positive} / − ${mapping.negative}`);
      row.appendChild(label);
      const isListening =
        this._listening?.kind === "gamepadAxis" && this._listening.oldIndex === idx;
      if (isListening) {
        const tag = el("span", []);
        setText(tag, ` ${TEXT.settings.listening}`);
        row.appendChild(tag);
        this._listeningRow = row;
      }
      (row as HTMLElement & { _arrow?: HTMLSpanElement })._arrow = arrow;
      row.addEventListener("click", () => {
        this._cancelListen();
        this._enterListen({ kind: "gamepadAxis", oldIndex: idx });
      });
      this._gpAxisTable.appendChild(row);
    }
  }

  private _buildResetButton(section: string, onClick: () => void): HTMLButtonElement {
    const btn = el("button", ["reset-section"], { "data-reset": section }) as HTMLButtonElement;
    this._prependArrow(btn);
    const label = el("span", []);
    setText(label, TEXT.settings.resetSection);
    btn.appendChild(label);
    btn.addEventListener("click", onClick);
    return btn;
  }

  private _prependArrow(target: HTMLElement): HTMLSpanElement {
    const arrow = el("span", ["menu-arrow", "hidden"]) as HTMLSpanElement;
    setText(arrow, "▶ ");
    target.prepend(arrow);
    return arrow;
  }

  // ─── Focus / navigation ─────────────────────────────────────────────────

  private _enterListen(state: ListenState): void {
    this._listening = state;
    this._seedListenInputs();
    // Re-render so the listening row gets its "[listening]" tag.
    this._renderAll();
    // Focus is preserved by index; clamp + re-apply.
    this._updateFocus();
  }

  private _seedListenInputs(): void {
    this._listenSeedButtons.clear();
    this._listenSeedAxes.clear();
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad === null || !pad.connected) continue;
        for (let i = 0; i < pad.buttons.length; i++) {
          if (pad.buttons[i]?.pressed) this._listenSeedButtons.add(i);
        }
        for (let i = 0; i < pad.axes.length; i++) {
          const v = pad.axes[i] ?? 0;
          if (v > 0.5) this._listenSeedAxes.set(i, 1);
          else if (v < -0.5) this._listenSeedAxes.set(i, -1);
        }
        break;
      }
    } catch { /* ignore — no gamepad access */ }
  }

  private _refreshListenSeeds(): void {
    if (this._listenSeedButtons.size === 0 && this._listenSeedAxes.size === 0) return;
    let pads: (Gamepad | null)[];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch { return; }
    let pad: Gamepad | null = null;
    for (const p of pads) { if (p !== null && p.connected) { pad = p; break; } }
    if (pad === null) {
      // Treat disconnect as full release.
      this._listenSeedButtons.clear();
      this._listenSeedAxes.clear();
      return;
    }
    for (const idx of Array.from(this._listenSeedButtons)) {
      if (!pad.buttons[idx]?.pressed) this._listenSeedButtons.delete(idx);
    }
    for (const [idx, sign] of Array.from(this._listenSeedAxes)) {
      const v = pad.axes[idx] ?? 0;
      if (sign === 1 ? v <= 0.5 : v >= -0.5) this._listenSeedAxes.delete(idx);
    }
  }

  private _collectFocusables(): void {
    this._focusables.length = 0;
    // Audio rows: slider + mute checkbox per channel.
    for (const ch of AUDIO_CHANNELS) {
      const row = this._audioRows.get(ch);
      if (row === undefined) continue;
      this._focusables.push({
        element: row.slider,
        arrow: null,
        onConfirm: () => { /* slider needs adjust, not confirm */ },
        onAdjust: (delta) => this._adjustSlider(ch, delta),
      });
      this._focusables.push({
        element: row.mute,
        arrow: null,
        onConfirm: () => this._toggleMute(ch),
      });
    }
    this._focusables.push(this._focusableButton(this._audioResetBtn));

    // Keyboard binding rows.
    for (const row of Array.from(this._bindingTable.children) as HTMLElement[]) {
      this._focusables.push(this._focusableRow(row));
    }
    this._focusables.push(this._focusableButton(this._kbResetBtn));

    // Gamepad button rows.
    for (const row of Array.from(this._gpButtonTable.children) as HTMLElement[]) {
      this._focusables.push(this._focusableRow(row));
    }
    this._focusables.push(this._focusableButton(this._gpBtnResetBtn));

    // Gamepad axis rows.
    for (const row of Array.from(this._gpAxisTable.children) as HTMLElement[]) {
      this._focusables.push(this._focusableRow(row));
    }
    this._focusables.push(this._focusableButton(this._gpAxResetBtn));

    // Close.
    this._focusables.push(this._focusableButton(this._closeBtn));
  }

  private _focusableRow(row: HTMLElement): FocusItem {
    const arrow = (row as HTMLElement & { _arrow?: HTMLSpanElement })._arrow ?? null;
    return {
      element: row,
      arrow,
      onConfirm: () => row.click(),
    };
  }

  private _focusableButton(btn: HTMLButtonElement): FocusItem {
    const arrow = btn.querySelector<HTMLSpanElement>(".menu-arrow") ?? null;
    return {
      element: btn,
      arrow,
      onConfirm: () => btn.click(),
    };
  }

  private _updateFocus(): void {
    if (this._focusables.length === 0) {
      this._focusIndex = 0;
      return;
    }
    if (this._focusIndex >= this._focusables.length) {
      this._focusIndex = this._focusables.length - 1;
    }
    if (this._focusIndex < 0) this._focusIndex = 0;
    for (let i = 0; i < this._focusables.length; i++) {
      const item = this._focusables[i]!;
      const focused = i === this._focusIndex;
      item.element.classList.toggle("gp-focused", focused);
      if (item.arrow !== null) {
        item.arrow.classList.toggle("hidden", !focused);
      }
    }
    const focusedEl = this._focusables[this._focusIndex]?.element;
    if (focusedEl !== undefined && typeof focusedEl.scrollIntoView === "function") {
      try {
        focusedEl.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch { /* jsdom may not implement; ignore. */ }
    }
  }

  private _moveFocus(delta: number): void {
    if (this._focusables.length === 0) return;
    const n = this._focusables.length;
    this._focusIndex = (this._focusIndex + delta + n) % n;
    this._updateFocus();
  }

  private _confirmFocused(): void {
    const item = this._focusables[this._focusIndex];
    if (item === undefined) return;
    item.onConfirm();
  }

  private _adjustFocused(delta: number): void {
    const item = this._focusables[this._focusIndex];
    if (item === undefined || item.onAdjust === undefined) return;
    item.onAdjust(delta);
  }

  private _adjustSlider(channel: AudioChannel, dir: number): void {
    const row = this._audioRows.get(channel);
    if (row === undefined) return;
    const cur = Number(row.slider.value);
    const next = Math.max(0, Math.min(100, cur + dir * SLIDER_STEP));
    if (next === cur) return;
    row.slider.value = String(next);
    row.slider.dispatchEvent(new Event("input"));
  }

  private _toggleMute(channel: AudioChannel): void {
    const row = this._audioRows.get(channel);
    if (row === undefined) return;
    row.mute.checked = !row.mute.checked;
    row.mute.dispatchEvent(new Event("change"));
  }
}
