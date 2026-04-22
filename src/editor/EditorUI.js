/**
 * Minimal DOM-based toolbar for the level editor.
 * Created once and attached to a container element.
 */
export class EditorUI {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onTogglePlay, onExport, onImport, onToggleObjects, onToggleBehaviors, onResize, onBackgrounds }
   * @param {object} [options] — { initialWidth, initialHeight }
   */
  constructor(container, callbacks, options = {}) {
    this._callbacks = callbacks;
    this._root = document.createElement('div');
    this._root.id = 'editor-ui';

    const w = options.initialWidth ?? 30;
    const h = options.initialHeight ?? 20;

    this._root.innerHTML = `
      <style>
        #editor-ui {
          position: fixed; top: 0; left: 0; z-index: 10;
          display: flex; gap: 6px; padding: 8px;
          background: rgba(15,15,35,0.85); color: #eee;
          font-family: monospace; font-size: 13px;
          align-items: center; flex-wrap: wrap;
        }
        #editor-ui button, #editor-ui select, #editor-ui input[type=number] {
          background: #2a2a4a; color: #eee; border: 1px solid #555;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 3px;
        }
        #editor-ui input[type=number] { width: 52px; padding: 4px 6px; cursor: text; }
        #editor-ui button:hover { background: #3a3a6a; }
        #editor-ui .sep { width: 1px; height: 22px; background: #555; margin: 0 4px; }
        #editor-ui .size-label { color: #aac; }
        #editor-ui .mode-label { font-weight: bold; margin-left: 8px; }
        #editor-ui .mode-label.play { color: #48bfe3; }
      </style>
      <span class="size-label">Size:</span>
      <input id="inp-w" type="number" min="5" max="500" value="${w}" title="Width (columns)">
      <span class="size-label">×</span>
      <input id="inp-h" type="number" min="5" max="500" value="${h}" title="Height (rows)">
      <button id="btn-resize">Apply</button>
      <div class="sep"></div>
      <button id="btn-backgrounds">Backgrounds</button>
      <div class="sep"></div>
      <button id="btn-play" title="Tab">▶ Play</button>
      <div class="sep"></div>
      <button id="btn-export">Export</button>
      <button id="btn-import">Import</button>
      <div class="sep"></div>
      <button id="btn-objects" title="O">Objects</button>
      <button id="btn-behaviors" title="B">Behaviors</button>
      <span class="mode-label" id="mode-label">EDIT</span>
    `;
    container.appendChild(this._root);

    this._wInput = this._root.querySelector('#inp-w');
    this._hInput = this._root.querySelector('#inp-h');

    this._root.querySelector('#btn-resize').addEventListener('click', () => {
      const w = Math.max(5, Math.min(500, parseInt(this._wInput.value, 10) || 30));
      const h = Math.max(5, Math.min(500, parseInt(this._hInput.value, 10) || 20));
      this._wInput.value = String(w);
      this._hInput.value = String(h);
      callbacks.onResize(w, h);
    });

    this._root.querySelector('#btn-backgrounds').addEventListener('click', callbacks.onBackgrounds);
    this._root.querySelector('#btn-play').addEventListener('click', callbacks.onTogglePlay);
    this._root.querySelector('#btn-export').addEventListener('click', callbacks.onExport);
    this._root.querySelector('#btn-import').addEventListener('click', callbacks.onImport);
    this._root.querySelector('#btn-objects').addEventListener('click', callbacks.onToggleObjects);
    this._root.querySelector('#btn-behaviors').addEventListener('click', callbacks.onToggleBehaviors);

    this._modeLabel = this._root.querySelector('#mode-label');
    this._playBtn = this._root.querySelector('#btn-play');
  }

  /** Sync size inputs after a programmatic resize (e.g. import). */
  setSize(w, h) {
    this._wInput.value = String(w);
    this._hInput.value = String(h);
  }

  /** Update mode display. */
  setMode(mode) {
    if (mode === 'play') {
      this._modeLabel.textContent = 'PLAY';
      this._modeLabel.classList.add('play');
      this._playBtn.textContent = '✎ Edit';
    } else {
      this._modeLabel.textContent = 'EDIT';
      this._modeLabel.classList.remove('play');
      this._playBtn.textContent = '▶ Play';
    }
  }

  /** Hide the toolbar (e.g. during play-test). */
  hide() {
    this._root.style.display = 'none';
  }

  /** Restore the toolbar after hide(). */
  show() {
    this._root.style.display = '';
  }

  dispose() {
    this._root.remove();
  }
}
