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

  /** Resize the renderer output to the given pixel dimensions. */
  resize(w: number, h: number): void {
    this._r.setSize(w, h);
  }
}
