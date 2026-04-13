import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_COLORS, GRID_COLOR, TILE_SIZE } from './editorConstants.js';

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

  // ---- Private ----

  _createHoverIndicator() {
    const geo = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.25,
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
