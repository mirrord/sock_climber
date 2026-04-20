// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/**
 * Focused tests for EditorRenderer.setObjectAnimation.
 * We import the class and construct a minimal instance with mocked Three.js
 * just enough to exercise the animation-switching logic.
 */

// ── Three.js stubs (must register before importing EditorRenderer) ──

vi.mock('three', () => {
  class Texture {
    constructor(image) {
      this.wrapS = 0; this.wrapT = 0;
      this.repeat = { set: vi.fn() };
      this.offset = { set: vi.fn() };
      this.needsUpdate = false;
      this.image = image ?? null;
      this.dispose = vi.fn();
    }
  }
  class TextureLoader { load(url) { const t = new Texture(); t._url = url; return t; } }
  class MeshBasicMaterial { constructor(opts = {}) { this.map = opts.map ?? null; this.dispose = vi.fn(); } }
  class PlaneGeometry { constructor() {} dispose() {} }
  class Mesh { constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = { x:0,y:0,z:0, set: vi.fn() }; this.visible = true; } }
  class Scene { constructor() { this.background = null; this.children = []; } add() {} remove() {} }
  class OrthographicCamera { constructor() { this.position = { set: vi.fn() }; this.lookAt = vi.fn(); } }
  class WebGLRenderer {
    constructor() { this.domElement = document.createElement('canvas'); }
    setSize() {} setPixelRatio() {} render() {} dispose() {}
  }
  class Color { constructor() {} }
  class LineBasicMaterial { constructor() { this.dispose = vi.fn(); } }
  class BufferGeometry { constructor() { this.setAttribute = vi.fn(); } dispose() {} }
  class Float32BufferAttribute { constructor() {} }
  class LineSegments { constructor() {} }
  class InstancedMesh {
    constructor(geo, mat, count) { this.geometry = geo; this.material = mat; this.count = count; }
    setMatrixAt() {} setColorAt() {} dispose() {}
    get instanceMatrix() { return { needsUpdate: false }; }
    get instanceColor() { return { needsUpdate: false }; }
  }
  class Matrix4 { makeTranslation() { return this; } }
  class Group { constructor() { this.children = []; } add() {} remove() {} }
  return {
    Texture, TextureLoader, MeshBasicMaterial, PlaneGeometry, Mesh,
    Scene, OrthographicCamera, WebGLRenderer, Color,
    LineBasicMaterial, BufferGeometry, Float32BufferAttribute, LineSegments,
    InstancedMesh, Matrix4, Group,
    RepeatWrapping: 1000,
  };
});

import { EditorRenderer } from '../../src/editor/EditorRenderer.js';

// ── Helpers ──

const sheetA = { id: 'sheetA', dataUrl: 'data:a', width: 128, height: 32 };
const sheetB = { id: 'sheetB', dataUrl: 'data:b', width: 128, height: 32 };

const idleAnim = { id: 'a_idle', name: 'idle', spriteSheetId: 'sheetA', frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 2, fps: 4, loop: true };
const runAnim  = { id: 'a_run',  name: 'run',  spriteSheetId: 'sheetB', frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true };
const runAnimSameSheet = { id: 'a_run2', name: 'run', spriteSheetId: 'sheetA', frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 4, fps: 8, loop: true };
const runAnimNullSheet = { id: 'a_run3', name: 'run', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 4, fps: 8, loop: true };

/**
 * Create an EditorRenderer and manually set up a single animated object entry
 * so we can exercise setObjectAnimation without needing a real level.
 */
function makeRendererWithAnimState(spriteSheets = [sheetA, sheetB]) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth',  { value: 800 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  const renderer = new EditorRenderer(container);
  renderer._spriteSheetCatalogue = spriteSheets;

  // Simulate what rebuildObjects does: create a fake animated state entry
  const THREE = require('three');
  const texture = new THREE.Texture();
  texture._url = sheetA.dataUrl;
  const mat = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), mat);

  const state = { mesh, animDef: idleAnim, sheet: sheetA, frame: 0, timeAcc: 0 };
  renderer._objectAnimStates.push(state);
  renderer._objectAnimStateById.set('obj1', state);

  return { renderer, state, mesh };
}

// ── Tests ──

describe('EditorRenderer.setObjectAnimation', () => {
  it('updates animDef and frame when switching to a different animation on the same sheet', () => {
    const { renderer, state } = makeRendererWithAnimState();
    renderer.setObjectAnimation('obj1', runAnimSameSheet);
    expect(state.animDef).toBe(runAnimSameSheet);
    expect(state.frame).toBe(0);
    expect(state.timeAcc).toBe(0);
  });

  it('updates the texture when switching to an animation on a different sprite sheet', () => {
    const { renderer, state, mesh } = makeRendererWithAnimState();
    const oldTexture = mesh.material.map;
    renderer.setObjectAnimation('obj1', runAnim);
    expect(state.animDef).toBe(runAnim);
    expect(state.sheet).toBe(sheetB);
    // The texture must have changed to one loaded from sheetB
    expect(mesh.material.map).not.toBe(oldTexture);
    expect(mesh.material.map.image.src).toBe(sheetB.dataUrl);
  });

  it('falls back to the current sheet when the new animDef has a null spriteSheetId', () => {
    const { renderer, state } = makeRendererWithAnimState();
    renderer.setObjectAnimation('obj1', runAnimNullSheet);
    expect(state.animDef).toBe(runAnimNullSheet);
    // Should keep using the existing sheet, not bail out
    expect(state.sheet).toBe(sheetA);
    expect(state.frame).toBe(0);
  });

  it('silently returns when animDef is null', () => {
    const { renderer, state } = makeRendererWithAnimState();
    const origAnimDef = state.animDef;
    renderer.setObjectAnimation('obj1', null);
    expect(state.animDef).toBe(origAnimDef);
  });

  it('silently returns when id is not found', () => {
    const { renderer } = makeRendererWithAnimState();
    // Should not throw
    renderer.setObjectAnimation('nonexistent', runAnim);
  });

  it('new texture has an image set synchronously (no flicker frame)', () => {
    const { renderer, mesh } = makeRendererWithAnimState();
    renderer.setObjectAnimation('obj1', runAnim);
    // The texture must have an image immediately — not waiting for an async load
    expect(mesh.material.map.image).not.toBeNull();
    expect(mesh.material.map.image).toBeDefined();
  });

  it('caches textures per sprite sheet so repeat switches reuse the same texture', () => {
    const { renderer, mesh } = makeRendererWithAnimState();
    renderer.setObjectAnimation('obj1', runAnim);
    const firstTexture = mesh.material.map;
    // Switch back to idle (sheetA), then back to run (sheetB)
    renderer.setObjectAnimation('obj1', idleAnim);
    renderer.setObjectAnimation('obj1', runAnim);
    expect(mesh.material.map).toBe(firstTexture);
  });
});

// ── EditorRenderer.rebuildObjects — texture pre-warming ───────────────────────

describe('EditorRenderer.rebuildObjects — texture pre-warming', () => {
  /** Player def with idle on sheetA and run on sheetB (two distinct sheets). */
  const multiAnimDef = {
    behaviors: [
      { id: 'idle',       animation: 'idle' },
      { id: 'move_right', animation: 'run'  },
    ],
    animations: [idleAnim, runAnim],
  };

  function makeRenderer() {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth',  { value: 800 });
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    const r = new EditorRenderer(container);
    r._offsetX = 5;
    r._offsetY = 5;
    return r;
  }

  const fakeLevel = {
    objects: [{ id: 'p1', type: 'player', x: 0, y: 0, properties: {} }],
  };

  it('caches idle animation sheet during rebuildObjects', () => {
    const renderer = makeRenderer();
    const objectDefs = new Map([['player', multiAnimDef]]);
    renderer.rebuildObjects(fakeLevel, objectDefs, [sheetA, sheetB]);
    expect(renderer._textureCache.has('sheetA')).toBe(true);
  });

  it('pre-warms texture cache for non-idle animation sheets during rebuildObjects', () => {
    const renderer = makeRenderer();
    const objectDefs = new Map([['player', multiAnimDef]]);
    renderer.rebuildObjects(fakeLevel, objectDefs, [sheetA, sheetB]);
    // sheetB is only used by the run animation — should be cached even before first move
    expect(renderer._textureCache.has('sheetB')).toBe(true);
  });

  it('setObjectAnimation after rebuildObjects reuses the pre-cached texture (no new Image)', () => {
    const renderer = makeRenderer();
    const objectDefs = new Map([['player', multiAnimDef]]);
    renderer.rebuildObjects(fakeLevel, objectDefs, [sheetA, sheetB]);

    // Capture the texture that was pre-warmed for sheetB
    const preWarmedTexture = renderer._textureCache.get('sheetB');
    expect(preWarmedTexture).toBeDefined();

    // Switching to the run animation should reuse the pre-warmed texture, not create a new one
    renderer.setObjectAnimation('p1', runAnim);
    const state = renderer._objectAnimStateById.get('p1');
    expect(state.mesh.material.map).toBe(preWarmedTexture);
  });

  it('pre-warms sheets for objects without a resolvable idle animation', () => {
    // A def that has no idle behavior — so rebuildObjects would create a color mesh.
    // The non-idle animation sheets should still be pre-warmed.
    const noIdleDef = {
      behaviors: [
        { id: 'move_right', animation: 'run' },
      ],
      animations: [runAnim],  // runAnim uses sheetB
    };
    const renderer = makeRenderer();
    const objectDefs = new Map([['player', noIdleDef]]);
    renderer.rebuildObjects(fakeLevel, objectDefs, [sheetA, sheetB]);
    expect(renderer._textureCache.has('sheetB')).toBe(true);
  });
});
