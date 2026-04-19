import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_COLORS, GRID_COLOR, TILE_SIZE } from './editorConstants.js';
import { resolveIdleAnimDef, advanceAnimFrame } from './animUtils.js';

/** Colors for placed object types, keyed by type string. */
const OBJECT_COLORS = {
  player:      0x48bfe3,
  enemy:       0xe63946,
  collectible: 0xf4a261,
  level_end:   0x2dc653,
  event_trigger: 0xb48eff,
  platform:    0x6b705c,
  wall:        0x888888,
  spawn_point: 0xaaaaff,
};
const OBJECT_COLOR_DEFAULT = 0xe8a735;

/**
 * Renders a Level using Three.js with a top-down orthographic view.
 * Manages tile meshes via an InstancedMesh per tile type for performance.
 */
export class EditorRenderer {
  /**
   * @param {HTMLElement} container — DOM element to attach the canvas to
   */
  constructor(container) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f23);

    // Orthographic camera (top-down, Y-up)
    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = 15;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect,
      viewSize, -viewSize,
      0.1, 100
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Grid lines group
    this._gridGroup = new THREE.Group();
    this.scene.add(this._gridGroup);

    // Tile meshes group — rebuilt on level change
    this._tileGroup = new THREE.Group();
    this.scene.add(this._tileGroup);

    // Hover indicator
    this._hoverMesh = this._createHoverIndicator();
    this.scene.add(this._hoverMesh);
    this._hoverMesh.visible = false;

    // Pending-placement hover (distinct color, shown instead of normal hover)
    this._pendingHoverMesh = this._createHoverIndicator(0x48bfe3, 0.45);
    this.scene.add(this._pendingHoverMesh);
    this._pendingHoverMesh.visible = false;

    // Placed-objects group — rebuilt via rebuildObjects()
    this._objectsGroup = new THREE.Group();
    this.scene.add(this._objectsGroup);

    /** @type {Array<{mesh: THREE.Mesh, animDef: object, sheet: object, frame: number, timeAcc: number}>} */
    this._objectAnimStates = [];

    /** @type {Map<string, {mesh: THREE.Mesh, animDef: object, sheet: object, frame: number, timeAcc: number}>} Keyed by placed-object id. */
    this._objectAnimStateById = new Map();

    /** @type {Array<{id: string, dataUrl: string, width: number, height: number}>} Cached from last rebuildObjects call. */
    this._spriteSheetCatalogue = [];

    /** @type {Map<string, THREE.Mesh>} Keyed by placed-object id. */
    this._objectMeshById = new Map();

    // Reusable geometry for tiles
    this._tileGeo = new THREE.PlaneGeometry(TILE_SIZE * 0.95, TILE_SIZE * 0.95);

    // Material cache per tile type
    this._tileMaterials = {};
    for (const [type, color] of Object.entries(TILE_COLORS)) {
      this._tileMaterials[type] = new THREE.MeshBasicMaterial({ color });
    }

    // Resize handler
    this._onResize = () => this._handleResize();
    window.addEventListener('resize', this._onResize);
  }

  /** Convert screen (pixel) coords to grid coords. */
  screenToGrid(screenX, screenY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const worldX = ndcX * (this.camera.right - this.camera.left) / 2 + (this.camera.right + this.camera.left) / 2;
    const worldY = ndcY * (this.camera.top - this.camera.bottom) / 2 + (this.camera.top + this.camera.bottom) / 2;

    return {
      x: Math.floor(worldX / TILE_SIZE + this._offsetX),
      y: Math.floor(worldY / TILE_SIZE + this._offsetY),
    };
  }

  /** Rebuild the visual grid and tile meshes from a Level. */
  rebuildFromLevel(level) {
    this._offsetX = level.width / 2;
    this._offsetY = level.height / 2;

    this._rebuildGrid(level);
    this._rebuildTiles(level);
  }

  /** Update only the tiles (call after paint/erase). */
  updateTiles(level) {
    this._offsetX = level.width / 2;
    this._offsetY = level.height / 2;
    this._rebuildTiles(level);
  }

  /** Show hover indicator at grid position. */
  showHover(gridX, gridY) {
    this._hoverMesh.visible = true;
    this._hoverMesh.position.set(
      (gridX - this._offsetX + 0.5) * TILE_SIZE,
      (gridY - this._offsetY + 0.5) * TILE_SIZE,
      0.1
    );
  }

  /** Hide hover indicator. */
  hideHover() {
    this._hoverMesh.visible = false;
  }

  /** Render one frame. */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Pan camera by delta world units. */
  panCamera(dx, dy) {
    this.camera.left += dx;
    this.camera.right += dx;
    this.camera.top += dy;
    this.camera.bottom += dy;
    this.camera.updateProjectionMatrix();
  }

  /** Zoom camera (positive = zoom in). */
  zoomCamera(delta) {
    const factor = 1 - delta * 0.1;
    const cx = (this.camera.left + this.camera.right) / 2;
    const cy = (this.camera.top + this.camera.bottom) / 2;
    const hw = (this.camera.right - this.camera.left) / 2 * factor;
    const hh = (this.camera.top - this.camera.bottom) / 2 * factor;

    // Clamp zoom
    if (hw < 1 || hw > 60) return;

    this.camera.left = cx - hw;
    this.camera.right = cx + hw;
    this.camera.top = cy + hh;
    this.camera.bottom = cy - hh;
    this.camera.updateProjectionMatrix();
  }

  /** Clean up. */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this._tileGeo.dispose();
    for (const mat of Object.values(this._tileMaterials)) mat.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  /**
   * Rebuild the visual representations of all placed objects from a Level.
   * Call after any place / remove operation.
   *
   * @param {import('../level/Level.js').Level} level
   * @param {Map<string, import('../objects/GameObject.js').GameObject>} [objectDefs]
   *   Optional map of type → GameObject used to look up idle animation data.
   * @param {Array<{id: string, dataUrl: string, width: number, height: number}>} [spriteSheets]
   *   Optional sprite sheet catalogue. Loaded from localStorage when omitted.
   */
  rebuildObjects(level, objectDefs = null, spriteSheets = null) {
    // Clear old meshes and dispose their GPU resources
    this._objectAnimStates = [];
    this._objectAnimStateById.clear();
    this._objectMeshById.clear();
    while (this._objectsGroup.children.length) {
      const child = this._objectsGroup.children[0];
      if (child.material?.map) child.material.map.dispose();
      child.geometry.dispose();
      child.material.dispose();
      this._objectsGroup.remove(child);
    }

    const sheets = spriteSheets ?? this._loadSpriteSheets();
    this._spriteSheetCatalogue = sheets;

    for (const obj of level.objects) {
      const def = objectDefs?.get(obj.type) ?? null;
      const idleAnimDef = def ? resolveIdleAnimDef(def) : null;
      const sheet = idleAnimDef?.spriteSheetId
        ? sheets.find((s) => s.id === idleAnimDef.spriteSheetId) ?? null
        : null;

      let mesh;
      if (idleAnimDef && sheet) {
        mesh = this._createAnimatedObjectMesh(idleAnimDef, sheet);
        const state = { mesh, animDef: idleAnimDef, sheet, frame: 0, timeAcc: 0 };
        this._objectAnimStates.push(state);
        this._objectAnimStateById.set(obj.id, state);
      } else {
        mesh = this._createColorObjectMesh(obj);
      }

      mesh.position.set(
        (obj.x - this._offsetX + 0.5) * TILE_SIZE,
        (obj.y - this._offsetY + 0.5) * TILE_SIZE,
        0.15,   // just above tiles
      );
      this._objectMeshById.set(obj.id, mesh);
      this._objectsGroup.add(mesh);
    }
  }

  /**
   * Return the Three.js mesh for a placed object, or null if not found.
   * Valid after rebuildObjects() has been called.
   * @param {string} id — placed object id
   * @returns {THREE.Mesh|null}
   */
  getObjectMesh(id) {
    return this._objectMeshById.get(id) ?? null;
  }

  /**
   * Switch the active animation for a placed object identified by id.
   * Only works for objects that were built with an animated mesh (i.e. those
   * that had a resolvable idle animation during rebuildObjects).
   * Resets to frame 0 and immediately applies the new frame.
   *
   * @param {string} id — placed object id
   * @param {object|null} animDef — animation definition from GameObject.animations[]
   */
  setObjectAnimation(id, animDef) {
    if (!animDef) return;
    const state = this._objectAnimStateById.get(id);
    if (!state) return;
    const sheet = animDef.spriteSheetId
      ? this._spriteSheetCatalogue.find((s) => s.id === animDef.spriteSheetId) ?? null
      : null;
    if (!sheet) return;
    state.animDef = animDef;
    state.sheet = sheet;
    state.frame = 0;
    state.timeAcc = 0;
    this._applyAnimFrame(state.mesh, animDef, sheet, 0);
  }

  /**
   * Advance per-object sprite animations.
   * Call once per frame during play/test mode.
   * @param {number} dt — elapsed seconds
   */
  updateObjectAnimations(dt) {
    for (const state of this._objectAnimStates) {
      const next = advanceAnimFrame(state, dt);
      if (next.frame !== state.frame) {
        this._applyAnimFrame(state.mesh, state.animDef, state.sheet, next.frame);
      }
      state.frame = next.frame;
      state.timeAcc = next.timeAcc;
    }
  }

  /**
   * Show the pending-placement hover (distinct from the normal tile hover).
   * Call during mousemove when a placement type is selected.
   * @param {number} gridX
   * @param {number} gridY
   */
  showPendingHover(gridX, gridY) {
    this._hoverMesh.visible = false;
    this._pendingHoverMesh.visible = true;
    this._pendingHoverMesh.position.set(
      (gridX - this._offsetX + 0.5) * TILE_SIZE,
      (gridY - this._offsetY + 0.5) * TILE_SIZE,
      0.2
    );
  }

  /** Hide the pending-placement hover. */
  hidePendingHover() {
    this._pendingHoverMesh.visible = false;
  }

  // ---- Private ----

  /** Load sprite sheet catalogue from localStorage. */
  _loadSpriteSheets() {
    try {
      const raw = localStorage.getItem('sock_climber_oe_sprite_sheets');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Create a color-coded fallback mesh for a placed object. */
  _createColorObjectMesh(placedObj) {
    const color = OBJECT_COLORS[placedObj.type] ?? OBJECT_COLOR_DEFAULT;
    const geo = new THREE.PlaneGeometry(TILE_SIZE * 0.7, TILE_SIZE * 0.7);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Create a sprite mesh for an object using its configured idle animation frame 0.
   * @param {object} animDef
   * @param {{dataUrl: string, width: number, height: number}} sheet
   * @returns {THREE.Mesh}
   */
  _createAnimatedObjectMesh(animDef, sheet) {
    const fw = animDef.frameWidth;
    const fh = animDef.frameHeight;
    const framesPerRow = Math.max(1, Math.floor(sheet.width / fw));
    const rx = fw / sheet.width;
    const ry = fh / sheet.height;

    const texture = new THREE.TextureLoader().load(sheet.dataUrl);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(rx, ry);

    const frameIndex = animDef.frameStart;
    const col = frameIndex % framesPerRow;
    const row = Math.floor(frameIndex / framesPerRow);
    texture.offset.set(col * rx, 1 - (row + 1) * ry);

    const aspect = fh > 0 ? fw / fh : 1;
    const height = TILE_SIZE * 0.9;
    const geo = new THREE.PlaneGeometry(height * aspect, height);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    return new THREE.Mesh(geo, mat);
  }

  /**
   * Update the UV offset on an animated object mesh to show the given frame.
   * @param {THREE.Mesh} mesh
   * @param {object} animDef
   * @param {{width: number, height: number}} sheet
   * @param {number} frame — 0-based frame index within the animation
   */
  _applyAnimFrame(mesh, animDef, sheet, frame) {
    const fw = animDef.frameWidth;
    const fh = animDef.frameHeight;
    const framesPerRow = Math.max(1, Math.floor(sheet.width / fw));
    const rx = fw / sheet.width;
    const ry = fh / sheet.height;
    const frameIndex = animDef.frameStart + frame;
    const col = frameIndex % framesPerRow;
    const row = Math.floor(frameIndex / framesPerRow);
    mesh.material.map.offset.set(col * rx, 1 - (row + 1) * ry);
    mesh.material.map.needsUpdate = true;
  }

  _createHoverIndicator(color = 0xffffff, opacity = 0.25) {
    const geo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
    });
    return new THREE.Mesh(geo, mat);
  }

  _rebuildGrid(level) {
    // Clear old grid
    while (this._gridGroup.children.length) {
      this._gridGroup.remove(this._gridGroup.children[0]);
    }

    const mat = new THREE.LineBasicMaterial({ color: GRID_COLOR });
    const halfW = level.width / 2;
    const halfH = level.height / 2;

    // Vertical lines
    for (let x = 0; x <= level.width; x++) {
      const points = [
        new THREE.Vector3((x - halfW) * TILE_SIZE, -halfH * TILE_SIZE, 0),
        new THREE.Vector3((x - halfW) * TILE_SIZE, halfH * TILE_SIZE, 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this._gridGroup.add(new THREE.Line(geo, mat));
    }

    // Horizontal lines
    for (let y = 0; y <= level.height; y++) {
      const points = [
        new THREE.Vector3(-halfW * TILE_SIZE, (y - halfH) * TILE_SIZE, 0),
        new THREE.Vector3(halfW * TILE_SIZE, (y - halfH) * TILE_SIZE, 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      this._gridGroup.add(new THREE.Line(geo, mat));
    }
  }

  _rebuildTiles(level) {
    // Clear old tiles
    while (this._tileGroup.children.length) {
      const child = this._tileGroup.children[0];
      this._tileGroup.remove(child);
    }

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const tile = level.getTile(x, y);
        if (tile === TILE.EMPTY) continue;

        const mesh = new THREE.Mesh(this._tileGeo, this._tileMaterials[tile]);
        mesh.position.set(
          (x - this._offsetX + 0.5) * TILE_SIZE,
          (y - this._offsetY + 0.5) * TILE_SIZE,
          0
        );
        this._tileGroup.add(mesh);
      }
    }
  }

  _handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const aspect = w / h;

    const viewH = (this.camera.top - this.camera.bottom) / 2;
    this.camera.left = -viewH * aspect;
    this.camera.right = viewH * aspect;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(w, h);
  }
}
