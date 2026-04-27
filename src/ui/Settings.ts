import type { Input } from "../input/Input.js";
import type { Action } from "../input/Actions.js";
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
  | { kind: "key"; oldKey: string; action: Action }
  | { kind: "gamepadButton"; oldIndex: number; action: Action }
  | { kind: "gamepadAxis"; oldIndex: number }
  | null;

const AUDIO_CHANNELS: readonly AudioChannel[] = ["master", "music", "sfx"] as const;

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
 * Persists key bindings via `Input.setKeyBinding` / `setGamepadButtonBinding`
 * etc., and audio under the `sock_climber_audio` localStorage key.
 */
export class Settings {
  private readonly _overlay: HTMLElement;
  private readonly _input: Input;
  private readonly _audioBus: AudioBus;
  private readonly _audioSettings: AudioSettings;

  private readonly _bindingTable: HTMLElement;
  private readonly _gpButtonTable: HTMLElement;
  private readonly _gpAxisTable: HTMLElement;
  private readonly _audioRows: Map<
    AudioChannel,
    { slider: HTMLInputElement; mute: HTMLInputElement; value: HTMLElement }
  > = new Map();

  /** Active listen mode for any kind of rebinding. */
  private _listening: ListenState = null;
  /** Element whose label changes during listen mode (for restoring on cancel). */
  private _listeningRow: HTMLElement | null = null;

  private readonly _keyListener: (e: KeyboardEvent) => void;
  private _rafHandle: number | null = null;

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
    audioSection.appendChild(this._buildResetButton("audio", () => this._resetAudio()));
    this._overlay.appendChild(audioSection);

    // Keyboard section
    const kbSection = el("section", ["settings-section"], { "data-section": "keyboard" });
    const kbHeading = el("h3", []);
    setText(kbHeading, TEXT.settings.keybinds);
    kbSection.appendChild(kbHeading);
    this._bindingTable = el("div", ["binding-table"]);
    kbSection.appendChild(this._bindingTable);
    kbSection.appendChild(this._buildResetButton("keyboard", () => {
      this._cancelListen();
      this._input.resetKeyboardBindings();
      this._renderKeyboard();
    }));
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
    gpBtnSection.appendChild(this._buildResetButton("gamepad-buttons", () => {
      this._cancelListen();
      this._input.resetGamepadBindings();
      this._renderGamepad();
    }));
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
    gpAxSection.appendChild(this._buildResetButton("gamepad-axes", () => {
      this._cancelListen();
      this._input.resetGamepadBindings();
      this._renderGamepad();
    }));
    this._overlay.appendChild(gpAxSection);

    // Close
    const closeBtn = el("button", [], { id: "settings-close" });
    setText(closeBtn, TEXT.settings.close);
    closeBtn.addEventListener("click", () => this.hide());
    this._overlay.appendChild(closeBtn);

    container.appendChild(this._overlay);

    // ─── Listen-mode keydown handler ────────────────────────────────────
    this._keyListener = (e: KeyboardEvent) => {
      if (this._listening === null) return;
      // Escape always cancels any listen mode (do NOT rebind to Escape).
      if (e.code === "Escape") {
        e.preventDefault();
        this._cancelListen();
        return;
      }
      if (this._listening.kind !== "key") {
        // Wrong listen kind for keyboard; ignore.
        return;
      }
      e.preventDefault();
      const { oldKey, action } = this._listening;
      this._listening = null;
      this._listeningRow = null;
      if (oldKey !== e.code) {
        this._input.setKeyBinding(oldKey, undefined);
      }
      this._input.setKeyBinding(e.code, action);
      this._renderKeyboard();
    };
    document.addEventListener("keydown", this._keyListener);
  }

  /** Show the overlay and render the current state. */
  show(): void {
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
  }

  /** Remove all event listeners and detach the overlay. */
  destroy(): void {
    this.hide();
    document.removeEventListener("keydown", this._keyListener);
    this._overlay.parentElement?.removeChild(this._overlay);
  }

  /**
   * Single tick of gamepad capture polling. Public so tests can drive it
   * deterministically without running a real animation frame loop.
   */
  tickGamepadCapture(): void {
    if (this._listening === null) return;
    if (this._listening.kind === "gamepadButton") {
      const result = pollFirstPressedButton();
      if (result === null) return;
      const { oldIndex, action } = this._listening;
      this._listening = null;
      this._listeningRow = null;
      if (oldIndex !== result.index) {
        this._input.setGamepadButtonBinding(oldIndex, undefined);
      }
      this._input.setGamepadButtonBinding(result.index, action);
      this._renderGamepad();
    } else if (this._listening.kind === "gamepadAxis") {
      const result = pollFirstActiveAxis(0.5);
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
      if (oldIndex !== result.index) {
        this._input.setGamepadAxisBinding(oldIndex, undefined);
      }
      this._input.setGamepadAxisBinding(result.index, newMapping);
      this._renderGamepad();
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private _scheduleGamepadPoll(): void {
    if (typeof requestAnimationFrame !== "function") return;
    const tick = (): void => {
      this.tickGamepadCapture();
      if (!this._overlay.classList.contains("hidden")) {
        this._rafHandle = requestAnimationFrame(tick);
      }
    };
    this._rafHandle = requestAnimationFrame(tick);
  }

  private _cancelListen(): void {
    if (this._listening === null) return;
    this._listening = null;
    this._listeningRow = null;
    this._renderKeyboard();
    this._renderGamepad();
  }

  private _renderAll(): void {
    this._renderAudio();
    this._renderKeyboard();
    this._renderGamepad();
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
    this._renderAudio();
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

  private _renderKeyboard(): void {
    this._bindingTable.textContent = "";
    const kb = this._input.bindings.keyboard;
    for (const [code, action] of Object.entries(kb)) {
      if (action === undefined) continue;
      const row = el("div", ["binding-row"], { "data-key": code });
      setText(row, `${code} → ${action}`);
      row.addEventListener("click", () => {
        this._cancelListen();
        this._listening = { kind: "key", oldKey: code, action: action as Action };
        this._listeningRow = row;
        setText(row, `${code} → ${action} ${TEXT.settings.listening}`);
      });
      this._bindingTable.appendChild(row);
    }
  }

  // ─── Gamepad ────────────────────────────────────────────────────────────

  private _renderGamepad(): void {
    // Buttons
    this._gpButtonTable.textContent = "";
    const gpBtns = this._input.bindings.gamepadButtons;
    for (const [idxStr, action] of Object.entries(gpBtns)) {
      if (action === undefined) continue;
      const idx = Number(idxStr);
      const row = el("div", ["gamepad-button-row"], { "data-index": idxStr });
      setText(row, `Button ${idxStr} → ${action}`);
      row.addEventListener("click", () => {
        this._cancelListen();
        this._listening = { kind: "gamepadButton", oldIndex: idx, action };
        this._listeningRow = row;
        setText(row, `Button ${idxStr} → ${action} ${TEXT.settings.listening}`);
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
      setText(row, `Axis ${idxStr}: + ${mapping.positive} / − ${mapping.negative}`);
      row.addEventListener("click", () => {
        this._cancelListen();
        this._listening = { kind: "gamepadAxis", oldIndex: idx };
        this._listeningRow = row;
        setText(row, `Axis ${idxStr} ${TEXT.settings.listening}`);
      });
      this._gpAxisTable.appendChild(row);
    }
  }

  private _buildResetButton(section: string, onClick: () => void): HTMLElement {
    const btn = el("button", ["reset-section"], { "data-reset": section });
    setText(btn, TEXT.settings.resetSection);
    btn.addEventListener("click", onClick);
    return btn;
  }
}

