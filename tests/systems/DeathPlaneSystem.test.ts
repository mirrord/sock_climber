import { describe, it, expect, beforeEach } from "vitest";
import { DeathPlaneSystem } from "../../src/systems/DeathPlaneSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import type { Body } from "../../src/physics/Body.js";
import { createBody } from "../../src/physics/Body.js";

const DT = 1 / 60;

function makeBody(y: number, halfH = 0.5): Body {
  return createBody({ position: { x: 0, y }, halfExtents: { x: 0.4, y: halfH } });
}

// ─── Speed monotonicity ────────────────────────────────────────────────────

describe("DeathPlaneSystem — speed monotonicity", () => {
  it("speed starts at baseSpeed", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 2 });
    expect(sys.speed).toBe(2);
  });

  it("speed never decreases after onSegmentCross events", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus);
    const before = sys.speed;
    bus.emit("onSegmentCross", { segmentId: 0 });
    expect(sys.speed).toBeGreaterThanOrEqual(before);
    bus.emit("onSegmentCross", { segmentId: 1 });
    expect(sys.speed).toBeGreaterThanOrEqual(before);
  });

  it("speed never decreases after onPatchApplied events", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus);
    const before = sys.speed;
    bus.emit("onPatchApplied", { patchId: "Speed" });
    expect(sys.speed).toBeGreaterThanOrEqual(before);
  });
});

// ─── segCrossBump ─────────────────────────────────────────────────────────

describe("DeathPlaneSystem — onSegmentCross bump", () => {
  it("adds exactly segCrossBump per event", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 1, segCrossBump: 0.1 });
    const before = sys.speed;
    bus.emit("onSegmentCross", { segmentId: 0 });
    expect(sys.speed).toBeCloseTo(before + 0.1);
  });

  it("two segment crosses add the bump twice", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 1, segCrossBump: 0.1 });
    const before = sys.speed;
    bus.emit("onSegmentCross", { segmentId: 0 });
    bus.emit("onSegmentCross", { segmentId: 1 });
    expect(sys.speed).toBeCloseTo(before + 0.2);
  });
});

// ─── patchBump ────────────────────────────────────────────────────────────

describe("DeathPlaneSystem — onPatchApplied bump", () => {
  it("adds exactly patchBump per event", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 1, patchBump: 0.2 });
    const before = sys.speed;
    bus.emit("onPatchApplied", { patchId: "Speed" });
    expect(sys.speed).toBeCloseTo(before + 0.2);
  });

  it("two patch events add the bump twice", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 1, patchBump: 0.2 });
    const before = sys.speed;
    bus.emit("onPatchApplied", { patchId: "Speed" });
    bus.emit("onPatchApplied", { patchId: "Damage" });
    expect(sys.speed).toBeCloseTo(before + 0.4);
  });
});

// ─── planeY movement ─────────────────────────────────────────────────────

describe("DeathPlaneSystem — plane movement", () => {
  it("planeY decreases over time (plane rises)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 1.5, startY: 20 });
    const body = makeBody(0);
    const before = sys.planeY;
    sys.update(DT, body);
    expect(sys.planeY).toBeLessThan(before);
  });

  it("plane advances by speed * dt each step (no multiplier)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 2, startY: 20 });
    const body = makeBody(0);
    sys.update(DT, body);
    expect(sys.planeY).toBeCloseTo(20 - 2 * DT);
  });

  it("deathPlaneSpeedMultiplier scales movement", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 2, startY: 20 });
    const body = makeBody(0);
    sys.update(DT, body, 0.5);
    expect(sys.planeY).toBeCloseTo(20 - 2 * 0.5 * DT);
  });

  it("deathPlaneSpeedMultiplier is floored at 0.1", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 2, startY: 20 });
    const body = makeBody(0);
    // Passing -1 should be treated as floor 0.1.
    sys.update(DT, body, -1);
    expect(sys.planeY).toBeCloseTo(20 - 2 * 0.1 * DT);
  });
});

// ─── Death contact ────────────────────────────────────────────────────────

describe("DeathPlaneSystem — player death on contact", () => {
  it("emits onPlayerDeath when player bottom >= planeY", () => {
    const bus = createEventBus<GameEvents>();
    const deaths: string[] = [];
    bus.on("onPlayerDeath", ({ reason }) => deaths.push(reason));

    // Start plane exactly at body bottom + tiny margin below.
    // body center at y=9, halfH=0.5, bottom=9.5; plane at 10 (below).
    const sys = new DeathPlaneSystem(bus, { baseSpeed: 0, startY: 10 });
    const body = makeBody(9.5); // bottom = 9.5 + 0.5 = 10 = planeY
    sys.update(DT, body);
    expect(deaths).toEqual(["drowned"]);
  });

  it("death reason is 'drowned'", () => {
    const bus = createEventBus<GameEvents>();
    const deaths: Array<{ reason: string }> = [];
    bus.on("onPlayerDeath", (p) => deaths.push(p));

    const sys = new DeathPlaneSystem(bus, { baseSpeed: 0, startY: 10 });
    const body = makeBody(9.5);
    sys.update(DT, body);
    expect(deaths[0]!.reason).toBe("drowned");
  });

  it("death is emitted at most once even across multiple updates", () => {
    const bus = createEventBus<GameEvents>();
    let deathCount = 0;
    bus.on("onPlayerDeath", () => deathCount++);

    const sys = new DeathPlaneSystem(bus, { baseSpeed: 0, startY: 10 });
    const body = makeBody(9.5); // bottom at planeY
    sys.update(DT, body);
    sys.update(DT, body);
    sys.update(DT, body);
    expect(deathCount).toBe(1);
  });

  it("no death when player is above the plane", () => {
    const bus = createEventBus<GameEvents>();
    let deathCount = 0;
    bus.on("onPlayerDeath", () => deathCount++);

    const sys = new DeathPlaneSystem(bus, { baseSpeed: 0, startY: 100 });
    const body = makeBody(0); // far above
    sys.update(DT, body);
    expect(deathCount).toBe(0);
  });
});
