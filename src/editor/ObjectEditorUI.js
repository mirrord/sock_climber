import { ObjectEditor } from '../objects/ObjectEditor.js';
import { getTemplateList, getTemplate } from '../objects/templates.js';
import { COLLISION_GROUP } from '../objects/GameObject.js';
import { Behavior, STANDARD_BEHAVIORS, createBehavior } from '../objects/Behavior.js';
import { BehaviorTrigger, TRIGGER_TYPES } from '../objects/BehaviorTrigger.js';

const COLLISION_GROUP_NAMES = Object.entries(COLLISION_GROUP)
  .filter(([, v]) => v > 0)
  .map(([name, value]) => ({ name, value }));

/**
 * DOM panel for the Object Editor.
 * Rendered as a slide-out panel on the right side.
 */
export class ObjectEditorUI {
  /**
   * @param {HTMLElement} container
   * @param {ObjectEditor} objectEditor
   */
  constructor(container, objectEditor) {
    this._editor = objectEditor;
    this._root = document.createElement('div');
    this._root.id = 'object-editor-panel';
    this._visible = false;
    this._root.innerHTML = `
      <style>
        #object-editor-panel {
          position: fixed; top: 0; right: 0; z-index: 20;
          width: 340px; height: 100vh; overflow-y: auto;
          background: rgba(15,15,35,0.95); color: #eee;
          font-family: monospace; font-size: 12px;
          padding: 10px; box-sizing: border-box;
          transform: translateX(100%); transition: transform 0.2s;
          border-left: 1px solid #555;
        }
        #object-editor-panel.visible { transform: translateX(0); }
        #object-editor-panel h3 { margin: 10px 0 6px; color: #aac; font-size: 13px; }
        #object-editor-panel label { display: block; margin: 4px 0 2px; color: #8899bb; }
        #object-editor-panel input, #object-editor-panel select {
          width: 100%; box-sizing: border-box;
          background: #1a1a3a; color: #eee; border: 1px solid #444;
          padding: 4px 6px; margin-bottom: 4px; font-family: inherit; font-size: 12px;
        }
        #object-editor-panel button {
          background: #2a2a5a; color: #eee; border: 1px solid #555;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
          border-radius: 3px; margin: 2px 2px;
        }
        #object-editor-panel button:hover { background: #3a3a7a; }
        #object-editor-panel button.danger { border-color: #a33; }
        #object-editor-panel button.danger:hover { background: #533; }
        #object-editor-panel .row { display: flex; gap: 4px; margin: 4px 0; flex-wrap: wrap; }
        #object-editor-panel .item {
          background: #1a1a3a; border: 1px solid #444; padding: 4px 8px;
          margin: 2px 0; display: flex; align-items: center; justify-content: space-between;
        }
        #object-editor-panel .item .remove { color: #e66; cursor: pointer; margin-left: 8px; }
        #object-editor-panel .section { border-top: 1px solid #333; padding-top: 6px; margin-top: 8px; }
        #object-editor-panel .library-item {
          display: flex; justify-content: space-between; align-items: center;
          background: #1a1a3a; padding: 4px 8px; margin: 2px 0; border: 1px solid #444;
        }
        #object-editor-panel .checkbox-group { display: flex; flex-wrap: wrap; gap: 6px; }
        #object-editor-panel .checkbox-group label { display: inline-flex; align-items: center; gap: 3px; color: #ccc; }
        #object-editor-panel .empty-msg { color: #667; font-style: italic; }
        #object-editor-panel .close-btn {
          display: block; width: 100%; padding: 6px 0; margin-bottom: 8px;
          background: none; border: 1px solid #555; color: #888;
          cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 4px; text-align: center;
        }
        #object-editor-panel .close-btn:hover { color: #eee; border-color: #aaa; }
      </style>
      <div id="oe-content"></div>
    `;
    container.appendChild(this._root);
    this._content = this._root.querySelector('#oe-content');
  }

  toggle() {
    this._visible = !this._visible;
    this._root.classList.toggle('visible', this._visible);
    if (this._visible) this.refresh();
  }

  show() {
    this._visible = true;
    this._root.classList.add('visible');
    this.refresh();
  }

  hide() {
    this._visible = false;
    this._root.classList.remove('visible');
  }

  refresh() {
    this._content.innerHTML = '';
    const closeBtn = this._el('button', 'close-btn', '✕ Close');
    closeBtn.addEventListener('click', () => {
      this._editor.current = null;
      this.hide();
    });
    this._content.appendChild(closeBtn);
    this._renderTemplateBar();
    this._renderLibrary();
    if (this._editor.current) {
      this._renderObjectFields();
      this._renderCollisionGroups();
      this._renderBehaviors();
      this._renderTriggers();
      this._renderProperties();
      this._renderActions();
    }
  }

  dispose() {
    this._root.remove();
  }

  // ---- Sections ----

  _renderTemplateBar() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Create Object'));
    const row = this._el('div', 'row');
    for (const tmpl of getTemplateList()) {
      const btn = this._el('button', '', tmpl.name);
      btn.addEventListener('click', () => {
        this._editor.createFromTemplate(tmpl.type);
        this.refresh();
      });
      row.appendChild(btn);
    }
    const blankBtn = this._el('button', '', '+ Blank');
    blankBtn.addEventListener('click', () => {
      this._editor.createBlank('custom', 'New Object');
      this.refresh();
    });
    row.appendChild(blankBtn);
    section.appendChild(row);
    this._content.appendChild(section);
  }

  _renderLibrary() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', `Library (${this._editor.library.length})`));
    if (this._editor.library.length === 0) {
      section.appendChild(this._el('div', 'empty-msg', 'No saved objects'));
    }
    this._editor.library.forEach((obj, i) => {
      const item = this._el('div', 'library-item');
      item.appendChild(this._el('span', '', `${obj.name} [${obj.type}]`));
      const btns = this._el('span', '');
      const loadBtn = this._el('button', '', 'Load');
      loadBtn.addEventListener('click', () => {
        this._editor.loadFromLibrary(i);
        this.refresh();
      });
      const delBtn = this._el('button', 'danger', 'X');
      delBtn.addEventListener('click', () => {
        this._editor.removeFromLibrary(i);
        this.refresh();
      });
      btns.appendChild(loadBtn);
      btns.appendChild(delBtn);
      item.appendChild(btns);
      section.appendChild(item);
    });
    this._content.appendChild(section);
  }

  _renderObjectFields() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', `Editing: ${obj.name}`));

    section.appendChild(this._el('label', '', 'Name'));
    const nameInput = this._el('input');
    nameInput.value = obj.name;
    nameInput.addEventListener('change', () => {
      this._editor.setName(nameInput.value);
      this.refresh();
    });
    section.appendChild(nameInput);

    section.appendChild(this._el('label', '', `Type: ${obj.type}`));
    section.appendChild(this._el('label', '', `ID: ${obj.id}`));
    this._content.appendChild(section);
  }

  _renderCollisionGroups() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Collision'));

    section.appendChild(this._el('label', '', 'Belongs to:'));
    const groupDiv = this._el('div', 'checkbox-group');
    for (const { name, value } of COLLISION_GROUP_NAMES) {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (obj.collisionGroup & value) !== 0;
      cb.addEventListener('change', () => {
        const cur = this._editor.current.collisionGroup;
        this._editor.setCollisionGroup(cb.checked ? cur | value : cur & ~value);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(name));
      groupDiv.appendChild(lbl);
    }
    section.appendChild(groupDiv);

    section.appendChild(this._el('label', '', 'Collides with:'));
    const maskDiv = this._el('div', 'checkbox-group');
    for (const { name, value } of COLLISION_GROUP_NAMES) {
      const lbl = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (obj.collisionMask & value) !== 0;
      cb.addEventListener('change', () => {
        const cur = this._editor.current.collisionMask;
        this._editor.setCollisionMask(cb.checked ? cur | value : cur & ~value);
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(name));
      maskDiv.appendChild(lbl);
    }
    section.appendChild(maskDiv);
    this._content.appendChild(section);
  }

  _renderBehaviors() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Behaviors'));

    for (const beh of obj.behaviors) {
      const item = this._el('div', 'item');
      let desc = `${beh.name}`;
      if (beh.animation) desc += ` [anim: ${beh.animation}]`;
      if (Object.keys(beh.params).length) desc += ` ${JSON.stringify(beh.params)}`;
      item.appendChild(this._el('span', '', desc));
      const remove = this._el('span', 'remove', '✕');
      remove.addEventListener('click', () => {
        this._editor.removeBehavior(beh.id);
        this.refresh();
      });
      item.appendChild(remove);
      section.appendChild(item);
    }

    // Add behavior dropdown
    const row = this._el('div', 'row');
    const sel = document.createElement('select');
    sel.style.flex = '1';
    for (const sb of STANDARD_BEHAVIORS) {
      const opt = document.createElement('option');
      opt.value = sb.id;
      opt.textContent = sb.name;
      sel.appendChild(opt);
    }
    row.appendChild(sel);
    const addBtn = this._el('button', '', '+ Add');
    addBtn.addEventListener('click', () => {
      const beh = createBehavior(sel.value);
      if (beh) {
        this._editor.addBehavior(beh);
        this.refresh();
      }
    });
    row.appendChild(addBtn);
    section.appendChild(row);
    this._content.appendChild(section);
  }

  _renderTriggers() {
    const obj = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Triggers'));

    obj.triggers.forEach((trig, i) => {
      const item = this._el('div', 'item');
      let desc = `${trig.type} → ${trig.behaviorId}`;
      if (Object.keys(trig.params).length) desc += ` ${JSON.stringify(trig.params)}`;
      item.appendChild(this._el('span', '', desc));
      const remove = this._el('span', 'remove', '✕');
      remove.addEventListener('click', () => {
        this._editor.removeTrigger(i);
        this.refresh();
      });
      item.appendChild(remove);
      section.appendChild(item);
    });

    // Add trigger
    const row = this._el('div', 'row');
    const typeSel = document.createElement('select');
    typeSel.style.flex = '1';
    for (const tt of TRIGGER_TYPES) {
      const opt = document.createElement('option');
      opt.value = tt;
      opt.textContent = tt;
      typeSel.appendChild(opt);
    }
    row.appendChild(typeSel);

    const behSel = document.createElement('select');
    behSel.style.flex = '1';
    for (const beh of obj.behaviors) {
      const opt = document.createElement('option');
      opt.value = beh.id;
      opt.textContent = beh.name;
      behSel.appendChild(opt);
    }
    row.appendChild(behSel);

    const addBtn = this._el('button', '', '+ Add');
    addBtn.addEventListener('click', () => {
      if (!behSel.value) return;
      this._editor.addTrigger(new BehaviorTrigger({
        type: typeSel.value,
        behaviorId: behSel.value,
      }));
      this.refresh();
    });
    row.appendChild(addBtn);
    section.appendChild(row);
    this._content.appendChild(section);
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
        // Auto-detect type
        const v = input.value;
        const num = Number(v);
        this._editor.setProperty(key, isNaN(num) ? v : num);
      });
      row.appendChild(input);
      const delBtn = this._el('span', 'remove', '✕');
      delBtn.style.cursor = 'pointer';
      delBtn.addEventListener('click', () => {
        delete this._editor.current.properties[key];
        this.refresh();
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
      this.refresh();
    });
    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(addBtn);
    section.appendChild(row);
    this._content.appendChild(section);
  }

  _renderActions() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Actions'));
    const row = this._el('div', 'row');

    const saveLib = this._el('button', '', 'Save to Library');
    saveLib.addEventListener('click', () => {
      this._editor.saveToLibrary();
      this.refresh();
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
            this.refresh();
          } catch (_) { /* ignore invalid */ }
        };
        reader.readAsText(file);
      });
      input.click();
    });
    row.appendChild(importBtn);

    section.appendChild(row);
    this._content.appendChild(section);
  }

  // ---- Helpers ----

  _el(tag, cls = '', text = '') {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }
}
