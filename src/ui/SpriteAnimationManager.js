import { advanceAnimFrame, calcFrameSourceRect } from '../editor/animUtils.js';

const SAM_STYLE_ID = 'sock_climber-sam-styles';
let _animIdCounter = 1;

function injectSAMStyles() {
  if (document.getElementById(SAM_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = SAM_STYLE_ID;
  s.textContent = `
    .sam-root {
      width: 100%; height: 100%; display: flex; flex-direction: column;
      font-family: monospace; font-size: 12px; color: #eee;
      overflow: hidden; box-sizing: border-box;
      background: #0a0a1a;
    }
    .sam-toolbar {
      display: flex; gap: 8px; padding: 10px 14px;
      background: #12122a; border-bottom: 1px solid #333; flex-shrink: 0;
      flex-wrap: wrap; align-items: center;
    }
    .sam-toolbar h4 {
      margin: 0; flex: 1; color: #48bfe3; font-size: 13px;
    }
    .sam-import-btn, .sam-new-anim-btn {
      background: #2a2a5a; color: #eee; border: 1px solid #555;
      padding: 5px 12px; cursor: pointer; font-family: inherit; font-size: 12px;
      border-radius: 3px;
    }
    .sam-import-btn:hover { background: #3a3a7a; border-color: #aaa; }
    .sam-new-anim-btn {
      background: none; color: #48bfe3; border-color: #48bfe3;
    }
    .sam-new-anim-btn:hover { background: #1a2a4a; }

    .sam-drop-zone {
      margin: 10px 14px; padding: 14px; text-align: center;
      border: 2px dashed #334; border-radius: 6px; color: #556;
      font-size: 11px; cursor: pointer; transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .sam-drop-zone.drag-over { border-color: #48bfe3; color: #48bfe3; }
    .sam-drop-zone:hover { border-color: #556; color: #778; }

    .sam-empty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: #445; font-style: italic; font-size: 13px;
    }

    .sam-anim-list {
      flex: 1; overflow-y: auto; padding: 10px 14px;
      display: flex; flex-wrap: wrap; gap: 12px; align-content: flex-start;
    }

    .sam-anim-card {
      background: #12122a; border: 1px solid #444; border-radius: 6px;
      width: 170px; display: flex; flex-direction: column; overflow: hidden;
    }
    .sam-anim-card:hover { border-color: #48bfe3; }

    .sam-anim-preview {
      width: 100%; height: 90px; display: block;
      background: #0a0a1a; object-fit: contain;
      image-rendering: pixelated;
    }

    .sam-anim-info {
      padding: 6px 8px; flex: 1;
    }
    .sam-anim-name {
      font-weight: bold; color: #cce; margin-bottom: 3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sam-anim-meta { color: #667; font-size: 10px; }

    .sam-anim-actions {
      display: flex; border-top: 1px solid #333;
    }
    .sam-anim-edit, .sam-anim-remove {
      flex: 1; background: none; border: none; color: #888;
      padding: 5px 4px; cursor: pointer; font-family: inherit; font-size: 11px;
    }
    .sam-anim-edit:hover { color: #48bfe3; background: #1a2a4a; }
    .sam-anim-remove:hover { color: #e66; background: #3a1a1a; }
    .sam-anim-edit { border-right: 1px solid #333; }

    /* Config panel — overlay */
    .sam-config-overlay {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.65); z-index: 10;
    }
    .sam-config-panel {
      background: #12122a; border: 1px solid #48bfe3; border-radius: 8px;
      width: 340px; max-height: 90%; overflow-y: auto;
      padding: 18px 20px; box-sizing: border-box;
      display: flex; flex-direction: column; gap: 8px;
    }
    .sam-config-title {
      margin: 0 0 8px; color: #48bfe3; font-size: 14px;
    }
    .sam-field-row {
      display: flex; flex-direction: column; gap: 3px;
    }
    .sam-field-label { color: #8899bb; font-size: 11px; }
    .sam-config-panel input[type="text"],
    .sam-config-panel input[type="number"],
    .sam-config-panel select {
      width: 100%; box-sizing: border-box;
      background: #1a1a3a; color: #eee; border: 1px solid #444;
      padding: 5px 7px; font-family: inherit; font-size: 12px;
      border-radius: 3px;
    }
    .sam-config-panel input[type="checkbox"] {
      width: 16px; height: 16px; cursor: pointer;
    }
    .sam-config-buttons {
      display: flex; gap: 8px; margin-top: 6px;
    }
    .sam-config-confirm {
      flex: 1; background: #1a3a6a; color: #48bfe3;
      border: 1px solid #48bfe3; padding: 7px 0; cursor: pointer;
      font-family: inherit; font-size: 12px; border-radius: 3px;
    }
    .sam-config-confirm:hover { background: #2a4a8a; }
    .sam-config-cancel {
      background: none; color: #888; border: 1px solid #555;
      padding: 7px 14px; cursor: pointer; font-family: inherit; font-size: 12px;
      border-radius: 3px;
    }
    .sam-config-cancel:hover { color: #eee; border-color: #aaa; }

    /* Enlarged animation preview */
    .sam-enlarged-preview {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: #12122a; border: 1px solid #48bfe3; border-radius: 8px;
      padding: 14px 16px; display: flex; flex-direction: column;
      align-items: center; gap: 10px; z-index: 200;
      box-shadow: 0 8px 32px rgba(0,0,0,0.75);
    }
    .sam-enlarged-title {
      color: #48bfe3; font-size: 13px; font-weight: bold; align-self: flex-start;
    }
    .sam-enlarged-canvas {
      display: block; width: 320px; height: 200px;
      background: #0a0a1a; image-rendering: pixelated;
    }
    .sam-enlarged-close {
      background: none; border: 1px solid #555; color: #888;
      padding: 4px 14px; cursor: pointer; font-family: inherit; font-size: 12px;
      border-radius: 3px; align-self: flex-end;
    }
    .sam-enlarged-close:hover { color: #eee; border-color: #aaa; }
  `;
  document.head.appendChild(s);
}

/**
 * Sprite Animation Manager widget for the object editor center panel.
 * Displays previews of all animations for an object, allows sprite sheet
 * import (button + drag-and-drop), and provides a configuration panel
 * for creating and editing animations from a sprite sheet.
 */
export class SpriteAnimationManager {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   * @param {function(): Array<object>} callbacks.getAnimations
   * @param {function(object): void} callbacks.addAnimation
   * @param {function(string): void} callbacks.removeAnimation
   * @param {function(string, object): void} callbacks.updateAnimation
   * @param {function(): Array<object>} callbacks.getSpriteSheets
   * @param {function(object): void} callbacks.addSpriteSheet
   */
  constructor(container, callbacks) {
    this._container = container;
    this._callbacks = callbacks;
    this._root = null;
    /** @type {null|'new'|'edit'} */
    this._configMode = null;
    this._editTargetId = null;
    this._configDraft = this._defaultDraft();
    /** @type {string|null} */
    this._selectedAnimId = null;
    /** @type {number|null} */
    this._previewRafId = null;
  }

  render() {
    this._cancelPreviewLoop();
    this._container.innerHTML = '';
    injectSAMStyles();

    this._root = document.createElement('div');
    this._root.className = 'sam-root';
    this._root.style.position = 'relative';

    this._buildToolbar();
    this._buildDropZone();
    this._buildAnimList();

    if (this._configMode) {
      this._buildConfigOverlay();
    }

    if (this._selectedAnimId) {
      const anims = this._callbacks.getAnimations();
      const anim = anims.find((a) => a.id === this._selectedAnimId);
      if (anim) this._buildEnlargedPreview(anim);
    }

    this._container.appendChild(this._root);
  }

  // ---- Private: sections ----

  _buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'sam-toolbar';

    const title = document.createElement('h4');
    title.textContent = 'Sprite Animations';
    bar.appendChild(title);

    const importBtn = document.createElement('button');
    importBtn.className = 'sam-import-btn';
    importBtn.textContent = '↑ Import Sprite Sheet';
    importBtn.addEventListener('click', () => this._triggerImport());
    bar.appendChild(importBtn);

    const newBtn = document.createElement('button');
    newBtn.className = 'sam-new-anim-btn';
    newBtn.textContent = '+ New Animation';
    newBtn.addEventListener('click', () => {
      this._configMode = 'new';
      this._configDraft = this._defaultDraft();
      this.render();
    });
    bar.appendChild(newBtn);

    this._root.appendChild(bar);
  }

  _buildDropZone() {
    const zone = document.createElement('div');
    zone.className = 'sam-drop-zone';
    zone.textContent = 'Drop sprite sheet image here to import';

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) this._handleImageFile(file);
    });
    zone.addEventListener('click', () => this._triggerImport());

    this._root.appendChild(zone);
  }

  _buildAnimList() {
    const anims = this._callbacks.getAnimations();

    if (anims.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sam-empty';
      empty.textContent = 'No animations yet. Import a sprite sheet and add one.';
      this._root.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'sam-anim-list';
    for (const anim of anims) {
      list.appendChild(this._buildAnimCard(anim));
    }
    this._root.appendChild(list);
  }

  _buildAnimCard(anim) {
    const card = document.createElement('div');
    card.className = 'sam-anim-card';
    card.dataset.animId = anim.id;

    // Preview canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'sam-anim-preview';
    canvas.width = 170;
    canvas.height = 90;
    card.appendChild(canvas);
    this._drawPreview(canvas, anim);

    // Info
    const info = document.createElement('div');
    info.className = 'sam-anim-info';

    const nameLine = document.createElement('div');
    nameLine.className = 'sam-anim-name';
    nameLine.textContent = anim.name || '(unnamed)';
    info.appendChild(nameLine);

    const meta = document.createElement('div');
    meta.className = 'sam-anim-meta';
    meta.textContent =
      `${anim.frameCount}fr @ ${anim.fps}fps  ` +
      `${anim.frameWidth}×${anim.frameHeight}px  ` +
      (anim.loop ? 'loop' : 'once');
    info.appendChild(meta);
    card.appendChild(info);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'sam-anim-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'sam-anim-edit';
    editBtn.textContent = '⚙ Edit';
    editBtn.addEventListener('click', () => {
      this._configMode = 'edit';
      this._editTargetId = anim.id;
      this._configDraft = { ...anim };
      this.render();
    });
    actions.appendChild(editBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'sam-anim-remove';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => {
      this._callbacks.removeAnimation(anim.id);
      this.render();
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);

    card.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.sam-anim-actions')) return;
      this._selectedAnimId = anim.id;
      this.render();
    });

    return card;
  }

  _buildEnlargedPreview(anim) {
    const overlay = document.createElement('div');
    overlay.className = 'sam-enlarged-preview';

    const title = document.createElement('div');
    title.className = 'sam-enlarged-title';
    title.textContent = anim.name || '(unnamed)';
    overlay.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.className = 'sam-enlarged-canvas';
    canvas.width = 320;
    canvas.height = 200;
    overlay.appendChild(canvas);
    this._startPreviewLoop(canvas, anim);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sam-enlarged-close';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._selectedAnimId = null;
      this.render();
    });
    overlay.appendChild(closeBtn);

    this._root.appendChild(overlay);
  }

  _startPreviewLoop(canvas, anim) {
    const sheets = this._callbacks.getSpriteSheets();
    const sheet = sheets.find((s) => s.id === anim.spriteSheetId);
    if (!sheet) {
      this._drawPreview(canvas, anim);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      let animState = { frame: 0, timeAcc: 0, animDef: anim };
      let lastTimestamp = null;
      const tick = (timestamp) => {
        const dt = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;
        if (dt > 0) {
          const next = advanceAnimFrame(animState, dt);
          animState = { ...animState, frame: next.frame, timeAcc: next.timeAcc };
        }
        const { sx: fx, sy: fy } = calcFrameSourceRect(anim, sheet, animState.frame);
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, fx, fy, anim.frameWidth, anim.frameHeight, 0, 0, canvas.width, canvas.height);
        }
        this._previewRafId = requestAnimationFrame(tick);
      };
      this._previewRafId = requestAnimationFrame(tick);
    };
    img.src = sheet.dataUrl;
  }

  _cancelPreviewLoop() {
    if (this._previewRafId != null) {
      cancelAnimationFrame(this._previewRafId);
      this._previewRafId = null;
    }
  }

  _buildConfigOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'sam-config-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeConfig();
    });
    overlay.appendChild(this._buildConfigPanel());
    this._root.appendChild(overlay);
  }

  _buildConfigPanel() {
    const d = this._configDraft;
    const isEdit = this._configMode === 'edit';

    const panel = document.createElement('div');
    panel.className = 'sam-config-panel';

    const title = document.createElement('h3');
    title.className = 'sam-config-title';
    title.textContent = isEdit ? 'Edit Animation' : 'New Animation';
    panel.appendChild(title);

    // Sprite sheet selector
    const sheets = this._callbacks.getSpriteSheets();
    const sheetRow = this._makeFieldRow('Sprite Sheet', () => {
      const sel = document.createElement('select');
      sel.dataset.field = 'spriteSheetId';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— none —';
      sel.appendChild(none);
      for (const sh of sheets) {
        const opt = document.createElement('option');
        opt.value = sh.id;
        opt.textContent = sh.name;
        if (sh.id === d.spriteSheetId) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => { d.spriteSheetId = sel.value || null; });
      return sel;
    });
    panel.appendChild(sheetRow);

    // Name
    panel.appendChild(this._makeTextField('Name', 'name', d.name, (v) => { d.name = v; }));

    // Numeric fields
    const numFields = [
      { label: 'Frame Width (px)', field: 'frameWidth' },
      { label: 'Frame Height (px)', field: 'frameHeight' },
      { label: 'Frame Start', field: 'frameStart' },
      { label: 'Frame Count', field: 'frameCount' },
      { label: 'FPS', field: 'fps' },
    ];
    for (const { label, field } of numFields) {
      panel.appendChild(this._makeNumericField(label, field, d[field], (v) => { d[field] = v; }));
    }

    // Loop checkbox
    const loopRow = this._makeFieldRow('Loop', () => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.field = 'loop';
      cb.checked = d.loop;
      cb.addEventListener('change', () => { d.loop = cb.checked; });
      return cb;
    });
    panel.appendChild(loopRow);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'sam-config-buttons';

    const confirm = document.createElement('button');
    confirm.className = 'sam-config-confirm';
    confirm.textContent = isEdit ? 'Save Changes' : 'Create';
    confirm.addEventListener('click', () => {
      if (isEdit) {
        this._callbacks.updateAnimation(this._editTargetId, { ...this._configDraft });
      } else {
        const newAnim = { id: `anim_${_animIdCounter++}`, ...this._configDraft };
        this._callbacks.addAnimation(newAnim);
      }
      this._closeConfig();
    });
    btnRow.appendChild(confirm);

    const cancel = document.createElement('button');
    cancel.className = 'sam-config-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this._closeConfig());
    btnRow.appendChild(cancel);

    panel.appendChild(btnRow);
    return panel;
  }

  // ---- Private: helpers ----

  _closeConfig() {
    this._configMode = null;
    this._editTargetId = null;
    this.render();
  }

  _defaultDraft() {
    return {
      name: 'new_animation',
      spriteSheetId: null,
      frameWidth: 32,
      frameHeight: 32,
      frameStart: 0,
      frameCount: 1,
      fps: 8,
      loop: true,
    };
  }

  _makeTextField(label, field, value, onChange) {
    return this._makeFieldRow(label, () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.field = field;
      input.value = String(value);
      input.addEventListener('input', () => onChange(input.value));
      return input;
    });
  }

  _makeNumericField(label, field, value, onChange) {
    return this._makeFieldRow(label, () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.dataset.field = field;
      input.value = String(value);
      input.min = '0';
      input.addEventListener('input', () => {
        const n = Number(input.value);
        if (!isNaN(n)) onChange(n);
      });
      return input;
    });
  }

  _makeFieldRow(label, buildInput) {
    const row = document.createElement('div');
    row.className = 'sam-field-row';
    const lbl = document.createElement('label');
    lbl.className = 'sam-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(buildInput());
    return row;
  }

  _triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (file) this._handleImageFile(file);
    });
    input.click();
  }

  _handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = /** @type {string} */ (reader.result);
      const img = new Image();
      img.onload = () => {
        const sheet = {
          id: `sheet_${Date.now()}`,
          name: file.name,
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        this._callbacks.addSpriteSheet(sheet);
        this.render();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  _drawPreview(canvas, anim) {
    const sheets = this._callbacks.getSpriteSheets();
    const sheet = sheets.find((s) => s.id === anim.spriteSheetId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!sheet) {
      ctx.fillStyle = '#1a1a3a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#334';
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      ctx.fillStyle = '#556';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('no sheet', canvas.width / 2, canvas.height / 2 + 4);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const { sx: fx, sy: fy } = calcFrameSourceRect(anim, sheet, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        fx, fy, anim.frameWidth, anim.frameHeight,
        0, 0, canvas.width, canvas.height,
      );
    };
    img.src = sheet.dataUrl;
  }
}
