import { TILE } from '../level/Level.js';
import { LevelEditor } from './LevelEditor.js';
import { EditorRenderer } from './EditorRenderer.js';
import { EditorUI } from './EditorUI.js';
import { PlayMode } from './PlayMode.js';
import { ObjectEditor } from '../objects/ObjectEditor.js';
import { ObjectEditorUI } from './ObjectEditorUI.js';

const DEFAULT_WIDTH = 30;
const DEFAULT_HEIGHT = 20;

/**
 * Top-level controller that wires editor logic, rendering, UI, and play mode.
 */
export class EditorApp {
  /** @param {HTMLElement} container */
  constructor(container) {
    this._container = container;
    this._editor = new LevelEditor(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    this._renderer = new EditorRenderer(container);
    this._playMode = null;
    this._rafId = null;
    this._lastTime = 0;
    this._isPainting = false;
    this._isErasing = false;

    // Object editor
    this._objectEditor = new ObjectEditor();
    this._objectEditorUI = new ObjectEditorUI(document.body, this._objectEditor);

    // UI
    this._ui = new EditorUI(document.body, {
      onSelectTile: (type) => this._editor.selectTile(type),
      onClear: () => { this._editor.clearLevel(); this._refresh(); },
      onTogglePlay: () => this._togglePlay(),
      onExport: () => this._exportLevel(),
      onImport: () => this._importLevel(),
      onUndo: () => { this._editor.undo(); this._refresh(); },
      onToggleObjects: () => this._objectEditorUI.toggle(),
    });

    // Initial render
    this._renderer.rebuildFromLevel(this._editor.level);

    // Input bindings
    this._bindEditorInput();
    this._bindKeyboard();

    // Start loop
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  // ---- Edit / Play toggle ----

  _togglePlay() {
    this._editor.toggleMode();
    this._ui.setMode(this._editor.mode);

    if (this._editor.mode === 'play') {
      this._playMode = new PlayMode(
        this._editor.level,
        this._renderer.scene,
        this._renderer.camera
      );
      this._renderer.hideHover();
    } else {
      if (this._playMode) {
        this._playMode.dispose();
        this._playMode = null;
      }
      // Reset camera to show full level
      this._renderer.rebuildFromLevel(this._editor.level);
    }
  }

  // ---- Main loop ----

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((now - this._lastTime) / 1000, 0.1); // cap dt
    this._lastTime = now;

    if (this._playMode && this._editor.mode === 'play') {
      this._playMode.update(dt);
    }

    this._renderer.render();
  }

  // ---- Editor input (mouse) ----

  _bindEditorInput() {
    const canvas = this._renderer.renderer.domElement;

    canvas.addEventListener('mousedown', (e) => {
      if (this._editor.mode !== 'edit') return;
      if (e.button === 0) {
        this._isPainting = true;
        this._paintAt(e.clientX, e.clientY);
      } else if (e.button === 2) {
        this._isErasing = true;
        this._eraseAt(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this._editor.mode !== 'edit') return;
      const grid = this._renderer.screenToGrid(e.clientX, e.clientY);
      this._renderer.showHover(grid.x, grid.y);

      if (this._isPainting) this._paintAt(e.clientX, e.clientY);
      if (this._isErasing) this._eraseAt(e.clientX, e.clientY);
    });

    canvas.addEventListener('mouseup', () => {
      this._isPainting = false;
      this._isErasing = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this._isPainting = false;
      this._isErasing = false;
      this._renderer.hideHover();
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._renderer.zoomCamera(e.deltaY > 0 ? -1 : 1);
    }, { passive: false });
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Tab toggles play/edit
      if (e.code === 'Tab') {
        e.preventDefault();
        this._togglePlay();
        return;
      }

      if (this._editor.mode !== 'edit') return;

      // O toggles object editor panel
      if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) {
        this._objectEditorUI.toggle();
        return;
      }

      // Ctrl+Z undo
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        this._editor.undo();
        this._refresh();
      }
    });
  }

  _paintAt(sx, sy) {
    const grid = this._renderer.screenToGrid(sx, sy);
    this._editor.paint(grid.x, grid.y);
    this._refresh();
  }

  _eraseAt(sx, sy) {
    const grid = this._renderer.screenToGrid(sx, sy);
    this._editor.erase(grid.x, grid.y);
    this._refresh();
  }

  _refresh() {
    this._renderer.updateTiles(this._editor.level);
  }

  // ---- Export / Import ----

  _exportLevel() {
    const json = this._editor.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'level.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  _importLevel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this._editor.importJSON(/** @type {string} */ (reader.result));
          this._renderer.rebuildFromLevel(this._editor.level);
        } catch (_) {
          // Ignore invalid files
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    if (this._playMode) this._playMode.dispose();
    this._objectEditorUI.dispose();
    this._ui.dispose();
    this._renderer.dispose();
  }
}
