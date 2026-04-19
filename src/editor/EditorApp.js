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
  /**
   * @param {HTMLElement} container
   * @param {import('../objects/ObjectStore.js').ObjectStore} [objectStore]
   */
  constructor(container, objectStore = null) {
    this._container = container;
    this._editor = new LevelEditor(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    this._renderer = new EditorRenderer(container);
    this._playMode = null;
    this._rafId = null;
    this._lastTime = 0;

    // Object editor — hydrate library from persisted store if provided
    this._objectEditor = new ObjectEditor();
    if (objectStore) {
      for (const obj of objectStore.loadAll()) {
        this._objectEditor.library.push(obj);
      }
    }
    /**
     * When non-null, next canvas click places this object type.
     * @type {import('../objects/GameObject.js').GameObject|null}
     */
    this._pendingPlacement = null;

    this._objectEditorUI = new ObjectEditorUI(document.body, this._objectEditor, {
      onSelectForPlacement: (obj) => this._startPlacement(obj),
    });

    // Background layers panel
    this._bgPanel = this._buildBgPanel();
    this._bgPanelVisible = false;

    // UI
    this._ui = new EditorUI(document.body, {
      onTogglePlay: () => this._togglePlay(),
      onExport: () => this._exportLevel(),
      onImport: () => this._importLevel(),
      onToggleObjects: () => this._objectEditorUI.toggle(),
      onResize: (w, h) => {
        this._editor.resize(w, h);
        this._renderer.rebuildFromLevel(this._editor.level);
      },
      onBackgrounds: () => this._toggleBgPanel(),
    }, { initialWidth: DEFAULT_WIDTH, initialHeight: DEFAULT_HEIGHT });

    // Initial render
    this._renderer.rebuildFromLevel(this._editor.level);
    this._renderer.rebuildObjects(this._editor.level);

    // Input bindings
    this._bindEditorInput();
    this._bindKeyboard();

    // Start loop
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  // ---- Edit / Play toggle ----

  _togglePlay() {
    // Cancel any active placement when switching mode
    this._cancelPlacement();
    this._editor.toggleMode();
    this._ui.setMode(this._editor.mode);

    if (this._editor.mode === 'play') {
      // Rebuild objects first so their meshes exist before PlayMode references them
      const objectDefs = this._buildObjectDefsMap();
      this._renderer.rebuildObjects(this._editor.level, objectDefs);
      this._renderer.hideHover();

      const playerObj = this._editor.level.findObjectByType('player');
      const playerMesh = playerObj ? this._renderer.getObjectMesh(playerObj.id) : null;
      const playerDef = objectDefs.get('player') ?? null;
      const onAnimationChange = (playerObj && playerDef)
        ? (animDef) => this._renderer.setObjectAnimation(playerObj.id, animDef)
        : null;

      this._playMode = new PlayMode(
        this._editor.level,
        this._renderer.scene,
        this._renderer.camera,
        { playerMesh, playerDef, onAnimationChange }
      );
    } else {
      if (this._playMode) {
        this._playMode.dispose();
        this._playMode = null;
      }
      this._renderer.rebuildFromLevel(this._editor.level);
      this._renderer.rebuildObjects(this._editor.level);
    }
  }

  // ---- Main loop ----

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (this._playMode && this._editor.mode === 'play') {
      this._playMode.update(dt);
      this._renderer.updateObjectAnimations(dt);
    }

    this._renderer.render();
  }

  // ---- Editor input (mouse) ----

  _bindEditorInput() {
    const canvas = this._renderer.renderer.domElement;

    canvas.addEventListener('mousemove', (e) => {
      if (this._editor.mode !== 'edit') return;
      const grid = this._renderer.screenToGrid(e.clientX, e.clientY);
      if (this._pendingPlacement) {
        this._renderer.showPendingHover(grid.x, grid.y);
      } else {
        this._renderer.hidePendingHover();
        this._renderer.showHover(grid.x, grid.y);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this._renderer.hideHover();
      this._renderer.hidePendingHover();
    });

    canvas.addEventListener('click', (e) => {
      if (this._editor.mode !== 'edit') return;
      if (!this._pendingPlacement) return;
      const grid = this._renderer.screenToGrid(e.clientX, e.clientY);
      this._editor.placeObject(this._pendingPlacement.type, grid.x, grid.y);
      this._renderer.rebuildObjects(this._editor.level);
      // Keep placement mode active (holding type) until user cancels
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._editor.mode !== 'edit') return;
      if (this._pendingPlacement) {
        // Right-click cancels placement mode
        this._cancelPlacement();
        return;
      }
      // Right-click on an existing object removes it
      const grid = this._renderer.screenToGrid(e.clientX, e.clientY);
      const obj = this._editor.getObjectAt(grid.x, grid.y);
      if (obj) {
        this._editor.removeObject(obj.id);
        this._renderer.rebuildObjects(this._editor.level);
      }
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._renderer.zoomCamera(e.deltaY > 0 ? -1 : 1);
    }, { passive: false });
  }

  /**
   * Enter placement mode for the given object template.
   * Cursor changes and next left-click places the object.
   * @param {import('../objects/GameObject.js').GameObject} obj
   */
  _startPlacement(obj) {
    this._pendingPlacement = obj;
    this._renderer.renderer.domElement.style.cursor = 'crosshair';
  }

  /** Cancel placement mode without placing anything. */
  _cancelPlacement() {
    if (!this._pendingPlacement) return;
    this._pendingPlacement = null;
    this._renderer.hidePendingHover();
    this._renderer.renderer.domElement.style.cursor = '';
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Escape cancels pending placement
      if (e.code === 'Escape' && this._pendingPlacement) {
        this._cancelPlacement();
        return;
      }

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
      }
    });
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
          this._ui.setSize(this._editor.level.width, this._editor.level.height);
          this._renderer.rebuildFromLevel(this._editor.level);
          if (this._bgPanelVisible) this._renderBgPanel();
        } catch (_) {
          // Ignore invalid files
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ---- Background layers panel ----

  _buildBgPanel() {
    const root = document.createElement('div');
    root.id = 'bg-layer-panel';
    root.innerHTML = `
      <style>
        #bg-layer-panel {
          position: fixed; top: 0; left: 0; z-index: 20;
          width: 300px; height: 100vh; overflow-y: auto;
          background: rgba(15,15,35,0.95); color: #eee;
          font-family: monospace; font-size: 12px;
          padding: 10px; box-sizing: border-box;
          transform: translateX(-100%); transition: transform 0.2s;
          border-right: 1px solid #555;
        }
        #bg-layer-panel.visible { transform: translateX(0); }
        #bg-layer-panel h3 { margin: 0 0 10px; color: #48bfe3; font-size: 14px; }
        #bg-layer-panel label { display: block; margin: 4px 0 2px; color: #8899bb; font-size: 11px; }
        #bg-layer-panel input[type=text], #bg-layer-panel input[type=number] {
          width: 100%; box-sizing: border-box;
          background: #1a1a3a; color: #eee; border: 1px solid #444;
          padding: 4px 6px; margin-bottom: 4px; font-family: inherit; font-size: 12px;
        }
        #bg-layer-panel input[type=range] { width: 100%; margin: 2px 0; }
        #bg-layer-panel button {
          background: #2a2a5a; color: #eee; border: 1px solid #555;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
          border-radius: 3px; margin: 2px 2px;
        }
        #bg-layer-panel button:hover { background: #3a3a7a; }
        #bg-layer-panel button.danger { border-color: #a33; }
        #bg-layer-panel button.danger:hover { background: #533; }
        #bg-layer-panel .close-btn {
          display: block; width: 100%; padding: 6px 0; margin-bottom: 10px;
          background: none; border: 1px solid #555; color: #888;
          cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 4px; text-align: center;
        }
        #bg-layer-panel .close-btn:hover { color: #eee; border-color: #aaa; }
        #bg-layer-panel .layer-card {
          background: #1a1a3a; border: 1px solid #444;
          padding: 8px; margin: 6px 0; border-radius: 3px;
        }
        #bg-layer-panel .layer-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 6px;
        }
        #bg-layer-panel .layer-title { color: #aac; font-size: 12px; }
        #bg-layer-panel .parallax-row {
          display: flex; align-items: center; gap: 6px;
        }
        #bg-layer-panel .parallax-row input[type=range] { flex: 1; }
        #bg-layer-panel .parallax-val { min-width: 32px; color: #aac; text-align: right; }
        #bg-layer-panel .add-btn {
          display: block; width: 100%; margin-top: 10px;
          padding: 8px 0; background: #2a2a5a; color: #48bfe3;
          border: 1px dashed #48bfe3; cursor: pointer;
          font-family: inherit; font-size: 13px; border-radius: 4px; text-align: center;
        }
        #bg-layer-panel .add-btn:hover { background: #3a3a7a; }
        #bg-layer-panel .empty-msg { color: #556; font-style: italic; text-align: center; padding: 20px 0; }
      </style>
      <div id="bg-content"></div>
    `;
    document.body.appendChild(root);
    this._bgContent = root.querySelector('#bg-content');
    return root;
  }

  _toggleBgPanel() {
    this._bgPanelVisible = !this._bgPanelVisible;
    this._bgPanel.classList.toggle('visible', this._bgPanelVisible);
    if (this._bgPanelVisible) this._renderBgPanel();
  }

  _renderBgPanel() {
    const layers = this._editor.level.backgroundLayers;
    this._bgContent.innerHTML = '';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', () => {
      this._bgPanelVisible = false;
      this._bgPanel.classList.remove('visible');
    });
    this._bgContent.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.textContent = 'Background Layers';
    this._bgContent.appendChild(title);

    if (layers.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'empty-msg';
      msg.textContent = 'No background layers yet.';
      this._bgContent.appendChild(msg);
    }

    layers.forEach((layer, i) => {
      const card = document.createElement('div');
      card.className = 'layer-card';

      // Header
      const header = document.createElement('div');
      header.className = 'layer-header';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'layer-title';
      titleSpan.textContent = `Layer ${i + 1}`;
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = '✕ Remove';
      delBtn.addEventListener('click', () => {
        this._editor.removeBackgroundLayer(i);
        this._renderBgPanel();
      });
      header.appendChild(titleSpan);
      header.appendChild(delBtn);
      card.appendChild(header);

      // URL input
      const urlLabel = document.createElement('label');
      urlLabel.textContent = 'Image URL / path:';
      card.appendChild(urlLabel);
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.value = layer.url;
      urlInput.placeholder = 'e.g. assets/sky.png';
      urlInput.addEventListener('change', () => {
        this._editor.updateBackgroundLayer(i, urlInput.value, layer.parallax);
      });
      card.appendChild(urlInput);

      // Parallax slider
      const pxLabel = document.createElement('label');
      pxLabel.textContent = 'Parallax (0 = fixed, 1 = full scroll):';
      card.appendChild(pxLabel);
      const pxRow = document.createElement('div');
      pxRow.className = 'parallax-row';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(layer.parallax);
      const valDisplay = document.createElement('span');
      valDisplay.className = 'parallax-val';
      valDisplay.textContent = layer.parallax.toFixed(2);
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        valDisplay.textContent = val.toFixed(2);
        this._editor.updateBackgroundLayer(i, layer.url, val);
      });
      pxRow.appendChild(slider);
      pxRow.appendChild(valDisplay);
      card.appendChild(pxRow);

      this._bgContent.appendChild(card);
    });

    // Add layer button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ Add Layer';
    addBtn.addEventListener('click', () => {
      this._editor.addBackgroundLayer('', 0.5);
      this._renderBgPanel();
    });
    this._bgContent.appendChild(addBtn);
  }

  /** Build a Map<type, GameObject> from the object editor library for animation lookup. */
  _buildObjectDefsMap() {
    const map = new Map();
    for (const obj of this._objectEditor.library) {
      map.set(obj.type, obj);
    }
    return map;
  }

  dispose() {
    cancelAnimationFrame(this._rafId);
    if (this._playMode) this._playMode.dispose();
    this._objectEditorUI.dispose();
    this._bgPanel.remove();
    this._ui.dispose();
    this._renderer.dispose();
  }
}
