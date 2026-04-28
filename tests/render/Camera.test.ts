import { describe, it, expect } from "vitest";
import { GameCamera } from "../../src/render/Camera.js";

// HALF_H = 10, DEADZONE_Y = 1.5, LERP = 0.1 (from Camera.ts constants)

describe("GameCamera", () => {
  it("follow converges toward target over many frames", () => {
    const cam = new GameCamera(16 / 9);
    // Camera starts at worldY = 0.  Player moves to worldY = 50.
    // After enough frames, camWorldY should be near 50 minus the deadzone.
    for (let i = 0; i < 300; i++) {
      cam.follow(0, 50, 1_000);
    }
    // Should have converged (within a couple of world-units of target – deadzone)
    expect(cam.worldY).toBeGreaterThan(44);
    expect(cam.worldY).toBeLessThan(52);
  });

  it("deadzone: camera does not move when target is within ±1.5 units of centre", () => {
    const cam = new GameCamera(16 / 9);
    // worldY is 0 initially.  Target is 1 unit away — inside DEADZONE_Y = 1.5.
    const before = cam.worldY;
    cam.follow(0, 1, 1_000);
    expect(cam.worldY).toBe(before);
  });

  it("deadzone: camera does move when target exceeds 1.5 units", () => {
    const cam = new GameCamera(16 / 9);
    const before = cam.worldY;
    // 2 units outside the deadzone band → camera should chase
    cam.follow(0, 3.5, 1_000);
    expect(cam.worldY).toBeGreaterThan(before);
  });

  it("clamps bottom edge to deathPlaneY (with 5m intrusion margin)", () => {
    const cam = new GameCamera(16 / 9);
    // HALF_H = 10, camWorldY = 0 → bottomY = 10.
    // The death plane is permitted to climb 5m above the camera bottom
    // before forcing the camera up, so the clamp condition is
    // bottomY - 5 > deathPlaneY. With deathPlaneY = 0, bottomY (10) - 5 (5)
    // > 0 → clamp. Expected camWorldY = deathPlaneY - HALF_H + 5 = -5.
    cam.follow(0, 0, 0);
    expect(cam.worldY).toBe(-5);
  });

  it("does not clamp while death plane is within the 5m intrusion band", () => {
    const cam = new GameCamera(16 / 9);
    // bottomY = 10. deathPlaneY = 6 sits 4m above bottom — inside the
    // 5m allowance, so the camera should not be pushed.
    cam.follow(0, 0, 6);
    expect(cam.worldY).toBe(0);
  });

  it("does not clamp when bottom edge is above death plane", () => {
    const cam = new GameCamera(16 / 9);
    // camWorldY = 0, HALF_H = 10 → bottomY = 10.
    // deathPlaneY = 100 → no clamp needed.
    cam.follow(0, 0, 100);
    expect(cam.worldY).toBe(0); // unchanged (target within deadzone)
  });

  it("resize recalculates left/right proportionally to aspect ratio", () => {
    const cam = new GameCamera(16 / 9);
    // Resize to aspect = 2 (800 × 400).  HALF_H = 10 → left = -20, right = 20.
    cam.resize(800, 400);
    const c = cam.threeCamera;
    expect(c.left).toBeCloseTo(-20);
    expect(c.right).toBeCloseTo(20);
  });

  it("resize preserves top/bottom at HALF_H", () => {
    const cam = new GameCamera(16 / 9);
    cam.resize(1920, 1080);
    const c = cam.threeCamera;
    expect(c.top).toBe(10);
    expect(c.bottom).toBe(-10);
  });

  it("threeCamera position.z is 10 after construction", () => {
    const cam = new GameCamera(1);
    expect(cam.threeCamera.position.z).toBe(10);
  });

  it("Y-flip: threeCamera Y = −camWorldY after follow", () => {
    const cam = new GameCamera(16 / 9);
    // Force camera to worldY = 30 by calling follow many times with a far target.
    for (let i = 0; i < 500; i++) {
      cam.follow(0, 50, 1_000);
    }
    // Three.js camera Y should be the negative of our world Y.
    expect(cam.threeCamera.position.y).toBeCloseTo(-cam.worldY, 5);
  });
});
