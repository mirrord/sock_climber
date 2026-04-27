import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Input } from "../../src/input/Input.js";
import { createDefaultBindings } from "../../src/input/Bindings.js";
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

  it("show() renders a row for every default keyboard binding", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const rows = container.querySelectorAll(".binding-row");
    const defaultCount = Object.keys(createDefaultBindings().keyboard).length;
    expect(rows.length).toBe(defaultCount);
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

  it("renders one row per default gamepad button binding", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    const defaults = createDefaultBindings();
    const expected = Object.keys(defaults.gamepadButtons).length;
    expect(container.querySelectorAll(".gamepad-button-row").length).toBe(expected);
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

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  it("destroy() removes the overlay and the document keydown listener", () => {
    const settings = new Settings(input, bus, audio, container);
    settings.show();
    settings.destroy();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyZ", bubbles: true }));
    expect(container.querySelector("#settings")).toBeNull();
  });
});
