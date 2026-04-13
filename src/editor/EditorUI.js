import { TILE, TILE_NAMES } from '../level/Level.js';

/**
 * Minimal DOM-based toolbar for the level editor.
 * Created once and attached to a container element.
 */
export class EditorUI {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onSelectTile, onClear, onTogglePlay, onExport, onImport, onUndo, onToggleObjects }
   */
  constructor(container, callbacks) {
    this._callbacks = callbacks;
    this._root = document.createElement('div');
    this._root.id = 'editor-ui';
    this._root.innerHTML = `
      <style>
        #editor-ui {
          position: fixed; top: 0; left: 0; z-index: 10;
          display: flex; gap: 6px; padding: 8px;
          background: rgba(15,15,35,0.85); color: #eee;
          font-family: monospace; font-size: 13px;
          align-items: center; flex-wrap: wrap;
        }
        #editor-ui button, #editor-ui select {
          background: #2a2a4a; color: #eee; border: 1px solid #555;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 3px;
        }
        #editor-ui button:hover { background: #3a3a6a; }
        #editor-ui .sep { width: 1px; height: 22px; background: #555; margin: 0 4px; }
        #editor-ui .mode-label { font-weight: bold; margin-left: 8px; }
        #editor-ui .mode-label.play { color: #48bfe3; }
      </style>
      <label>Tile:
        <select id="tile-select"></select>
      </label>
      <div class="sep"></div>
      <button id="btn-undo" title="Ctrl+Z">Undo</button>
      <button id="btn-clear">Clear</button>
      <div class="sep"></div>
      <button id="btn-play" title="Tab">▶ Play</button>
      <div class="sep"></div>
      <button id="btn-export">Export</button>
      <button id="btn-import">Import</button>
      <div class="sep"></div>
      <button id="btn-objects" title="O">Objects</button>
      <span class="mode-label" id="mode-label">EDIT</span>
    `;
    container.appendChild(this._root);

    // Tile selector
    const sel = this._root.querySelector('#tile-select');
    for (const [value, name] of Object.entries(TILE_NAMES)) {
      if (Number(value) === TILE.EMPTY) continue; // can't paint empty, use right-click
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    sel.value = String(TILE.SOLID);
    sel.addEventListener('change', () => callbacks.onSelectTile(Number(sel.value)));

    // Buttons
    this._root.querySelector('#btn-undo').addEventListener('click', callbacks.onUndo);
    this._root.querySelector('#btn-clear').addEventListener('click', callbacks.onClear);
    this._root.querySelector('#btn-play').addEventListener('click', callbacks.onTogglePlay);
    this._root.querySelector('#btn-export').addEventListener('click', callbacks.onExport);
    this._root.querySelector('#btn-import').addEventListener('click', callbacks.onImport);
    this._root.querySelector('#btn-objects').addEventListener('click', callbacks.onToggleObjects);

    this._modeLabel = this._root.querySelector('#mode-label');
    this._playBtn = this._root.querySelector('#btn-play');
  }

  /** Update mode display. */
  setMode(mode) {
    if (mode === 'play') {
      this._modeLabel.textContent = 'PLAY';
      this._modeLabel.classList.add('play');
      this._playBtn.textContent = '✎ Edit';
      this._root.style.display = 'flex';
    } else {
      this._modeLabel.textContent = 'EDIT';
      this._modeLabel.classList.remove('play');
      this._playBtn.textContent = '▶ Play';
      this._root.style.display = 'flex';
    }
  }

  dispose() {
    this._root.remove();
  }
}
