import { describe, it, expect } from "vitest";
import { createBody } from "../../src/physics/Body.js";
import { TileWorld } from "../../src/physics/TileWorld.js";
import { step } from "../../src/physics/Resolver.js";

const DT = 1 / 120;

/**
 * Creates a test world with a solid floor at tile row `floorRow`.
 * Floor tiles span full width.
 */
function makeWorld(width = 20, height = 20, floorRow = 15): TileWorld {
  const w = new TileWorld(width, height);
  w.fillRect(0, floorRow, width, 1, true);
  return w;
}

describe("Resolver — free fall", () => {
  it("body falls under gravity when no floor is near", () => {
    const world = makeWorld();
    const body = createBody({
      position: { x: 5, y: 0 },
      gravity: 30,
      drag: 0,
    });

    // 10 steps of free fall.
    for (let i = 0; i < 10; i++) step(body, world, DT);
    expect(body.position.y).toBeGreaterThan(0);
    expect(body.velocity.y).toBeGreaterThan(0);
    expect(body.flags.onGround).toBe(false);
  });
});

describe("Resolver — land on floor", () => {
  it("body lands on floor and onGround is set", () => {
    const world = makeWorld(20, 20, 15);
    // Place body just above floor row 15 — floor top face is at y=15.
    // Body halfHeight = 0.5, so center at y = 14.
    const body = createBody({
      position: { x: 5, y: 10 },
      gravity: 30,
      drag: 0,
    });

    // Run until the body lands (max 2000 steps = ~16.7 s at 120 Hz).
    let landed = false;
    for (let i = 0; i < 2000; i++) {
      step(body, world, DT);
      if (body.flags.onGround) {
        landed = true;
        break;
      }
    }

    expect(landed).toBe(true);
    // After landing, velocity.y should be zero (zeroed by contact resolution).
    expect(body.velocity.y).toBeCloseTo(0, 1);
    // No penetration: body bottom should be at or above floor top (y=15).
    const bodyBottom = body.position.y + body.halfExtents.y;
    expect(bodyBottom).toBeLessThanOrEqual(15 + 1e-3);
  });

  it("body does not penetrate the floor after landing", () => {
    const world = makeWorld(20, 20, 10);
    const body = createBody({
      position: { x: 5, y: 5 },
      gravity: 30,
      drag: 0,
    });

    for (let i = 0; i < 500; i++) step(body, world, DT);

    const bodyBottom = body.position.y + body.halfExtents.y;
    expect(bodyBottom).toBeLessThanOrEqual(10 + 1e-3);
  });
});

describe("Resolver — wall stop", () => {
  it("horizontal velocity is zeroed when hitting a vertical wall", () => {
    const world = new TileWorld(20, 20);
    // Solid vertical wall at tile column 10.
    world.fillRect(10, 0, 1, 20, true);

    const body = createBody({
      position: { x: 5, y: 5 },
      gravity: 0, // no gravity, testing pure horizontal collision
      drag: 0,
      velocity: { x: 20, y: 0 },
    });

    for (let i = 0; i < 200; i++) step(body, world, DT);

    expect(body.velocity.x).toBeCloseTo(0, 1);
    expect(body.flags.onWallR).toBe(true);
    // Vertical motion unaffected (still 0).
    expect(body.velocity.y).toBeCloseTo(0, 5);
  });
});

describe("Resolver — tunnelling", () => {
  it("high-speed body does not clip through a 1-tile wall", () => {
    const world = new TileWorld(20, 20);
    // Solid wall at column 5.
    world.fillRect(5, 0, 1, 20, true);

    const body = createBody({
      position: { x: 3, y: 5 },
      gravity: 0,
      drag: 0,
      velocity: { x: 1000, y: 0 }, // 1000 m/s — extreme tunnelling scenario
    });

    step(body, world, DT);

    // Body should not have passed through the wall (wall left face = 5.0).
    const bodyRight = body.position.x + body.halfExtents.x;
    expect(bodyRight).toBeLessThanOrEqual(5 + 1e-3);
  });
});

describe("Resolver — ceiling bonk", () => {
  it("upward velocity zeroed when hitting ceiling, onCeiling set", () => {
    const world = new TileWorld(20, 20);
    // Solid ceiling at tile row 0 (spans y=0..1, bottom face at y=1).
    world.fillRect(0, 0, 20, 1, true);

    // Place body just 1 m below the ceiling bottom face.
    // Ceiling bottom face = y=1. Body center so body top = 1 + some gap.
    // Body halfH=0.5 → center at y = 2.
    const body = createBody({
      position: { x: 5, y: 2 },
      gravity: 0,
      drag: 0,
      velocity: { x: 0, y: -100 }, // moving up fast
    });

    // Run until ceiling is hit (at most a few steps).
    let bonked = false;
    for (let i = 0; i < 50; i++) {
      step(body, world, DT);
      if (body.flags.onCeiling) {
        bonked = true;
        break;
      }
    }

    expect(bonked).toBe(true);
    expect(body.velocity.y).toBeGreaterThanOrEqual(0);
  });
});

describe("Resolver — diagonal corner", () => {
  it("body approaching a corner resolves both axes without clipping", () => {
    const world = new TileWorld(20, 20);
    // Solid wall at column 9 and solid floor at row 9.
    // Body at (8,8) with halfExtents (0.4, 0.5): right edge at 8.4, bottom at 8.5.
    // Gap to wall face (x=9) ≈ 0.6 m; gap to floor face (y=9) = 0.5 m.
    // With velocity (100,100) and dt=1/120, dx=dy≈0.833 — both faces are reached.
    world.fillRect(9, 0, 1, 20, true);  // vertical wall, left face at x=9
    world.fillRect(0, 9, 20, 1, true);  // horizontal floor, top face at y=9

    const body = createBody({
      position: { x: 8, y: 8 },
      gravity: 0,
      drag: 0,
      velocity: { x: 100, y: 100 },
    });

    step(body, world, DT);

    // Body must not penetrate either surface.
    const bodyRight = body.position.x + body.halfExtents.x;
    const bodyBottom = body.position.y + body.halfExtents.y;
    expect(bodyRight).toBeLessThanOrEqual(9 + 1e-3);
    expect(bodyBottom).toBeLessThanOrEqual(9 + 1e-3);
  });
});
