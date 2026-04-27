import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Input } from "../../src/input/Input.js";
import { createDefaultBindings } from "../../src/input/Bindings.js";
import { ACTIONS } from "../../src/input/Actions.js";
import { AudioBus } from "../../src/audio/AudioBus.js";
import {
  AudioSettings,
  createDefaultAudioSettings,
} from "../../src/audio/AudioSettings.js";
import { Settings } from "../../src/ui/Settings.js";

const BINDINGS_KEY = "sock_climber_bindings";
const AUDIO_KEY = "sock_climber_audio";

// ─── Mock Web Audio API ──────────────────────────────────────────────────────
class MockGainNode {
  gain = { value: 1 };
  connect(): void {}
  disconnect(): void {}
}
class MockAudioContext {
  destination = new MockGainNode();
  createGain(): MockGainNode { return new MockGainNode(); }
  createBufferSource(): unknown {
    return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
  }
}

function makeBus(): AudioBus {
  return new AudioBus({
    context: new MockAudioContext() as unknown as AudioContext,
    sfxPoolSize: 1,
  });
}

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

function setGamepads(pads: (Gamepad | null)[]): void {
  Object.defineProperty(navigator, "getGamepads", {
    value: () => pads,
    configurable: true,
    writable: true,
  });
}

function fakePad(buttons: boolean[] = [], axes: number[] = []): Gamepad {
  return {
    id: "fake", index: 0, connected: true, timestamp: 0, mapping: "standard",
    axes,
    buttons: buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })),
  } as unknown as Gamepad;
}

describe("Settings", () => {
  let input: Input;
  let bus: AudioBus;
  let audio: AudioSettings;
  let container: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    setGamepads([]);
    input = new Input(createDefaultBindings());
    bus = makeBus();
    audio = createDefaultAudioSettings();
    container = makeContainer();
  });

  afterEach(() => {
    setGamepads([]);
  });

  // ─── Visibility ─────────────────────────────────────────────────────────

  it("overlay starts hidden", () => {
    new Settings(input, bus, audio, container);
    expect(container.querySelector("#settings")?.classList.contains("hidden")).toBe(true);
  });

  it("show() removes hidden class; hide() restores it", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    expect(container.querySelector("#settings")?.classList.contains("hidden")).toBe(false);
    settings.hide();
    expect(container.querySelector("#settings")?.classList.contains("hidden")).toBe(true);
    settings.destroy();
  });

  // ─── Keyboard ───────────────────────────────────────────────────────────

  it("show() renders one keyboard row per game action", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const rows = container.querySelectorAll(".binding-row");
    // One row per Action (not per bound key) — actions are the new source of truth.
    expect(rows.length).toBe(ACTIONS.length);
    settings.destroy();
  });

  it("clicking a row and pressing a key rebinds that action", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".binding-row[data-key='KeyA']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(input.bindings.keyboard["KeyZ"]).toBe("MoveLeft");
    settings.destroy();
  });

  it("rebinding persists to localStorage", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".binding-row[data-key='KeyA']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    const stored = JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? "{}");
    expect(stored.keyboard["KeyZ"]).toBe("MoveLeft");
    settings.destroy();
  });

  it("re-showing after a rebind reflects the updated binding", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".binding-row[data-key='KeyA']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    settings.hide();
    settings.show();
    expect(container.querySelector(".binding-row[data-key='KeyZ']")).not.toBeNull();
    settings.destroy();
  });

  it("Escape during keyboard listen mode cancels without rebinding", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".binding-row[data-key='KeyA']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    expect(input.bindings.keyboard["KeyA"]).toBe("MoveLeft");
    expect(input.bindings.keyboard["Escape"]).toBe("Pause");
    settings.destroy();
  });

  it("keyboard reset button restores defaults", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    input.setKeyBinding("KeyA", undefined);
    container
      .querySelector<HTMLElement>(".reset-section[data-reset='keyboard']")
      ?.click();
    expect(input.bindings.keyboard["KeyA"]).toBe("MoveLeft");
    settings.destroy();
  });

  // ─── Audio ──────────────────────────────────────────────────────────────

  it("renders three audio rows (master, music, sfx)", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    expect(container.querySelector(".audio-row[data-channel='master']")).not.toBeNull();
    expect(container.querySelector(".audio-row[data-channel='music']")).not.toBeNull();
    expect(container.querySelector(".audio-row[data-channel='sfx']")).not.toBeNull();
    settings.destroy();
  });

  it("changing the master slider updates AudioBus and persists", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const slider = container.querySelector<HTMLInputElement>(
      ".audio-row[data-channel='master'] .audio-slider",
    )!;
    slider.value = "40";
    slider.dispatchEvent(new Event("input"));
    expect(bus.getVolume("master")).toBeCloseTo(0.4);
    expect(audio.master).toBeCloseTo(0.4);
    const stored = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "{}");
    expect(stored.master).toBeCloseTo(0.4);
    settings.destroy();
  });

  it("toggling the mute checkbox mutes the channel and persists", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const mute = container.querySelector<HTMLInputElement>(
      ".audio-row[data-channel='music'] .audio-mute",
    )!;
    mute.checked = true;
    mute.dispatchEvent(new Event("change"));
    expect(bus.isMuted("music")).toBe(true);
    expect(audio.mutedMusic).toBe(true);
    const stored = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "{}");
    expect(stored.mutedMusic).toBe(true);
    settings.destroy();
  });

  it("audio reset button restores default volumes", () => {
    audio.master = 0.1;
    audio.mutedMusic = true;
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container
      .querySelector<HTMLElement>(".reset-section[data-reset='audio']")
      ?.click();
    expect(audio.master).toBe(1);
    expect(audio.mutedMusic).toBe(false);
    expect(bus.getVolume("master")).toBe(1);
    settings.destroy();
  });

  // ─── Gamepad ────────────────────────────────────────────────────────────

  it("renders one gamepad button row per game action", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    expect(container.querySelectorAll(".gamepad-button-row").length).toBe(ACTIONS.length);
    settings.destroy();
  });

  it("renders one row per default gamepad axis binding", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const defaults = createDefaultBindings();
    const expected = Object.keys(defaults.gamepadAxes).length;
    expect(container.querySelectorAll(".gamepad-axis-row").length).toBe(expected);
    settings.destroy();
  });

  it("clicking a gamepad button row and pressing a button rebinds it", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".gamepad-button-row[data-index='0']")?.click();
    setGamepads([fakePad([false, false, false, false, false, false, false, true])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadButtons[7]).toBe("Jump");
    expect(input.bindings.gamepadButtons[0]).toBeUndefined();
    const stored = JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? "{}");
    expect(stored.gamepadButtons["7"]).toBe("Jump");
    settings.destroy();
  });

  it("clicking a gamepad axis row and moving an axis rebinds it", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".gamepad-axis-row[data-index='0']")?.click();
    setGamepads([fakePad([], [0, 0, 0, 0, 0.9])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadAxes[4]).toEqual({
      positive: "MoveRight",
      negative: "MoveLeft",
    });
    expect(input.bindings.gamepadAxes[0]).toBeUndefined();
    settings.destroy();
  });

  it("axis rebind with negative deflection swaps positive/negative actions", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".gamepad-axis-row[data-index='0']")?.click();
    setGamepads([fakePad([], [0, 0, 0, 0, -0.9])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadAxes[4]).toEqual({
      positive: "MoveLeft",
      negative: "MoveRight",
    });
    settings.destroy();
  });

  it("Escape cancels gamepad listen mode", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".gamepad-button-row[data-index='0']")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    setGamepads([fakePad([false, false, false, false, false, false, false, true])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadButtons[0]).toBe("Jump");
    expect(input.bindings.gamepadButtons[7]).toBeUndefined();
    settings.destroy();
  });

  // ─── Gamepad navigation ────────────────────────────────────────────────

  it("focuses the first control on show", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const focused = settings.focusedElement;
    expect(focused).not.toBeNull();
    expect(focused?.classList.contains("audio-slider")).toBe(true);
    expect(focused?.classList.contains("gp-focused")).toBe(true);
    settings.destroy();
  });

  it("D-pad down (button 13) advances focus to the next control", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const first = settings.focusedElement;
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    const second = settings.focusedElement;
    expect(second).not.toBe(first);
    expect(first?.classList.contains("gp-focused")).toBe(false);
    expect(second?.classList.contains("gp-focused")).toBe(true);
    settings.destroy();
  });

  it("D-pad up (button 12) wraps from the first item to the last", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    const focused = settings.focusedElement;
    expect(focused?.id).toBe("settings-close");
    settings.destroy();
  });

  it("D-pad right (button 15) increases the focused slider value", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const slider = container.querySelector<HTMLInputElement>(
      ".audio-row[data-channel='master'] .audio-slider",
    )!;
    expect(slider.value).toBe("100");
    // Focus is on master slider; lower it first so we have headroom.
    slider.value = "50";
    audio.master = 0.5;
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    expect(Number(slider.value)).toBe(55);
    expect(audio.master).toBeCloseTo(0.55);
    settings.destroy();
  });

  it("D-pad left (button 14) decreases the focused slider value", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const slider = container.querySelector<HTMLInputElement>(
      ".audio-row[data-channel='master'] .audio-slider",
    )!;
    slider.value = "50";
    audio.master = 0.5;
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    expect(Number(slider.value)).toBe(45);
    expect(audio.master).toBeCloseTo(0.45);
    settings.destroy();
  });

  it("A button (0) confirms — toggles the focused mute checkbox", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // Move focus to master mute (focusable index 1).
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    const mute = container.querySelector<HTMLInputElement>(
      ".audio-row[data-channel='master'] .audio-mute",
    )!;
    expect(settings.focusedElement).toBe(mute);
    expect(mute.checked).toBe(false);
    // Release D-pad down, press A.
    setGamepads([fakePad([true])]);
    settings.tickGamepadNav();
    expect(mute.checked).toBe(true);
    expect(bus.isMuted("master")).toBe(true);
    settings.destroy();
  });

  it("A button (0) confirms a binding row → enters listen mode", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // Navigate down through audio (6 items) + audio reset (1) → first kb row.
    const downPad = fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, true]);
    for (let i = 0; i < 7; i++) {
      setGamepads([downPad]);
      settings.tickGamepadNav();
      // Release between presses for edge detection.
      setGamepads([fakePad([])]);
      settings.tickGamepadNav();
    }
    expect(settings.focusedElement?.classList.contains("binding-row")).toBe(true);
    const focusedRow = settings.focusedElement as HTMLElement;
    const code = focusedRow.dataset.key!;
    // Confirm with A (0).
    setGamepads([fakePad([true])]);
    settings.tickGamepadNav();
    // _renderAll() rebuilt rows; query the new one for the same data-key.
    const updatedRow = container.querySelector<HTMLElement>(
      `.binding-row[data-key='${code}']`,
    )!;
    expect(updatedRow.textContent?.includes("press input")).toBe(true);
    // Press a key to rebind.
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP", bubbles: true }));
    expect(input.bindings.keyboard["KeyP"]).toBeDefined();
    expect(input.bindings.keyboard[code]).toBeUndefined();
    settings.destroy();
  });

  it("B button (1) closes the overlay", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    expect(container.querySelector("#settings")?.classList.contains("hidden")).toBe(false);
    setGamepads([fakePad([false, true])]);
    settings.tickGamepadNav();
    expect(container.querySelector("#settings")?.classList.contains("hidden")).toBe(true);
    settings.destroy();
  });

  it("navigation is suspended while in listen mode", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container.querySelector<HTMLElement>(".binding-row[data-key='KeyA']")?.click();
    const focusedBefore = settings.focusedElement;
    setGamepads([fakePad([false, false, false, false, false, false, false, false, false, false, false, false, false, true])]);
    settings.tickGamepadNav();
    expect(settings.focusedElement).toBe(focusedBefore);
    settings.destroy();
  });

  it("button held during listen-start is ignored until released", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // Simulate user already holding A (button 0) and gamepad button row clicked.
    setGamepads([fakePad([true])]);
    container.querySelector<HTMLElement>(".gamepad-button-row[data-action='Jump']")?.click();
    // Tick capture: A is still held but should be ignored (seeded).
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadButtons[0]).toBe("Jump"); // unchanged
    // Release A, press button 7 (which is unbound by default — no swap).
    setGamepads([fakePad([false, false, false, false, false, false, false, true])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadButtons[7]).toBe("Jump");
    expect(input.bindings.gamepadButtons[0]).toBeUndefined();
    settings.destroy();
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  it("destroy() removes the overlay and the document keydown listener", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    settings.destroy();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(container.querySelector("#settings")).toBeNull();
  });

  // ─── New behaviors: swap-on-conflict, set-to-current, PS labels ─────────

  it("rebinding to a key bound to another action swaps the two mappings", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // MoveLeft is on KeyA; MoveRight is on KeyD. Remap MoveLeft to KeyD.
    container
      .querySelector<HTMLElement>(".binding-row[data-action='MoveLeft']")
      ?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", bubbles: true }));
    expect(input.bindings.keyboard["KeyD"]).toBe("MoveLeft");
    // The displaced action (MoveRight) should now live on the freed key (KeyA).
    expect(input.bindings.keyboard["KeyA"]).toBe("MoveRight");
    settings.destroy();
  });

  it("rebinding an action to its current key is a no-op", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    container
      .querySelector<HTMLElement>(".binding-row[data-action='MoveLeft']")
      ?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", bubbles: true }));
    expect(input.bindings.keyboard["KeyA"]).toBe("MoveLeft");
    settings.destroy();
  });

  it("rebinding a gamepad button to one bound to another action swaps them", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // Jump is on button 0; Crouch is on button 1. Remap Jump to button 1.
    container
      .querySelector<HTMLElement>(".gamepad-button-row[data-action='Jump']")
      ?.click();
    setGamepads([fakePad([false, true])]);
    settings.tickGamepadCapture();
    expect(input.bindings.gamepadButtons[1]).toBe("Jump");
    expect(input.bindings.gamepadButtons[0]).toBe("Crouch");
    settings.destroy();
  });

  it("gamepad button rows show PlayStation-style labels", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const jumpRow = container.querySelector<HTMLElement>(
      ".gamepad-button-row[data-action='Jump']",
    )!;
    // Default: Jump is on index 0 (Cross).
    expect(jumpRow.querySelector(".binding-key")?.textContent).toContain("Cross");
    const dashRow = container.querySelector<HTMLElement>(
      ".gamepad-button-row[data-action='Dash']",
    )!;
    // Default: Dash is on index 5 (R1).
    expect(dashRow.querySelector(".binding-key")?.textContent).toBe("R1");
    settings.destroy();
  });

  it("unbound action rows display the unbound placeholder", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    // MoveLeft has no default gamepad button binding.
    const row = container.querySelector<HTMLElement>(
      ".gamepad-button-row[data-action='MoveLeft']",
    )!;
    expect(row.querySelector(".binding-key")?.textContent).toBe("—");
    settings.destroy();
  });

  it("keys pressed during a keyboard rebind do not propagate to other listeners", () => {    const settings = new Settings(input, bus, audio, container);
    settings.show();
    let externalSawIt = false;
    const external = (): void => { externalSawIt = true; };
    // External bubble-phase listener on window — should NOT fire while rebinding.
    window.addEventListener("keydown", external);
    container
      .querySelector<HTMLElement>(".binding-row[data-action='MoveLeft']")
      ?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    window.removeEventListener("keydown", external);
    expect(externalSawIt).toBe(false);
    expect(input.bindings.keyboard["KeyZ"]).toBe("MoveLeft");
    settings.destroy();
  });

  it("button press that completes a gamepad rebind does not also trigger nav (e.g. Circle does not close menu)", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const wasHidden = (): boolean =>
      container.querySelector("#settings")?.classList.contains("hidden") ?? false;
    expect(wasHidden()).toBe(false);
    // Begin rebind for Jump (action), then press Circle (button 1 = nav "back").
    container
      .querySelector<HTMLElement>(".gamepad-button-row[data-action='Jump']")
      ?.click();
    setGamepads([fakePad([false, true])]);
    // Same-frame ordering as the rAF tick: capture runs first, then nav.
    settings.tickGamepadCapture();
    settings.tickGamepadNav();
    // Rebind succeeded.
    expect(input.bindings.gamepadButtons[1]).toBe("Jump");
    // Menu must still be open (nav must not have treated the press as Back).
    expect(wasHidden()).toBe(false);
    settings.destroy();
  });
});