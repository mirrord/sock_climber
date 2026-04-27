import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { ParticleSystem } from "../../src/render/Particles.js";

// Dust burst size and spring puff burst size (must match Particles.ts constants).
const DUST_COUNT = 4;
const SPRING_COUNT = 6;

describe("ParticleSystem", () => {
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = new THREE.Scene();
  });

  it("constructs without throwing and pre-populates scene with meshes", () => {
    expect(() => new ParticleSystem(scene)).not.toThrow();
    // All pool meshes are added to the scene at construction time.
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it("all meshes are invisible before any emit", () => {
    new ParticleSystem(scene);
    const visible = scene.children.filter((c) => c.visible);
    expect(visible.length).toBe(0);
  });

  // ─── emit ─────────────────────────────────────────────────────────────────

  it("emit('dust') activates DUST_COUNT particles", () => {
    const ps = new ParticleSystem(scene);
    expect(ps.activeCount).toBe(0);
    ps.emit("dust", 0, 0);
    expect(ps.activeCount).toBe(DUST_COUNT);
  });

  it("emit('springPuff') activates SPRING_COUNT particles", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("springPuff", 0, 0);
    expect(ps.activeCount).toBe(SPRING_COUNT);
  });

  it("emitted dust particles are visible", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("dust", 5, 10);
    const visible = scene.children.filter((c) => c.visible);
    expect(visible.length).toBe(DUST_COUNT);
  });

  it("emit positions meshes at the given world coordinates (Y-flipped)", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("dust", 3, 7);
    // All newly active meshes should start at x=3, y=-7 (Y-flip).
    const activeMeshes = scene.children.filter((c) => c.visible) as THREE.Mesh[];
    for (const m of activeMeshes) {
      expect(m.position.x).toBe(3);
      expect(m.position.y).toBe(-7);
    }
  });

  // ─── update ───────────────────────────────────────────────────────────────

  it("update moves active particles along their velocity", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("dust", 0, 0);
    const before = (scene.children.filter((c) => c.visible)[0] as THREE.Mesh).position.x;
    ps.update(0.05);
    const after = (scene.children.filter((c) => c.visible)[0] as THREE.Mesh).position.x;
    // Velocity is non-zero for dust particles — position should change.
    expect(after).not.toBe(before);
  });

  it("particles expire after their lifetime elapses", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("dust", 0, 0);
    expect(ps.activeCount).toBe(DUST_COUNT);
    // Advance well past LIFETIME (0.3 s).
    ps.update(1.0);
    expect(ps.activeCount).toBe(0);
  });

  it("expired particles become invisible", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("springPuff", 0, 0);
    ps.update(1.0);
    const visible = scene.children.filter((c) => c.visible);
    expect(visible.length).toBe(0);
  });

  it("expired particles return to the free list and can be reused", () => {
    const ps = new ParticleSystem(scene);
    ps.emit("dust", 0, 0);
    ps.update(1.0); // all expire
    expect(ps.activeCount).toBe(0);
    // Can emit again without throwing (pool refilled).
    ps.emit("dust", 1, 2);
    expect(ps.activeCount).toBe(DUST_COUNT);
  });

  it("pool exhaustion: emit beyond capacity does not throw", () => {
    const ps = new ParticleSystem(scene);
    // Emit many bursts to try to exhaust the pool (POOL_SIZE = 24).
    expect(() => {
      for (let i = 0; i < 10; i++) {
        ps.emit("dust", i, i);
        ps.emit("springPuff", i, i);
      }
    }).not.toThrow();
  });
});
