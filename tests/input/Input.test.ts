import { describe, it, expect } from "vitest";
import { Input } from "../../src/input/Input.js";
import { createDefaultBindings } from "../../src/input/Bindings.js";

describe("Input", () => {
  function makeInput() {
    return new Input(createDefaultBindings());
  }

  it("no keys pressed → empty snapshot", () => {
    const input = makeInput();
    const snap = input.poll(0);
    expect(snap.buttonsDown.size).toBe(0);
    expect(snap.buttonsPressed.size).toBe(0);
    expect(snap.buttonsReleased.size).toBe(0);
    expect(snap.axes.moveX).toBe(0);
  });

  it("pressed key appears in buttonsDown and buttonsPressed on first frame", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyA"); // MoveLeft
    const snap = input.poll(1);
    expect(snap.buttonsDown.has("MoveLeft")).toBe(true);
    expect(snap.buttonsPressed.has("MoveLeft")).toBe(true);
    expect(snap.buttonsReleased.has("MoveLeft")).toBe(false);
  });

  it("held key is in buttonsDown but NOT buttonsPressed on subsequent frames", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyA");
    input.poll(0); // First frame — records pressed edge.
    const snap = input.poll(1); // Second frame — held.
    expect(snap.buttonsDown.has("MoveLeft")).toBe(true);
    expect(snap.buttonsPressed.has("MoveLeft")).toBe(false);
  });

  it("released key appears in buttonsReleased exactly once", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyA");
    input.poll(0);
    input._simulateKeyUp("KeyA");
    const snap = input.poll(1);
    expect(snap.buttonsReleased.has("MoveLeft")).toBe(true);
    expect(snap.buttonsDown.has("MoveLeft")).toBe(false);
    // Next frame — no longer released.
    const snap2 = input.poll(2);
    expect(snap2.buttonsReleased.has("MoveLeft")).toBe(false);
  });

  it("opposite axes (MoveLeft + MoveRight) cancel to moveX = 0", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyA"); // MoveLeft
    input._simulateKeyDown("KeyD"); // MoveRight
    const snap = input.poll(0);
    expect(snap.axes.moveX).toBe(0);
  });

  it("only MoveRight pressed → moveX = 1", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyD");
    const snap = input.poll(0);
    expect(snap.axes.moveX).toBe(1);
  });

  it("only MoveLeft pressed → moveX = -1", () => {
    const input = makeInput();
    input._simulateKeyDown("KeyA");
    const snap = input.poll(0);
    expect(snap.axes.moveX).toBe(-1);
  });

  it("setBindings() remaps action edges on next poll", () => {
    const input = makeInput();
    const newBindings = createDefaultBindings();
    // Remap KeyA to Jump instead of MoveLeft.
    newBindings.keyboard["KeyA"] = "Jump";
    input.setBindings(newBindings);
    input._simulateKeyDown("KeyA");
    const snap = input.poll(0);
    expect(snap.buttonsDown.has("Jump")).toBe(true);
    expect(snap.buttonsDown.has("MoveLeft")).toBe(false);
  });

  it("timestamp reflects the value passed to poll()", () => {
    const input = makeInput();
    const snap = input.poll(12345);
    expect(snap.timestamp).toBe(12345);
  });

  it("setKeyBinding(undefined) removes a binding", () => {
    const input = makeInput();
    input.setKeyBinding("KeyA", undefined);
    input._simulateKeyDown("KeyA");
    const snap = input.poll(0);
    expect(snap.buttonsDown.has("MoveLeft")).toBe(false);
  });

  it("setGamepadButtonBinding writes to bindings and persists", () => {
    const input = makeInput();
    localStorage.clear();
    input.setGamepadButtonBinding(7, "Jump");
    expect(input.bindings.gamepadButtons[7]).toBe("Jump");
    const stored = JSON.parse(localStorage.getItem("sock_climber_bindings") ?? "{}");
    expect(stored.gamepadButtons["7"]).toBe("Jump");
  });

  it("setGamepadButtonBinding(undefined) clears the binding", () => {
    const input = makeInput();
    input.setGamepadButtonBinding(0, undefined);
    expect(input.bindings.gamepadButtons[0]).toBeUndefined();
  });

  it("setGamepadAxisBinding writes a positive/negative pair and persists", () => {
    const input = makeInput();
    localStorage.clear();
    input.setGamepadAxisBinding(5, { positive: "MoveRight", negative: "MoveLeft" });
    expect(input.bindings.gamepadAxes[5]).toEqual({ positive: "MoveRight", negative: "MoveLeft" });
    const stored = JSON.parse(localStorage.getItem("sock_climber_bindings") ?? "{}");
    expect(stored.gamepadAxes["5"]).toEqual({ positive: "MoveRight", negative: "MoveLeft" });
  });

  it("resetKeyboardBindings restores the default keyboard map", () => {
    const input = makeInput();
    input.setKeyBinding("KeyA", undefined);
    input.setKeyBinding("KeyZ", "MoveLeft");
    input.resetKeyboardBindings();
    expect(input.bindings.keyboard["KeyA"]).toBe("MoveLeft");
    expect(input.bindings.keyboard["KeyZ"]).toBeUndefined();
  });

  it("resetGamepadBindings restores default gamepad buttons + axes", () => {
    const input = makeInput();
    input.setGamepadButtonBinding(0, undefined);
    input.setGamepadAxisBinding(0, undefined);
    input.resetGamepadBindings();
    expect(input.bindings.gamepadButtons[0]).toBe("Jump");
    expect(input.bindings.gamepadAxes[0]).toEqual({ positive: "MoveRight", negative: "MoveLeft" });
  });
});
