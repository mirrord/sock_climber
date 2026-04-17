import * as THREE from 'three';
import { Level } from '../level/Level.js';
import { PlayMode } from '../editor/PlayMode.js';
import { EditorRenderer } from '../editor/EditorRenderer.js';
import { injectMenuStyles } from './menuStyles.js';

/**
 * Play screen — loads a level from the store and runs it.
 */
export class PlayScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../level/LevelStore.js').LevelStore} levelStore
   * @param {object} callbacks — { onBack }
   */
  constructor(container, levelStore, callbacks) {
    this._container = container;
    this._store = levelStore;
    this._callbacks = callbacks;
    this._renderer = null;
    this._playMode = null;
    this._rafId = null;
    this._lastTime = 0;
    this._hud = null;
    this._onKeyDown = null;
    injectMenuStyles();
  }

  /** @param {{levelName: string}} data */
  enter(data) {
    const level = this._store.load(data.levelName);
    if (!level) {
      this._callbacks.onBack();
      return;
    }

    // Renderer
    this._renderer = new EditorRenderer(this._container);
    this._renderer.rebuildFromLevel(level);
    this._renderer.hideHover();

    // Player
    this._playMode = new PlayMode(
      level,
      this._renderer.scene,
      this._renderer.camera
    );

    // HUD with level name + back
    this._hud = document.createElement('div');
    this._hud.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 15;
      font-family: monospace; font-size: 14px; color: #48bfe3;
      background: rgba(15,15,35,0.7); padding: 6px 12px; border-radius: 4px;
    `;
    this._hud.textContent = `Playing: ${data.levelName}  [Esc = menu]`;
    document.body.appendChild(this._hud);

    // Escape to go back
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this._callbacks.onBack();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Start loop
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  exit() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._playMode) {
      this._playMode.dispose();
      this._playMode = null;
    }
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }
    if (this._hud) {
      this._hud.remove();
      this._hud = null;
    }
  }

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (this._playMode) {
      this._playMode.update(dt);
    }
    if (this._renderer) {
      this._renderer.render();
    }
  }
}
