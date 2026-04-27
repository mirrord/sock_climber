import { describe, it, expect } from "vitest";
import { createBody, integrateBody } from "../../src/physics/Body.js";

describe("Body", () => {
  it("createBody() initialises with sensible defaults", () => {
    const b = createBody({ position: { x: 0, y: 0 } });
    expect(b.velocity).toEqual({ x: 0, y: 0 });
    expect(b.gravity).toBeGreaterThan(0);
    expect(b.flags.onGround).toBe(false);
  });

  it("integrateBody() applies gravity correctly over one step", () => {
    const b = createBody({ position: { x: 0, y: 0 }, gravity: 10, drag: 0 });
    const dt = 1 / 120;
    integrateBody(b, dt);
    expect(b.velocity.y).toBeCloseTo(10 * dt, 10);
  });

  it("integrateBody() applies drag, reducing velocity", () => {
    const b = createBody({
      position: { x: 0, y: 0 },
      gravity: 0,
      drag: 0.5,
      velocity: { x: 10, y: 0 },
    });
    const dt = 1;
    integrateBody(b, dt);
    expect(b.velocity.x).toBeCloseTo(10 * (1 - 0.5), 5);
  });

  it("free fall matches 0.5 * g * t^2 within tolerance", () => {
    const g = 30;
    const dt = 1 / 120;
    const steps = 120; // 1 second
    const b = createBody({ position: { x: 0, y: 0 }, gravity: g, drag: 0 });

    for (let i = 0; i < steps; i++) {
      integrateBody(b, dt);
      b.position.y += b.velocity.y * dt;
    }

    const expected = 0.5 * g * 1; // 0.5 * g * t^2, t = 1s
    // Due to Euler integration there's a small accumulated error; 5% tolerance.
    expect(b.position.y).toBeCloseTo(expected, 0);
  });
});
