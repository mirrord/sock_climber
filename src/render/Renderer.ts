import * as THREE from "three";

/**
 * Renderer — owns the THREE.WebGLRenderer.
 *
 * Wraps construction and resize handling so the rest of the codebase never
 * imports THREE.WebGLRenderer directly.  Zero per-frame allocations.
 */
export class Renderer {
  private readonly _r: THREE.WebGLRenderer;

  /**
   * @param canvas - Optional canvas to render into.  When omitted a canvas is
   *   created and appended to `document.body`.
   */
  constructor(canvas?: HTMLCanvasElement) {
    this._r = new THREE.WebGLRenderer({ canvas, antialias: false });
    if (!canvas) {
      this._r.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(this._r.domElement);
    }
  }

  /** The underlying canvas element managed by this renderer. */
  get domElement(): HTMLCanvasElement {
    return this._r.domElement;
  }

  /** Render one frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._r.render(scene, camera);
  }

  /**
   * Clear the canvas to a solid colour without rendering the scene.
   * Used to blank the WebGL canvas when returning to the title screen so the
   * last gameplay frame does not bleed through semi-transparent overlays.
   */
  clearCanvas(color: number = 0x111111): void {
    this._r.setClearColor(color, 1);
    this._r.clear();
    // Restore default (transparent) so normal renders are unaffected.
    this._r.setClearColor(0x000000, 0);
  }

  /** Resize the renderer output to the given pixel dimensions. */
  resize(w: number, h: number): void {
    this._r.setSize(w, h);
  }

  /**
   * Set the device pixel ratio used for the underlying drawing buffer.
   * Re-apply on browser zoom (Ctrl+scroll) so WebGL output stays sharp
   * at the new effective resolution.
   */
  setPixelRatio(dpr: number): void {
    this._r.setPixelRatio(dpr);
  }
}
