import { describe, it, expect, afterEach, vi } from "vitest";
import { pollFirstActiveAxis, pollFirstPressedButton } from "../../src/input/Gamepad.js";

function fakePad(buttons: boolean[], axes: number[]): Gamepad {
  return {
    id: "fake",
    index: 0,
    connected: true,
    timestamp: 0,
    mapping: "standard",
    axes,
    buttons: buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function withGamepads(pads: (Gamepad | null)[]): void {
  Object.defineProperty(navigator, "getGamepads", {
    value: () => pads,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Restore a no-op stub so subsequent tests don't fail.
  Object.defineProperty(navigator, "getGamepads", {
    value: () => [],
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

describe("pollFirstPressedButton", () => {
  it("returns null when no gamepad is connected", () => {
    withGamepads([null, null]);
    expect(pollFirstPressedButton()).toBeNull();
  });

  it("returns null when no button is pressed", () => {
    withGamepads([fakePad([false, false, false], [0, 0])]);
    expect(pollFirstPressedButton()).toBeNull();
  });

  it("returns the index of the first pressed button", () => {
    withGamepads([fakePad([false, false, true, true], [0, 0])]);
    expect(pollFirstPressedButton()).toEqual({ index: 2 });
  });
});

describe("pollFirstActiveAxis", () => {
  it("returns null when all axes are within threshold", () => {
    withGamepads([fakePad([], [0.1, -0.2, 0])]);
    expect(pollFirstActiveAxis(0.5)).toBeNull();
  });

  it("returns positive sign for axis above threshold", () => {
    withGamepads([fakePad([], [0.1, 0.9])]);
    expect(pollFirstActiveAxis(0.5)).toEqual({ index: 1, sign: 1 });
  });

  it("returns negative sign for axis below -threshold", () => {
    withGamepads([fakePad([], [-0.8, 0])]);
    expect(pollFirstActiveAxis(0.5)).toEqual({ index: 0, sign: -1 });
  });

  it("returns null when getGamepads throws", () => {
    Object.defineProperty(navigator, "getGamepads", {
      value: () => { throw new Error("nope"); },
      configurable: true,
      writable: true,
    });
    expect(pollFirstActiveAxis()).toBeNull();
    expect(pollFirstPressedButton()).toBeNull();
  });
});
