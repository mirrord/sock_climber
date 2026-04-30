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

// ─── Path-mode 2-D kill region ────────────────────────────────────────────

describe("DeathPlaneSystem — path-mode pathContext", () => {
  // Helper: a stationary plane at world (0, 0) with a north-pointing
  // tangent (i.e. chasing in the +x ↑ direction in path-y space).
  const stationaryNorthCtx = {
    planeWorld: { x: 0, y: 0 },
    tangent: { x: 1, y: 0 },
    corridorHalfWidth: 4,
  };

  function pathSys(): { sys: DeathPlaneSystem; getDeaths: () => number } {
    const bus = createEventBus<GameEvents>();
    let deaths = 0;
    bus.on("onPlayerDeath", () => deaths++);
    const sys = new DeathPlaneSystem(bus, {
      climbDir: { axis: "path", sign: 1 },
      baseSpeed: 0,
      start: 0,
    });
    return { sys, getDeaths: () => deaths };
  }

  it("kills a player inside the corridor and behind the plane", () => {
    const { sys, getDeaths } = pathSys();
    // Player behind the plane along tangent (forward = -2) and within
    // lateral half-width.
    const body = createBody({
      position: { x: -2, y: 1 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    sys.update(DT, body, 1, 0, stationaryNorthCtx);
    expect(getDeaths()).toBe(1);
  });

  it("does NOT kill a player outside the corridor walls", () => {
    const { sys, getDeaths } = pathSys();
    // Behind the plane along tangent but laterally far outside the
    // corridor (lateral = 100).
    const body = createBody({
      position: { x: -2, y: 100 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    sys.update(DT, body, 1, 0, stationaryNorthCtx);
    expect(getDeaths()).toBe(0);
  });

  it("does NOT kill a player ahead of the plane", () => {
    const { sys, getDeaths } = pathSys();
    // Ahead of the plane along tangent (forward = +5) and within
    // lateral half-width.
    const body = createBody({
      position: { x: 5, y: 0 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    sys.update(DT, body, 1, 0, stationaryNorthCtx);
    expect(getDeaths()).toBe(0);
  });

  it("kills a player grazing the wall on either side", () => {
    // Player centre at lateral = ±(corridorHalfWidth + playerHalf) —
    // i.e. AABB edge sits exactly at the wall. Should still kill.
    for (const sign of [-1, 1]) {
      const { sys, getDeaths } = pathSys();
      const body = createBody({
        position: { x: -2, y: sign * (4 + 0.5) },
        halfExtents: { x: 0.4, y: 0.5 },
      });
      sys.update(DT, body, 1, 0, stationaryNorthCtx);
      expect(getDeaths()).toBe(1);
    }
  });

  it("falls back to 1-D arc-length test when no pathContext is supplied", () => {
    const bus = createEventBus<GameEvents>();
    let deaths = 0;
    bus.on("onPlayerDeath", () => deaths++);
    const sys = new DeathPlaneSystem(bus, {
      climbDir: { axis: "path", sign: 1 },
      baseSpeed: 0,
      start: 5,
    });
    const body = createBody({
      position: { x: 0, y: 0 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    // playerPathS = 0, planePos = 5; sign=+1 dies when playerS <= planePos.
    sys.update(DT, body, 1, 0);
    expect(deaths).toBe(1);
  });
});

// ─── Rubber-band catch-up ─────────────────────────────────────────────────

describe("DeathPlaneSystem — rubber-band scaling", () => {
  it("does not scale speed when player is within threshold (level 1)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 50,
      rubberBandThreshold: 100,
    });
    // Player at y=0, plane at y=50 → distance = 50 < 100 → no scaling.
    const body = makeBody(0);
    sys.update(DT, body);
    expect(sys.rubberBandMultiplier).toBe(1);
    expect(sys.planeY).toBeCloseTo(50 - 2 * DT);
  });

  it("scales speed proportional to distance beyond threshold (level 1)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 200,
      rubberBandThreshold: 100,
    });
    // Player at y=0, plane at y=200 → distance = 200 → multiplier = 2×.
    const body = makeBody(0);
    sys.update(DT, body);
    expect(sys.rubberBandMultiplier).toBeCloseTo(2);
    expect(sys.planeY).toBeCloseTo(200 - 2 * 2 * DT);
  });

  it("scales speed proportional to distance for horizontal axis (level 2)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      climbDir: { axis: "x", sign: 1 },
      baseSpeed: 2,
      start: -300,
      rubberBandThreshold: 100,
    });
    // Player at x=0, plane at x=-300 → distance = 300 → multiplier = 3×.
    const body = createBody({
      position: { x: 0, y: 0 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    sys.update(DT, body);
    expect(sys.rubberBandMultiplier).toBeCloseTo(3);
    expect(sys.planePos).toBeCloseTo(-300 + 2 * 3 * DT);
  });

  it("scales speed proportional to distance in path mode with pathContext", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      climbDir: { axis: "path", sign: 1 },
      baseSpeed: 2,
      start: 0,
      rubberBandThreshold: 100,
    });
    // Plane at world (0,0), tangent +x. Player 250 ahead along tangent
    // → multiplier = 2.5×.
    const body = createBody({
      position: { x: 250, y: 0 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    sys.update(DT, body, 1, 250, {
      planeWorld: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
      corridorHalfWidth: 4,
    });
    expect(sys.rubberBandMultiplier).toBeCloseTo(2.5);
    expect(sys.planePos).toBeCloseTo(0 + 2 * 2.5 * DT);
  });

  it("scales speed proportional to playerProgress in path mode without pathContext", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      climbDir: { axis: "path", sign: 1 },
      baseSpeed: 2,
      start: 0,
      rubberBandThreshold: 100,
    });
    const body = createBody({
      position: { x: 0, y: 0 },
      halfExtents: { x: 0.4, y: 0.5 },
    });
    // playerProgress = 400, plane at 0 → distance 400 → multiplier 4×.
    sys.update(DT, body, 1, 400);
    expect(sys.rubberBandMultiplier).toBeCloseTo(4);
    expect(sys.planePos).toBeCloseTo(0 + 2 * 4 * DT);
  });

  it("multiplier returns to 1 once the gap closes back inside the threshold", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 200,
      rubberBandThreshold: 100,
    });
    sys.update(DT, makeBody(0)); // distance 200 → 2×
    expect(sys.rubberBandMultiplier).toBeCloseTo(2);
    // Pretend the player has caught up: now within 100 m of the plane.
    sys.update(DT, makeBody(150)); // distance ~50 → 1×
    expect(sys.rubberBandMultiplier).toBe(1);
  });

  it("rubber-band stacks multiplicatively with deathPlaneSpeedMultiplier", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 200,
      rubberBandThreshold: 100,
    });
    const body = makeBody(0); // distance = 200 → rubber-band 2×
    sys.update(DT, body, 0.5); // stat multiplier 0.5×
    // Combined: 2 (speed) * 0.5 (stat) * 2 (rubber-band) = 2 m/s effective.
    expect(sys.planeY).toBeCloseTo(200 - 2 * 0.5 * 2 * DT);
  });

  it("can be disabled by passing rubberBandThreshold: Infinity", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 10_000,
      rubberBandThreshold: Infinity,
    });
    const body = makeBody(0);
    sys.update(DT, body);
    expect(sys.rubberBandMultiplier).toBe(1);
    expect(sys.planeY).toBeCloseTo(10_000 - 2 * DT);
  });

  it("treats non-positive thresholds as disabled", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 10_000,
      rubberBandThreshold: 0,
    });
    sys.update(DT, makeBody(0));
    expect(sys.rubberBandMultiplier).toBe(1);
  });

  it("defaults to a 100 m threshold when none is configured", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus);
    expect(sys.rubberBandThreshold).toBe(100);
  });

  it("reset() restores the rubber-band multiplier to 1", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      baseSpeed: 2,
      startY: 500,
      rubberBandThreshold: 100,
    });
    sys.update(DT, makeBody(0));
    expect(sys.rubberBandMultiplier).toBeGreaterThan(1);
    sys.reset({ baseSpeed: 2, startY: 500 });
    expect(sys.rubberBandMultiplier).toBe(1);
  });
});
