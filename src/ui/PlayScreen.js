import { Level } from '../level/Level.js';
import { createPlayMode } from '../editor/PlayMode.js';
import { EditorRenderer } from '../editor/EditorRenderer.js';
import { injectMenuStyles } from './menuStyles.js';
import { PauseMenuScreen } from './PauseMenuScreen.js';

/**
 * Play screen — loads a level from the store and runs it.
 */
export class PlayScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../level/LevelStore.js').LevelStore} levelStore
   * @param {object} callbacks — { onBack }
   * @param {import('../objects/ObjectStore.js').ObjectStore} [objectStore]
   * @param {object} [options]
   * @param {import('../settings/SettingsStore.js').SettingsStore} [options.settings]
   * @param {import('../input/ActionMap.js').ActionMap} [options.actionMap]
   */
  constructor(container, levelStore, callbacks, objectStore = null, options = {}) {
    this._container = container;
    this._store = levelStore;
    this._callbacks = callbacks;
    this._objectStore = objectStore;
    this._settings = options.settings ?? null;
    this._actionMap = options.actionMap ?? null;
    this._renderer = null;
    this._playMode = null;
    this._rafId = null;
    this._lastTime = 0;
    this._hud = null;
    this._onKeyDown = null;
    this._pauseMenu = null;
    this._paused = false;
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

    // Rebuild placed objects with their configured animations
    const objectDefs = this._objectStore ? this._buildObjectDefsMap() : null;
    this._renderer.rebuildObjects(level, objectDefs);

    this._playMode = createPlayMode(level, this._renderer, objectDefs);

    // HUD with level name + back
    this._hud = document.createElement('div');
    this._hud.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 15;
      font-family: monospace; font-size: 14px; color: #48bfe3;
      background: rgba(15,15,35,0.7); padding: 6px 12px; border-radius: 4px;
    `;
    this._hud.textContent = `Playing: ${data.levelName}  [Esc = pause]`;
    document.body.appendChild(this._hud);

    // Escape toggles pause
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this._togglePause();
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
    if (this._pauseMenu) {
      this._pauseMenu.exit();
      this._pauseMenu = null;
    }
    this._paused = false;
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

  /** Toggle between paused and running states. */
  _togglePause() {
    if (this._paused) {
      this._resume();
    } else {
      this._pause();
    }
  }

  /** Freeze the game and show the pause overlay. */
  _pause() {
    if (this._paused) return;
    this._paused = true;

    // Stop the RAF loop — game state is preserved in memory.
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this._pauseMenu = new PauseMenuScreen(this._container, {
      onResume:   () => this._resume(),
      onMainMenu: () => this._exitToMainMenu(),
    }, {
      settings:  this._settings,
      actionMap: this._actionMap,
    });
    this._pauseMenu.enter();
  }

  /** Hide the pause overlay and resume the game loop. */
  _resume() {
    if (!this._paused) return;
    this._paused = false;

    if (this._pauseMenu) {
      this._pauseMenu.exit();
      this._pauseMenu = null;
    }

    // Reset time so a long pause doesn't cause a huge dt spike.
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  /** Clean up pause UI then delegate to the normal back callback. */
  _exitToMainMenu() {
    if (this._pauseMenu) {
      this._pauseMenu.exit();
      this._pauseMenu = null;
    }
    this._callbacks.onBack();
  }

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (this._playMode) {
      this._playMode.update(dt);
    }
    if (this._renderer) {
      this._renderer.updateObjectAnimations(dt);
      this._renderer.render();
    }
  }

  /** Build a Map<type, GameObject> from the object store for animation lookup. */
  _buildObjectDefsMap() {
    const map = new Map();
    for (const obj of this._objectStore.loadAll()) {
      map.set(obj.type, obj);
    }
    return map;
  }
}

