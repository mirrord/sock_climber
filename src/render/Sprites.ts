import * as THREE from "three";
import type { Player } from "../entities/Player.js";
import type { SpawnedEntity } from "../level/Generator.js";
import type { TileWorld } from "../physics/TileWorld.js";
import type { EntityTag } from "../level/Chunks.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Visible half-height of the viewport in world units. */
const HALF_H = 10;
/** Extra tile rows above/below the viewport to include in the tile mesh. */
const TILE_ROW_BUFFER = 2;
/**
 * Maximum tile instances in the InstancedMesh.
 * World width = 12, visible rows ≈ 24, buffer = 4 → ≤ 336; rounded up.
 */
const MAX_TILE_INSTANCES = 512;

// ─── Color palette (MeshBasicMaterial colours per tag or special key) ────────

const TAG_COLOR: Readonly<Record<string, number>> = {
  // Player
  Player: 0xffffff,
  // Enemies
  Keys: 0xffff00,
  Wallet: 0x00ff66,
  Phone: 0x4488ff,
  Lipstick: 0xff00cc,
  Headphones: 0xaa44ff,
  // Obstacles
  Gum: 0x8b4513,
  DustBunny: 0x999999,
  Lighter: 0xff8800,
  Pen: 0x00aaaa,
  // Buffs (all share a gold tint)
  LowGravitySock: 0xffd700,
  SpeedSock: 0xffd700,
  SlowFloodSock: 0xffd700,
  HighJumpSock: 0xffd700,
  PowerSock: 0xffd700,
  RapidStrikeSock: 0xffd700,
};

/** Fallback colour when a tag is not found in the palette (bright magenta = obvious placeholder). */
const DEFAULT_COLOR = 0xff00ff;

// ─── Z-layer ordering ─────────────────────────────────────────────────────────

const Z_LAYER = {
  tile: 0,
  obstacle: 0.4,
  enemy: 0.5,
  buff: 0.6,
  player: 1.0,
  deathPlane: 0.9,
} as const;

// ─── Local interfaces for structural typing (avoids deep entity imports) ──────

interface HasBody {
  readonly body: {
    readonly position: { x: number; y: number };
    readonly halfExtents: { x: number; y: number };
  };
}

interface BuffLike {
  readonly id: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly halfW: number;
  readonly halfH: number;
}

// ─── SpritePool ───────────────────────────────────────────────────────────────

/**
 * SpritePool — manages Three.js meshes for all game entities and the tile world.
 *
 * Entity meshes are created lazily on first `syncEntity` call and removed from
 * the scene when their entity no longer appears in `syncAll`.  The tile world
 * uses a single InstancedMesh updated every render frame.  The death plane uses
 * one long thin plane mesh.
 *
 * Zero per-frame allocations during steady-state gameplay after warmup.
 */
export class SpritePool {
  // ─── Entity meshes (id → mesh) ────────────────────────────────────────────
  private readonly _meshes = new Map<number, THREE.Mesh>();

  /** Reusable Set for tracking live entity IDs — prevents per-frame allocation. */
  private readonly _seenThisFrame = new Set<number>();
  /** Reusable array for collecting IDs to remove — prevents per-frame allocation. */
  private readonly _toRemove: number[] = [];

  // ─── Player mesh ──────────────────────────────────────────────────────────
  private _playerMesh: THREE.Mesh | null = null;

  // ─── Death plane mesh ─────────────────────────────────────────────────────
  private _planeMesh: THREE.Mesh | null = null;

  // ─── Shared unit-plane geometry (scale handles sizing) ────────────────────
  private readonly _geoUnit = new THREE.PlaneGeometry(1, 1);

  // ─── Tile InstancedMesh ───────────────────────────────────────────────────
  private _tileMesh: THREE.InstancedMesh | null = null;
  /** Pre-allocated Object3D for computing tile instance matrices. */
  private readonly _dummy = new THREE.Object3D();
  private readonly _tileMat = new THREE.MeshBasicMaterial({ color: 0x555577 });

  // ─── Material cache (one MeshBasicMaterial per tag/key) ───────────────────
  private readonly _mats = new Map<string, THREE.MeshBasicMaterial>();

  // ─── Death plane geometry ─────────────────────────────────────────────────
  private readonly _planeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  private readonly _planeGeo = new THREE.PlaneGeometry(100, 0.1);

  // ─── Material helpers ─────────────────────────────────────────────────────

  private _matFor(key: string): THREE.MeshBasicMaterial {
    let mat = this._mats.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: TAG_COLOR[key] ?? DEFAULT_COLOR });
      this._mats.set(key, mat);
    }
    return mat;
  }

  /**
   * Swap a loaded texture into the material for a given tag.
   * Pass `null` to revert to the solid-colour placeholder.
   * This is a no-op if the material has not been created yet (first `sync*`
   * call has not occurred for that tag).
   *
   * @param tag     - Entity tag or `"Player"` / `"tile"`.
   * @param texture - Loaded Three.js texture, or `null` to remove.
   */
  setTexture(tag: EntityTag | "Player" | "tile", texture: THREE.Texture | null): void {
    if (tag === "tile") {
      this._tileMat.map = texture;
      this._tileMat.needsUpdate = true;
      return;
    }
    const mat = this._mats.get(tag as string);
    if (mat) {
      mat.map = texture;
      mat.needsUpdate = true;
    }
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  /**
   * Update (or create) the player mesh.
   *
   * @param player  - Player entity; facing direction and half-extents are read.
   * @param scene   - Three.js scene.
   * @param renderX - Interpolated world X.
   * @param renderY - Interpolated world Y (Y+ = down in world space).
   */
  syncPlayer(player: Player, scene: THREE.Scene, renderX: number, renderY: number): void {
    if (!this._playerMesh) {
      this._playerMesh = new THREE.Mesh(this._geoUnit, this._matFor("Player"));
      this._playerMesh.position.z = Z_LAYER.player;
      scene.add(this._playerMesh);
    }
    const hw = player.body.halfExtents.x;
    const hh = player.body.halfExtents.y;
    this._playerMesh.position.x = renderX;
    this._playerMesh.position.y = -renderY; // Y-flip
    this._playerMesh.scale.set(player.facing * hw * 2, hh * 2, 1);
  }

  // ─── Entity sync (enemies / obstacles / buffs) ────────────────────────────

  /**
   * Sync all live entity meshes to match `entities`, creating new meshes for
   * newly spawned entities and removing meshes for despawned ones.
   *
   * Call once per render frame.
   *
   * @param entities - Current live entity list from `SpawnSystem.liveEntities`.
   * @param scene    - Three.js scene.
   */
  syncAll(entities: readonly SpawnedEntity[], scene: THREE.Scene): void {
    this._seenThisFrame.clear();
    for (const e of entities) {
      this._syncEntity(e, scene);
      this._seenThisFrame.add(e.entity.id);
    }

    // Collect stale IDs.  Cannot delete while iterating the map.
    this._toRemove.length = 0;
    for (const id of this._meshes.keys()) {
      if (!this._seenThisFrame.has(id)) {
        this._toRemove.push(id);
      }
    }
    for (const id of this._toRemove) {
      this._removeMesh(id, scene);
    }
  }

  /** @internal */
  private _syncEntity(spawned: SpawnedEntity, scene: THREE.Scene): void {
    const { id, x, y, hw, hh } = this._boundsOf(spawned);
    const zLayer = Z_LAYER[spawned.kind as keyof typeof Z_LAYER] ?? 0.3;

    let mesh = this._meshes.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(this._geoUnit, this._matFor(spawned.tag as string));
      mesh.position.z = zLayer;
      scene.add(mesh);
      this._meshes.set(id, mesh);
    }
    mesh.position.x = x;
    mesh.position.y = -y; // Y-flip
    // Enemies face the direction they're moving; obstacles & buffs do not flip.
    let scaleX = hw * 2;
    if (spawned.kind === "enemy") {
      const vx = (spawned.entity as unknown as { body: { velocity: { x: number } } })
        .body.velocity.x;
      if (vx < 0) scaleX = -scaleX;
    }
    mesh.scale.set(scaleX, hh * 2, 1);
  }

  /** @internal */
  private _removeMesh(id: number, scene: THREE.Scene): void {
    const mesh = this._meshes.get(id);
    if (mesh) {
      scene.remove(mesh);
      this._meshes.delete(id);
    }
  }

  // ─── Death plane ──────────────────────────────────────────────────────────

  /**
   * Update (or create) the death-plane mesh.
   *
   * @param planeY - Current death-plane world Y (Y+ = down).
   * @param scene  - Three.js scene.
   */
  syncDeathPlane(planeY: number, scene: THREE.Scene): void {
    if (!this._planeMesh) {
      this._planeMesh = new THREE.Mesh(this._planeGeo, this._planeMat);
      this._planeMesh.position.z = Z_LAYER.deathPlane;
      scene.add(this._planeMesh);
    }
    this._planeMesh.position.y = -planeY; // Y-flip
  }

  // ─── Tiles ────────────────────────────────────────────────────────────────

  /**
   * Rebuild the tile InstancedMesh for the visible range around `cameraWorldY`.
   *
   * Scans only the visible tile rows (camera centre ± HALF_H ± buffer), so the
   * cost is O(visible_width × visible_rows) ≈ O(288) per frame — acceptable.
   *
   * @param world        - Tile world (source of truth for solid tiles).
   * @param scene        - Three.js scene.
   * @param cameraWorldY - Camera centre world Y from `GameCamera.worldY`.
   */
  syncTiles(world: TileWorld, scene: THREE.Scene, cameraWorldY: number): void {
    if (!this._tileMesh) {
      this._tileMesh = new THREE.InstancedMesh(
        this._geoUnit,
        this._tileMat,
        MAX_TILE_INSTANCES,
      );
      this._tileMesh.position.z = Z_LAYER.tile;
      // Instances are manually culled to the visible row range in this method,
      // but the InstancedMesh's bounding sphere is derived from the unit-plane
      // geometry at the mesh origin (0, 0, 0).  Once the camera climbs far
      // enough from the origin, Three.js frustum-culls the entire mesh and the
      // walls vanish visually (physics is unaffected).  Disable frustum
      // culling — per-instance culling above already keeps the draw bounded.
      this._tileMesh.frustumCulled = false;
      scene.add(this._tileMesh);
    }

    const minTileY = Math.floor(cameraWorldY - HALF_H - TILE_ROW_BUFFER);
    const maxTileY = Math.ceil(cameraWorldY + HALF_H + TILE_ROW_BUFFER);

    let count = 0;
    for (let ty = minTileY; ty <= maxTileY && count < MAX_TILE_INSTANCES; ty++) {
      for (let tx = 0; tx < world.width && count < MAX_TILE_INSTANCES; tx++) {
        if (world.solidAt(tx, ty)) {
          // Tile AABB spans [tx, tx+1] × [ty, ty+1]; centre at (tx+0.5, ty+0.5).
          this._dummy.position.set(tx + 0.5, -(ty + 0.5), 0); // Y-flip
          this._dummy.updateMatrix();
          this._tileMesh.setMatrixAt(count, this._dummy.matrix);
          count++;
        }
      }
    }

    this._tileMesh.count = count;
    this._tileMesh.instanceMatrix.needsUpdate = true;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Extract position and half-extents from any SpawnedEntity without importing
   * the concrete entity classes.
   */
  private _boundsOf(
    spawned: SpawnedEntity,
  ): { id: number; x: number; y: number; hw: number; hh: number } {
    if (spawned.kind === "buff") {
      const b = spawned.entity as unknown as BuffLike;
      return { id: b.id, x: b.position.x, y: b.position.y, hw: b.halfW, hh: b.halfH };
    }
    const body = (spawned.entity as unknown as HasBody).body;
    return {
      id: spawned.entity.id,
      x: body.position.x,
      y: body.position.y,
      hw: body.halfExtents.x,
      hh: body.halfExtents.y,
    };
  }
}
