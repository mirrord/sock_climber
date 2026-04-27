import { describe, it, expect, beforeEach } from "vitest";
import * as THREE from "three";
import { SpritePool } from "../../src/render/Sprites.js";
import { Player } from "../../src/entities/Player.js";
import { Keys } from "../../src/entities/enemies/Keys.js";
import { TileWorld } from "../../src/physics/TileWorld.js";
import type { SpawnedEntity } from "../../src/level/Generator.js";

// ─── Helper: build a SpawnedEntity fixture from a live Keys instance ─────────

function makeEnemySpawned(pos = { x: 3, y: 5 }): SpawnedEntity {
  return {
    kind: "enemy",
    tag: "Keys",
    position: pos,
    entity: new Keys(pos),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SpritePool", () => {
  let pool: SpritePool;
  let scene: THREE.Scene;

  beforeEach(() => {
    pool = new SpritePool();
    scene = new THREE.Scene();
  });

  // ─── syncPlayer ───────────────────────────────────────────────────────────

  it("syncPlayer creates a mesh and adds it to the scene on first call", () => {
    const player = new Player({ x: 5, y: 0 });
    expect(scene.children.length).toBe(0);
    pool.syncPlayer(player, scene, 5, 0);
    // Tile InstancedMesh is not created until syncTiles; only player mesh here.
    expect(scene.children.length).toBe(1);
  });

  it("syncPlayer reuses the same mesh on subsequent calls (no extra scene.add)", () => {
    const player = new Player({ x: 5, y: 0 });
    pool.syncPlayer(player, scene, 5, 0);
    const firstChild = scene.children[0];
    pool.syncPlayer(player, scene, 6, 1);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBe(firstChild);
  });

  it("syncPlayer applies Y-flip: mesh.position.y === -worldY", () => {
    const player = new Player({ x: 0, y: 30 });
    pool.syncPlayer(player, scene, 0, 30);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.position.y).toBe(-30);
  });

  it("syncPlayer sets mesh X to renderX", () => {
    const player = new Player({ x: 0, y: 0 });
    pool.syncPlayer(player, scene, 7, 0);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.position.x).toBe(7);
  });

  it("syncPlayer faces right (scale.x > 0) by default", () => {
    const player = new Player({ x: 0, y: 0 });
    pool.syncPlayer(player, scene, 0, 0);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.scale.x).toBeGreaterThan(0);
  });

  // ─── syncAll / entity lifecycle ───────────────────────────────────────────

  it("syncAll adds a mesh for a newly spawned entity", () => {
    pool.syncAll([makeEnemySpawned()], scene);
    expect(scene.children.length).toBe(1);
  });

  it("syncAll reuses the mesh for the same entity on a second call", () => {
    const spawned = makeEnemySpawned();
    pool.syncAll([spawned], scene);
    const first = scene.children[0];
    pool.syncAll([spawned], scene);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBe(first);
  });

  it("syncAll removes the mesh when an entity disappears from the list", () => {
    const spawned = makeEnemySpawned();
    pool.syncAll([spawned], scene);
    expect(scene.children.length).toBe(1);
    pool.syncAll([], scene); // entity gone
    expect(scene.children.length).toBe(0);
  });

  it("syncAll Y-flips enemy mesh position", () => {
    const spawned = makeEnemySpawned({ x: 3, y: 5 });
    pool.syncAll([spawned], scene);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.position.y).toBe(-5);
  });

  // ─── syncTiles ────────────────────────────────────────────────────────────

  it("syncTiles creates an InstancedMesh and adds it to the scene", () => {
    const world = new TileWorld(12, 100);
    world.fillRect(0, 10, 12, 1, true);
    pool.syncTiles(world, scene, 10);
    const instanced = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh | undefined;
    expect(instanced).toBeDefined();
  });

  it("syncTiles instance count matches solid tiles in the visible range", () => {
    const world = new TileWorld(12, 100);
    // Place 12 solid tiles in row 10 (one full row).
    world.fillRect(0, 10, 12, 1, true);
    pool.syncTiles(world, scene, 10); // cameraWorldY = 10 → row 10 is visible
    const instanced = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh;
    expect(instanced.count).toBe(12);
  });

  it("syncTiles excludes tiles outside the visible range", () => {
    const world = new TileWorld(12, 200);
    // Row 0: in range.
    world.fillRect(0, 0, 12, 1, true);
    // Row 150: far outside camera range (cameraWorldY = 0).
    world.fillRect(0, 150, 12, 1, true);
    pool.syncTiles(world, scene, 0);
    const instanced = scene.children.find(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh;
    // Only row 0 should be included.
    expect(instanced.count).toBe(12);
  });

  it("syncTiles reuses the same InstancedMesh on subsequent calls", () => {
    const world = new TileWorld(12, 100);
    world.fillRect(0, 5, 4, 1, true);
    pool.syncTiles(world, scene, 5);
    const first = scene.children.find((c) => c instanceof THREE.InstancedMesh);
    pool.syncTiles(world, scene, 5);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(1);
    expect(scene.children.find((c) => c instanceof THREE.InstancedMesh)).toBe(first);
  });

  // ─── syncDeathPlane ───────────────────────────────────────────────────────

  it("syncDeathPlane adds a mesh at -planeY on first call", () => {
    pool.syncDeathPlane(50, scene);
    expect(scene.children.length).toBe(1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.position.y).toBe(-50);
  });

  it("syncDeathPlane updates the same mesh on subsequent calls", () => {
    pool.syncDeathPlane(50, scene);
    const first = scene.children[0];
    pool.syncDeathPlane(100, scene);
    expect(scene.children.length).toBe(1);
    expect(scene.children[0]).toBe(first);
    expect((scene.children[0] as THREE.Mesh).position.y).toBe(-100);
  });

  // ─── setTexture ───────────────────────────────────────────────────────────

  it("setTexture does not throw for a known tag", () => {
    const player = new Player({ x: 0, y: 0 });
    pool.syncPlayer(player, scene, 0, 0); // create the Player material
    const tex = new THREE.Texture();
    expect(() => pool.setTexture("Player", tex)).not.toThrow();
  });

  it("setTexture does not throw for an unknown tag (no-op)", () => {
    expect(() => pool.setTexture("Keys", null)).not.toThrow();
  });
});
