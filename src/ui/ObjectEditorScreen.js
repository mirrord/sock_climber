import { ObjectEditor } from '../objects/ObjectEditor.js';
import { SpriteAnimationManager } from './SpriteAnimationManager.js';
import { getTemplateList, getTemplate } from '../objects/templates.js';
import { COLLISION_GROUP } from '../objects/GameObject.js';
import { STANDARD_BEHAVIORS, createBehavior } from '../objects/Behavior.js';
import { BehaviorTrigger, TRIGGER_TYPES } from '../objects/BehaviorTrigger.js';

const COLLISION_GROUP_NAMES = Object.entries(COLLISION_GROUP)
  .filter(([, v]) => v > 0)
  .map(([name, value]) => ({ name, value }));

const OE_STYLE_ID = 'sock_climber-objed-styles';

function injectOEStyles() {
  if (document.getElementById(OE_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = OE_STYLE_ID;
  s.textContent = `
    .oe-screen {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column;
      background: #0f0f23; color: #eee;
      font-family: monospace; font-size: 12px;
    }
    .oe-topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #12122a; border-bottom: 1px solid #333;
      flex-shrink: 0;
    }
    .oe-topbar h2 { margin: 0; font-size: 16px; color: #48bfe3; flex: 1; text-align: center; }
    .oe-topbar button {
      background: none; border: 1px solid #555; color: #888;
      padding: 6px 16px; cursor: pointer; font-family: inherit;
      font-size: 13px; border-radius: 4px;
    }
    .oe-topbar button:hover { color: #eee; border-color: #aaa; }
    .oe-body { display: flex; flex: 1; overflow: hidden; }

    /* Left panel — properties */
    .oe-left {
      width: 300px; flex-shrink: 0; overflow-y: auto;
      border-right: 1px solid #333; padding: 10px;
      background: rgba(15,15,35,0.95);
    }
    .oe-left h3 { margin: 10px 0 6px; color: #aac; font-size: 13px; }
    .oe-left label { display: block; margin: 4px 0 2px; color: #8899bb; }
    .oe-left input, .oe-left select {
      width: 100%; box-sizing: border-box;
      background: #1a1a3a; color: #eee; border: 1px solid #444;
      padding: 4px 6px; margin-bottom: 4px; font-family: inherit; font-size: 12px;
    }
    .oe-left button {
      background: #2a2a5a; color: #eee; border: 1px solid #555;
      padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
      border-radius: 3px; margin: 2px 2px;
    }
    .oe-left button:hover { background: #3a3a7a; }
    .oe-left button.danger { border-color: #a33; }
    .oe-left button.danger:hover { background: #533; }
    .oe-left .row { display: flex; gap: 4px; margin: 4px 0; flex-wrap: wrap; }
    .oe-left .item {
      background: #1a1a3a; border: 1px solid #444; padding: 4px 8px;
      margin: 2px 0; display: flex; align-items: center; justify-content: space-between;
    }
    .oe-left .item .remove { color: #e66; cursor: pointer; margin-left: 8px; }
    .oe-left .section { border-top: 1px solid #333; padding-top: 6px; margin-top: 8px; }
    .oe-left .checkbox-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .oe-left .checkbox-group label { display: inline-flex; align-items: center; gap: 3px; color: #ccc; }
    .oe-left .empty-msg { color: #667; font-style: italic; }

    /* Center — viewport */
    .oe-center {
      flex: 1; display: flex; align-items: center; justify-content: center;
      background: #0a0a1a; position: relative;
    }
    .oe-center .placeholder {
      color: #445; font-size: 18px; text-align: center; user-select: none;
    }

    /* Right panel — object list */
    .oe-right {
      width: 240px; flex-shrink: 0; overflow-y: auto;
      border-left: 1px solid #333; padding: 10px;
      background: rgba(15,15,35,0.95);
    }
    .oe-right h3 { margin: 0 0 8px; color: #aac; font-size: 13px; }
    .oe-right .new-btn {
      display: block; width: 100%; padding: 8px 0; margin-bottom: 10px;
      background: #2a2a5a; color: #48bfe3; border: 1px solid #48bfe3;
      cursor: pointer; font-family: inherit; font-size: 13px;
      border-radius: 4px; text-align: center;
    }
    .oe-right .new-btn:hover { background: #3a3a7a; }
    .oe-right .obj-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 8px; margin: 3px 0; border: 1px solid #444;
      background: #1a1a3a; border-radius: 3px; cursor: pointer;
    }
    .oe-right .obj-item:hover { border-color: #48bfe3; }
    .oe-right .obj-item.selected { border-color: #48bfe3; background: #1a2a4a; }
    .oe-right .obj-item.unsaved { border-left: 3px solid #e8a735; }
    .oe-right .obj-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oe-right .obj-item .type { color: #667; font-size: 11px; margin-left: 6px; }
    .oe-right .obj-item .del {
      color: #e66; cursor: pointer; margin-left: 8px; font-size: 14px;
    }
    .oe-right .obj-item .del:hover { color: #f99; }
    .oe-right .empty-msg { color: #556; font-style: italic; text-align: center; padding: 20px 0; }
    .oe-right .template-section { margin-top: 10px; }
    .oe-right .template-section select {
      width: 100%; box-sizing: border-box;
      background: #1a1a3a; color: #eee; border: 1px solid #444;
      padding: 4px 6px; font-family: inherit; font-size: 12px;
    }
  `;
  document.head.appendChild(s);
}

/**
 * Standalone object editor screen (accessed from main menu).
 * Three-panel layout: left = properties, center = viewport, right = object list.
 */
export class ObjectEditorScreen {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onBack }
   */
  constructor(container, callbacks) {
    this._container = container;
    this._callbacks = callbacks;
    this._root = null;
    this._editor = null;
    /** @type {Set<string>} IDs of objects not yet saved to library */
    this._unsavedIds = new Set();
    /** @type {string|null} ID of the currently-selected library item */
    this._selectedLibId = null;
    /** @type {Array<object>} imported sprite sheets (persisted in localStorage) */
    this._spriteSheets = this._loadSpriteSheets();
    injectOEStyles();
  }

  enter() {
    this._editor = new ObjectEditor();
    this._root = document.createElement('div');
    this._root.className = 'oe-screen';

    // Top bar
    const topbar = this._el('div', 'oe-topbar');
    const backBtn = this._el('button', '', '← Back');
    backBtn.addEventListener('click', () => this._callbacks.onBack());
    topbar.appendChild(backBtn);
    topbar.appendChild(this._el('h2', '', 'Object Editor'));
    // spacer to keep title centered
    topbar.appendChild(this._el('div', '', ''));
    topbar.lastChild.style.width = '80px';
    this._root.appendChild(topbar);

    // Body
    const body = this._el('div', 'oe-body');

    this._leftPanel = this._el('div', 'oe-left');
    this._centerPanel = this._el('div', 'oe-center');
    this._rightPanel = this._el('div', 'oe-right');

    body.appendChild(this._leftPanel);
    body.appendChild(this._centerPanel);
    body.appendChild(this._rightPanel);
    this._root.appendChild(body);

    this._container.appendChild(this._root);
    this._refresh();
  }

  exit() {
    this._editor = null;
    this._unsavedIds.clear();
    this._selectedLibId = null;
    this._spriteAnimManager = null;
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  // ---- Refresh ----

  _refresh() {
    this._refreshLeft();
    this._refreshCenter();
    this._refreshRight();
  }

  // ---- LEFT PANEL: properties ----

  _refreshLeft() {
    this._leftPanel.innerHTML = '';
    const obj = this._editor.current;
    if (!obj) {
      const msg = this._el('p', 'empty-msg', 'Select or create an object to edit its properties.');
      this._leftPanel.appendChild(msg);
      return;
    }
    this._renderObjectFields();
    this._renderCollisionGroups();
    this._renderBehaviors();
    this._renderTriggers();
    this._renderProperties();
    this._renderActions();
  }

  _renderObjectFields() {
    const obj = this._editor.current;
    const section = this._el('div', '');
    section.appendChild(this._el('h3', '', 'Object'));

    section.appendChild(this._el('label', '', 'Name'));
    const nameInput = this._el('input');
    nameInput.value = obj.name;
    nameInput.addEventListener('change', () => {
      this._editor.setName(nameInput.value);
      this._markUnsaved();
      this._refreshRight();
    });
    section.appendChild(nameInput);

    section.appendChild(this._el('label', '', 'Type'));
    const typeSpan = this._el('span', '', obj.type);
    typeSpan.style.color = '#667';
    section.appendChild(typeSpan);

    section.appendChild(this._el('label', '', 'ID'));
    const idSpan = this._el('span', '', obj.id);
    idSpan.style.color = '#667';
    section.appendChild(idSpan);

    this._leftPanel.appendChild(section);
  }

  _renderCollisionGroups() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Collision Group'));
    const groupDiv = this._el('div', 'checkbox-group');
    for (const { name, value } of COLLISION_GROUP_NAMES) {
      const lbl = this._el('label');
      const cb = this._el('input');
      cb.type = 'checkbox';
      cb.checked = (obj.collisionGroup & value) !== 0;
      cb.addEventListener('change', () => {
        this._editor.setCollisionGroup(
          cb.checked ? obj.collisionGroup | value : obj.collisionGroup & ~value
        );
        this._markUnsaved();
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(name));
      groupDiv.appendChild(lbl);
    }
    section.appendChild(groupDiv);

    section.appendChild(this._el('h3', '', 'Collision Mask'));
    const maskDiv = this._el('div', 'checkbox-group');
    for (const { name, value } of COLLISION_GROUP_NAMES) {
      const lbl = this._el('label');
      const cb = this._el('input');
      cb.type = 'checkbox';
      cb.checked = (obj.collisionMask & value) !== 0;
      cb.addEventListener('change', () => {
        this._editor.setCollisionMask(
          cb.checked ? obj.collisionMask | value : obj.collisionMask & ~value
        );
        this._markUnsaved();
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(name));
      maskDiv.appendChild(lbl);
    }
    section.appendChild(maskDiv);
    this._leftPanel.appendChild(section);
  }

  _renderBehaviors() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Behaviors'));

    if (obj.behaviors.length === 0) {
      section.appendChild(this._el('span', 'empty-msg', 'No behaviors'));
    }
    for (const beh of obj.behaviors) {
      const item = this._el('div', 'item');
      item.appendChild(this._el('span', '', `${beh.name}${beh.animation ? ' ▸ ' + beh.animation : ''}`));
      const del = this._el('span', 'remove', '✕');
      del.addEventListener('click', () => {
        this._editor.removeBehavior(beh.id);
        this._markUnsaved();
        this._refreshLeft();
      });
      item.appendChild(del);
      section.appendChild(item);
    }

    // Add behavior
    const row = this._el('div', 'row');
    const sel = this._el('select');
    for (const sb of STANDARD_BEHAVIORS) {
      const opt = this._el('option');
      opt.value = sb.id;
      opt.textContent = sb.name;
      sel.appendChild(opt);
    }
    row.appendChild(sel);
    const addBtn = this._el('button', '', '+ Add');
    addBtn.addEventListener('click', () => {
      this._editor.addBehavior(createBehavior(sel.value));
      this._markUnsaved();
      this._refreshLeft();
    });
    row.appendChild(addBtn);
    section.appendChild(row);
    this._leftPanel.appendChild(section);
  }

  _renderTriggers() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Triggers'));

    if (obj.triggers.length === 0) {
      section.appendChild(this._el('span', 'empty-msg', 'No triggers'));
    }
    for (let i = 0; i < obj.triggers.length; i++) {
      const t = obj.triggers[i];
      const item = this._el('div', 'item');
      item.appendChild(this._el('span', '', `${t.type} → ${t.behaviorId}`));
      const del = this._el('span', 'remove', '✕');
      const idx = i;
      del.addEventListener('click', () => {
        this._editor.removeTrigger(idx);
        this._markUnsaved();
        this._refreshLeft();
      });
      item.appendChild(del);
      section.appendChild(item);
    }

    // Add trigger
    const row = this._el('div', 'row');
    const typeSel = this._el('select');
    for (const tt of TRIGGER_TYPES) {
      const opt = this._el('option');
      opt.value = tt;
      opt.textContent = tt;
      typeSel.appendChild(opt);
    }
    row.appendChild(typeSel);
    const behSel = this._el('select');
    for (const sb of STANDARD_BEHAVIORS) {
      const opt = this._el('option');
      opt.value = sb.id;
      opt.textContent = sb.name;
      behSel.appendChild(opt);
    }
    row.appendChild(behSel);
    const addBtn = this._el('button', '', '+ Add');
    addBtn.addEventListener('click', () => {
      this._editor.addTrigger(new BehaviorTrigger({
        type: typeSel.value,
        behaviorId: behSel.value,
      }));
      this._markUnsaved();
      this._refreshLeft();
    });
    row.appendChild(addBtn);
    section.appendChild(row);
    this._leftPanel.appendChild(section);
  }

  _renderProperties() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Properties'));

    for (const [key, val] of Object.entries(obj.properties)) {
      const row = this._el('div', 'row');
      row.style.alignItems = 'center';
      row.appendChild(this._el('label', '', key + ':'));
      const input = this._el('input');
      input.value = String(val);
      input.style.flex = '1';
      input.addEventListener('change', () => {
        const v = input.value;
        const num = Number(v);
        this._editor.setProperty(key, isNaN(num) ? v : num);
        this._markUnsaved();
      });
      row.appendChild(input);
      const delBtn = this._el('span', 'remove', '✕');
      delBtn.style.cursor = 'pointer';
      delBtn.addEventListener('click', () => {
        delete this._editor.current.properties[key];
        this._markUnsaved();
        this._refreshLeft();
      });
      row.appendChild(delBtn);
      section.appendChild(row);
    }

    // Add new property
    const row = this._el('div', 'row');
    const keyInput = this._el('input');
    keyInput.placeholder = 'key';
    keyInput.style.flex = '1';
    const valInput = this._el('input');
    valInput.placeholder = 'value';
    valInput.style.flex = '1';
    const addBtn = this._el('button', '', '+ Add');
    addBtn.addEventListener('click', () => {
      if (!keyInput.value) return;
      const v = valInput.value;
      const num = Number(v);
      this._editor.setProperty(keyInput.value, isNaN(num) ? v : num);
      this._markUnsaved();
      this._refreshLeft();
    });
    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(addBtn);
    section.appendChild(row);
    this._leftPanel.appendChild(section);
  }

  _renderActions() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Actions'));
    const row = this._el('div', 'row');

    const saveLib = this._el('button', '', 'Save to Library');
    saveLib.addEventListener('click', () => {
      this._editor.saveToLibrary();
      const id = this._editor.current.id;
      this._unsavedIds.delete(id);
      this._selectedLibId = id;
      this._refresh();
    });
    row.appendChild(saveLib);

    const exportBtn = this._el('button', '', 'Export JSON');
    exportBtn.addEventListener('click', () => {
      const json = this._editor.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this._editor.current.type}_${this._editor.current.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    row.appendChild(exportBtn);

    const importBtn = this._el('button', '', 'Import JSON');
    importBtn.addEventListener('click', () => {
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
            this._unsavedIds.add(this._editor.current.id);
            this._refresh();
          } catch (_) { /* ignore invalid */ }
        };
        reader.readAsText(file);
      });
      input.click();
    });
    row.appendChild(importBtn);

    section.appendChild(row);
    this._leftPanel.appendChild(section);
  }

  // ---- CENTER PANEL: sprite animation manager ----

  _refreshCenter() {
    this._centerPanel.innerHTML = '';
    const obj = this._editor.current;

    if (!obj) {
      const ph = this._el('div', 'placeholder');
      ph.textContent = 'No object selected';
      this._centerPanel.appendChild(ph);
      return;
    }

    this._spriteAnimManager = new SpriteAnimationManager(this._centerPanel, {
      getAnimations: () => obj.animations,
      addAnimation: (anim) => {
        this._editor.addAnimation(anim);
        this._markUnsaved();
      },
      removeAnimation: (id) => {
        this._editor.removeAnimation(id);
        this._markUnsaved();
      },
      updateAnimation: (id, patch) => {
        this._editor.updateAnimation(id, patch);
        this._markUnsaved();
      },
      getSpriteSheets: () => this._spriteSheets,
      addSpriteSheet: (sheet) => {
        this._spriteSheets.push(sheet);
        this._saveSpriteSheets();
      },
    });
    this._spriteAnimManager.render();
  }

  // ---- Sprite sheet persistence ----

  static get _SHEET_STORAGE_KEY() { return 'sock_climber_oe_sprite_sheets'; }

  _loadSpriteSheets() {
    try {
      const raw = localStorage.getItem(ObjectEditorScreen._SHEET_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return [];
  }

  _saveSpriteSheets() {
    try {
      localStorage.setItem(
        ObjectEditorScreen._SHEET_STORAGE_KEY,
        JSON.stringify(this._spriteSheets),
      );
    } catch (_) { /* ignore quota errors */ }
  }

  // ---- RIGHT PANEL: object list ----

  _refreshRight() {
    this._rightPanel.innerHTML = '';
    this._rightPanel.appendChild(this._el('h3', '', 'Objects'));

    // New Object button
    const newBtn = this._el('button', 'new-btn', '+ New Object');
    newBtn.addEventListener('click', () => {
      this._editor.createBlank('custom', 'Untitled');
      this._unsavedIds.add(this._editor.current.id);
      this._editor.saveToLibrary();
      this._selectedLibId = this._editor.current.id;
      this._refresh();
    });
    this._rightPanel.appendChild(newBtn);

    // Template quick-create
    const tmplSection = this._el('div', 'template-section');
    tmplSection.appendChild(this._el('label', '', 'From template:'));
    const tmplSel = this._el('select');
    const defOpt = this._el('option');
    defOpt.value = '';
    defOpt.textContent = '— choose —';
    tmplSel.appendChild(defOpt);
    for (const t of getTemplateList()) {
      const opt = this._el('option');
      opt.value = t.type;
      opt.textContent = t.type;
      tmplSel.appendChild(opt);
    }
    tmplSel.addEventListener('change', () => {
      if (!tmplSel.value) return;
      this._editor.createFromTemplate(tmplSel.value);
      this._unsavedIds.add(this._editor.current.id);
      this._editor.saveToLibrary();
      this._selectedLibId = this._editor.current.id;
      tmplSel.value = '';
      this._refresh();
    });
    tmplSection.appendChild(tmplSel);
    this._rightPanel.appendChild(tmplSection);

    // Library list
    if (this._editor.library.length === 0) {
      this._rightPanel.appendChild(this._el('p', 'empty-msg', 'No objects yet.'));
      return;
    }
    for (let i = 0; i < this._editor.library.length; i++) {
      const obj = this._editor.library[i];
      const item = this._el('div', 'obj-item');
      if (obj.id === this._selectedLibId) item.classList.add('selected');
      if (this._unsavedIds.has(obj.id)) item.classList.add('unsaved');

      const nameSpan = this._el('span', 'name', obj.name || '(unnamed)');
      item.appendChild(nameSpan);
      const typeSpan = this._el('span', 'type', obj.type);
      item.appendChild(typeSpan);

      const del = this._el('span', 'del', '✕');
      const idx = i;
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this._unsavedIds.delete(obj.id);
        if (this._selectedLibId === obj.id) {
          this._selectedLibId = null;
          this._editor.current = null;
        }
        this._editor.removeFromLibrary(idx);
        this._refresh();
      });
      item.appendChild(del);

      item.addEventListener('click', () => {
        this._editor.loadFromLibrary(idx);
        this._selectedLibId = obj.id;
        this._refresh();
      });
      this._rightPanel.appendChild(item);
    }
  }

  // ---- Helpers ----

  _markUnsaved() {
    if (this._editor.current) {
      this._unsavedIds.add(this._editor.current.id);
      // Sync edits back into the library entry
      if (this._selectedLibId) {
        const idx = this._editor.library.findIndex(o => o.id === this._selectedLibId);
        if (idx !== -1) {
          this._editor.library[idx] = this._editor.current.clone();
        }
      }
      this._refreshRight();
    }
  }

  _el(tag, cls = '', text = '') {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }
}
