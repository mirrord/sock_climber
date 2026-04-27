import { describe, it, expect } from "vitest";
import {
  createDefaultBindings,
  DEFAULT_KEYBOARD_BINDINGS,
} from "../../src/input/Bindings.js";

describe("Bindings", () => {
  it("createDefaultBindings() returns an object with keyboard entries", () => {
    const b = createDefaultBindings();
    expect(b.keyboard["KeyA"]).toBe("MoveLeft");
    expect(b.keyboard["KeyD"]).toBe("MoveRight");
    expect(b.keyboard["Space"]).toBe("Jump");
    expect(b.keyboard["Escape"]).toBe("Pause");
  });

  it("createDefaultBindings() returns independent copies (mutation-safe)", () => {
    const b1 = createDefaultBindings();
    const b2 = createDefaultBindings();
    b1.keyboard["KeyA"] = "Jump";
    expect(b2.keyboard["KeyA"]).toBe("MoveLeft");
  });

  it("default gamepad buttons include Jump on button 0", () => {
    const b = createDefaultBindings();
    expect(b.gamepadButtons[0]).toBe("Jump");
  });
});
