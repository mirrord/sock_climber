import { BehaviorEditor } from '../objects/BehaviorEditor.js';
import { STANDARD_BEHAVIORS } from '../objects/Behavior.js';
import { BehaviorEffect, OPERATIONS } from '../objects/BehaviorEffect.js';
import { TRIGGER_TYPES } from '../objects/BehaviorTrigger.js';
import { getTemplateList } from '../objects/templates.js';

/**
 * Slide-out panel for editing the behavior library.
 *
 * Matches the visual style and interaction patterns of ObjectEditorUI.
 * Opens from the right at z-index 21 (one above the objects panel so they
 * can visually stack when both are briefly on-screen during a transition).
 */
export class BehaviorEditorUI {
  /**
   * @param {HTMLElement} container
   * @param {BehaviorEditor} behaviorEditor
   * @param {object} [options]
   * @param {((behavior: import('../objects/Behavior.js').Behavior) => void)|null} [options.onBehaviorAssigned]
   *   Called when the user clicks "Assign to Object". The caller should attach
   *   the returned behavior clone to the currently-selected game object.
   */
  constructor(container, behaviorEditor, { onBehaviorAssigned } = {}) {
    this._editor = behaviorEditor;
    this._onBehaviorAssigned = onBehaviorAssigned ?? null;
    this._visible = false;
    /** @type {import('../objects/GameObject.js').GameObject|null} */
    this._contextObject = null;

    this._root = document.createElement('div');
    this._root.id = 'behavior-editor-panel';
    this._root.innerHTML = `
      <style>
        #behavior-editor-panel {
          position: fixed; top: 0; right: 0; z-index: 21;
          width: 340px; height: 100vh; overflow-y: auto;
          background: rgba(10,20,30,0.97); color: #eee;
          font-family: monospace; font-size: 12px;
          padding: 10px; box-sizing: border-box;
          transform: translateX(100%); transition: transform 0.2s;
          border-left: 1px solid #446;
        }
        #behavior-editor-panel.visible { transform: translateX(0); }
        #behavior-editor-panel h3 { margin: 10px 0 6px; color: #aac; font-size: 13px; }
        #behavior-editor-panel label { display: block; margin: 4px 0 2px; color: #8899bb; }
        #behavior-editor-panel input, #behavior-editor-panel select {
          width: 100%; box-sizing: border-box;
          background: #0d1a2a; color: #eee; border: 1px solid #446;
          padding: 4px 6px; margin-bottom: 4px; font-family: inherit; font-size: 12px;
        }
        #behavior-editor-panel button {
          background: #1a2a4a; color: #eee; border: 1px solid #446;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 12px;
          border-radius: 3px; margin: 2px 2px;
        }
        #behavior-editor-panel button:hover { background: #2a3a6a; }
        #behavior-editor-panel button.danger { border-color: #a33; }
        #behavior-editor-panel button.danger:hover { background: #533; }
        #behavior-editor-panel button.accent { border-color: #46a; background: #1a246a; }
        #behavior-editor-panel button.accent:hover { background: #2a34a0; }
        #behavior-editor-panel .row { display: flex; gap: 4px; margin: 4px 0; flex-wrap: wrap; align-items: center; }
        #behavior-editor-panel .item {
          background: #0d1a2a; border: 1px solid #446; padding: 4px 8px;
          margin: 2px 0; display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 4px;
        }
        #behavior-editor-panel .item.selected { border-color: #46a; background: #0e1b32; }
        #behavior-editor-panel .item .remove { color: #e66; cursor: pointer; margin-left: 8px; flex-shrink: 0; }
        #behavior-editor-panel .section { border-top: 1px solid #223; padding-top: 6px; margin-top: 8px; }
        #behavior-editor-panel .std-badge {
          display: inline-block; background: #1a2030; border: 1px solid #335;
          color: #aab; padding: 2px 6px; margin: 2px; border-radius: 2px;
          font-size: 11px;
        }
        #behavior-editor-panel .empty-msg { color: #556; font-style: italic; }
        #behavior-editor-panel .close-btn {
          display: block; width: 100%; padding: 6px 0; margin-bottom: 8px;
          background: none; border: 1px solid #446; color: #778;
          cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 4px; text-align: center;
        }
        #behavior-editor-panel .close-btn:hover { color: #eee; border-color: #aaa; }
        #behavior-editor-panel .effect-row {
          background: #0d1a2a; border: 1px solid #335; padding: 4px 6px;
          margin: 3px 0; display: grid;
          grid-template-columns: 1fr 1fr 80px 60px auto;
          gap: 4px; align-items: center;
        }
        #behavior-editor-panel .effect-row input,
        #behavior-editor-panel .effect-row select {
          margin-bottom: 0;
        }
        #behavior-editor-panel .tag {
          background: #1a3a4a; color: #6bf; border: 1px solid #2a4a5a;
          padding: 1px 5px; border-radius: 2px; font-size: 10px;
        }
      </style>
      <div id="be-content"></div>
    `;
    container.appendChild(this._root);
    this._content = this._root.querySelector('#be-content');
  }

  /**
   * Set the GameObject whose member variables will be shown as reference
   * in the behavior editor (helps when writing effect targets / properties).
   * @param {import('../objects/GameObject.js').GameObject|null} object
   */
  setContext(object) {
    this._contextObject = object ?? null;
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

  get visible() {
    return this._visible;
  }

  refresh() {
    this._content.innerHTML = '';

    const closeBtn = this._el('button', 'close-btn', '✕ Close');
    closeBtn.addEventListener('click', () => {
      this._editor.current = null;
      this.hide();
    });
    this._content.appendChild(closeBtn);

    this._renderStandardBehaviors();
    this._renderLibrary();

    if (this._editor.current) {
      this._renderEditFields();
      this._renderMemberVariables();
      this._renderParams();
      this._renderEffects();
      this._renderActions();
    }
  }

  dispose() {
    this._root.remove();
  }

  // ---- Sections ----

  _renderMemberVariables() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Accessible Variables'));

    const hint = this._el('div', 'empty-msg',
      'Use these as "Property" or via "target" in effects. ' +
      'Custom properties are prefixed with properties.');
    hint.style.marginBottom = '6px';
    section.appendChild(hint);

    // Built-in fields always available on any object
    const BUILTIN_VARS = ['x', 'y', 'name', 'type', 'id', 'collisionGroup', 'collisionMask', 'velocityX', 'velocityY'];
    const builtinRow = this._el('div', 'row');
    builtinRow.style.flexWrap = 'wrap';
    for (const v of BUILTIN_VARS) {
      const tag = this._el('span', 'tag', v);
      tag.title = `Built-in field: ${v}`;
      builtinRow.appendChild(tag);
    }
    section.appendChild(this._el('label', '', 'Built-in:'));
    section.appendChild(builtinRow);

    // Object custom properties from context
    const obj = this._contextObject;
    const propEntries = obj ? Object.keys(obj.properties) : [];
    if (propEntries.length > 0) {
      const propRow = this._el('div', 'row');
      propRow.style.flexWrap = 'wrap';
      for (const key of propEntries) {
        const tag = this._el('span', 'tag', `properties.${key}`);
        tag.title = `Object property: ${key} = ${obj.properties[key]}`;
        propRow.appendChild(tag);
      }
      section.appendChild(this._el('label', '', 'Custom properties:'));
      section.appendChild(propRow);
    } else if (obj) {
      section.appendChild(this._el('div', 'empty-msg', 'No custom properties on this object'));
    } else {
      section.appendChild(this._el('div', 'empty-msg', 'Open via object editor to see custom properties'));
    }

    this._content.appendChild(section);
  }

  _renderStandardBehaviors() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Standard Behaviors'));
    const hint = this._el('div', 'empty-msg', 'Click Copy to create an editable variant');
    hint.style.marginBottom = '6px';
    section.appendChild(hint);

    for (const sb of STANDARD_BEHAVIORS) {
      const row = this._el('div', 'row');
      const badge = this._el('span', 'std-badge', `${sb.name}`);
      if (sb.animation) {
        const animTag = this._el('span', 'tag', `anim: ${sb.animation}`);
        animTag.style.marginLeft = '4px';
        badge.appendChild(animTag);
      }
      row.appendChild(badge);

      const copyBtn = this._el('button', '', 'Copy');
      copyBtn.title = `Create an editable copy of "${sb.name}"`;
      copyBtn.addEventListener('click', () => {
        this._editor.createFromStandard(sb.id);
        this.refresh();
      });
      row.appendChild(copyBtn);
      section.appendChild(row);
    }

    this._content.appendChild(section);
  }

  _renderLibrary() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', `Custom Behaviors (${this._editor.library.length})`));

    const createForm = this._el('div', 'row');
    createForm.style.alignItems = 'center';

    const nameInput = this._el('input');
    nameInput.placeholder = 'Name…';
    nameInput.style.flex = '2';
    nameInput.title = 'New behavior name';
    createForm.appendChild(nameInput);

    const idInput = this._el('input');
    idInput.placeholder = 'id (auto)';
    idInput.style.flex = '1';
    idInput.title = 'Optional unique ID; auto-generated if blank';
    createForm.appendChild(idInput);

    const createBtn = this._el('button', '', '+ Create');
    createBtn.title = 'Create a new blank behavior with this name';
    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'New Behavior';
      const id = idInput.value.trim() || `custom_${Date.now()}`;
      this._editor.createBlank(id, name);
      nameInput.value = '';
      idInput.value = '';
      this.refresh();
    });
    createForm.appendChild(createBtn);
    section.appendChild(createForm);

    if (this._editor.library.length === 0) {
      section.appendChild(this._el('div', 'empty-msg', 'No custom behaviors saved'));
    }

    this._editor.library.forEach((beh, i) => {
      const isSelected = this._editor.current?.id === beh.id;
      const item = this._el('div', isSelected ? 'item selected' : 'item');

      const nameSpan = this._el('span', '', `${beh.name}`);
      if (beh.animation) {
        const tag = this._el('span', 'tag', beh.animation);
        tag.style.marginLeft = '4px';
        nameSpan.appendChild(tag);
      }
      item.appendChild(nameSpan);

      const btns = this._el('span', 'row');
      btns.style.flexWrap = 'nowrap';

      const loadBtn = this._el('button', '', 'Load');
      loadBtn.addEventListener('click', () => {
        this._editor.loadFromLibrary(i);
        this.refresh();
      });
      btns.appendChild(loadBtn);

      const delBtn = this._el('button', 'danger', '✕');
      delBtn.addEventListener('click', () => {
        this._editor.removeFromLibrary(i);
        if (this._editor.current?.id === beh.id) this._editor.current = null;
        this.refresh();
      });
      btns.appendChild(delBtn);

      item.appendChild(btns);
      section.appendChild(item);
    });

    this._content.appendChild(section);
  }

  _renderEditFields() {
    const b = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', `Editing: ${b.name}`));

    section.appendChild(this._el('label', '', 'ID (read-only)'));
    const idLabel = this._el('input');
    idLabel.value = b.id;
    idLabel.disabled = true;
    section.appendChild(idLabel);

    section.appendChild(this._el('label', '', 'Name'));
    const nameInput = this._el('input');
    nameInput.value = b.name;
    nameInput.addEventListener('change', () => {
      this._editor.setName(nameInput.value);
      this.refresh();
    });
    section.appendChild(nameInput);

    section.appendChild(this._el('label', '', 'Animation'));
    const animInput = this._el('input');
    animInput.value = b.animation ?? '';
    animInput.placeholder = 'none';
    animInput.addEventListener('change', () => {
      this._editor.setAnimation(animInput.value || null);
    });
    section.appendChild(animInput);

    this._content.appendChild(section);
  }

  _renderParams() {
    const b = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Parameters'));

    for (const [key, val] of Object.entries(b.params)) {
      const row = this._el('div', 'row');
      row.style.alignItems = 'center';
      const keyLabel = this._el('span', '', `${key}:`);
      keyLabel.style.minWidth = '60px';
      row.appendChild(keyLabel);

      const input = this._el('input');
      input.value = String(val);
      input.style.flex = '1';
      input.addEventListener('change', () => {
        const v = input.value;
        const num = Number(v);
        this._editor.setParam(key, isNaN(num) ? v : num);
      });
      row.appendChild(input);

      const delBtn = this._el('span', 'remove', '✕');
      delBtn.addEventListener('click', () => {
        this._editor.removeParam(key);
        this.refresh();
      });
      row.appendChild(delBtn);
      section.appendChild(row);
    }

    // Add new param
    const addRow = this._el('div', 'row');
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
      this._editor.setParam(keyInput.value, isNaN(num) ? v : num);
      this.refresh();
    });
    addRow.appendChild(keyInput);
    addRow.appendChild(valInput);
    addRow.appendChild(addBtn);
    section.appendChild(addRow);
    this._content.appendChild(section);
  }

  _renderEffects() {
    const b = this._editor.current;
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Effects'));
    section.appendChild(this._el('div', 'empty-msg',
      'Effects are applied when this behavior fires. ' +
      'Target "self", "target" (contact object), or any object ID. ' +
      'Property path: x, y, or properties.<key>. Use "spawn" to create objects.'));

    if (b.effects.length === 0) {
      section.appendChild(this._el('div', 'empty-msg', 'No effects'));
    }

    const templates = getTemplateList();

    b.effects.forEach((eff, i) => {
      const isSpawn = eff.operation === 'spawn';
      const isDestroy = eff.operation === 'destroy';

      const row = document.createElement('div');
      row.className = 'effect-row';

      const targetInput = this._el('input');
      targetInput.value = eff.targetRef;
      targetInput.title = '"self", "target" (contact), or a level object id';
      targetInput.placeholder = 'self';
      targetInput.addEventListener('change', () => {
        this._editor.updateEffect(i, { targetRef: targetInput.value });
      });

      const propInput = this._el('input');
      propInput.value = isSpawn || isDestroy ? '' : eff.property;
      propInput.title = 'e.g. x, y, properties.health';
      propInput.placeholder = isSpawn ? '(spawn)' : isDestroy ? '(destroy)' : 'x';
      propInput.disabled = isSpawn || isDestroy;
      propInput.addEventListener('change', () => {
        if (!isSpawn && !isDestroy) this._editor.updateEffect(i, { property: propInput.value });
      });

      const opSel = document.createElement('select');
      opSel.style.marginBottom = '0';
      for (const op of OPERATIONS) {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = op;
        if (op === eff.operation) opt.selected = true;
        opSel.appendChild(opt);
      }
      opSel.addEventListener('change', () => {
        this._editor.updateEffect(i, { operation: opSel.value });
        this.refresh();
      });

      const valInput = this._el('input');
      valInput.value = isSpawn || isDestroy ? '' : String(eff.value);
      valInput.title = 'value';
      valInput.disabled = isSpawn || isDestroy;
      valInput.placeholder = isSpawn || isDestroy ? '' : '0';
      valInput.addEventListener('change', () => {
        if (!isSpawn && !isDestroy) {
          const v = valInput.value;
          const num = Number(v);
          this._editor.updateEffect(i, { value: isNaN(num) ? v : num });
        }
      });

      const delBtn = this._el('span', 'remove', '✕');
      delBtn.addEventListener('click', () => {
        this._editor.removeEffect(i);
        this.refresh();
      });

      row.appendChild(targetInput);
      row.appendChild(propInput);
      row.appendChild(opSel);
      row.appendChild(valInput);
      row.appendChild(delBtn);
      section.appendChild(row);

      // Spawn spec sub-form
      if (isSpawn) {
        const spec = eff.spawnSpec ?? { objectType: '', offsetX: 0, offsetY: 0, velocityX: 0, velocityY: 0, properties: {}, lifetime: 0 };
        const specForm = document.createElement('div');
        specForm.style.cssText = 'background:#070f1a;border:1px solid #335;padding:6px 8px;margin:0 0 4px 0;';

        const makeSpecRow = (label, inputEl) => {
          const r = this._el('div', 'row');
          r.style.alignItems = 'center';
          const lbl = this._el('span', '', label);
          lbl.style.cssText = 'min-width:80px;color:#8899bb;font-size:11px;';
          r.appendChild(lbl);
          inputEl.style.flex = '1';
          r.appendChild(inputEl);
          return r;
        };

        // objectType select
        const typeSel = document.createElement('select');
        typeSel.style.marginBottom = '0';
        const blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '-- select type --';
        typeSel.appendChild(blankOpt);
        for (const tmpl of templates) {
          const opt = document.createElement('option');
          opt.value = tmpl.type;
          opt.textContent = tmpl.name;
          if (tmpl.type === spec.objectType) opt.selected = true;
          typeSel.appendChild(opt);
        }
        typeSel.addEventListener('change', () => {
          this._editor.updateEffect(i, { spawnSpec: { ...spec, objectType: typeSel.value } });
        });
        specForm.appendChild(makeSpecRow('Object Type', typeSel));

        const makeNumInput = (label, field, defaultVal) => {
          const inp = this._el('input');
          inp.type = 'number';
          inp.step = '0.1';
          inp.value = spec[field] ?? defaultVal;
          inp.addEventListener('change', () => {
            this._editor.updateEffect(i, { spawnSpec: { ...spec, [field]: parseFloat(inp.value) || 0 } });
          });
          specForm.appendChild(makeSpecRow(label, inp));
        };

        makeNumInput('Offset X', 'offsetX', 0);
        makeNumInput('Offset Y', 'offsetY', 0);
        makeNumInput('Velocity X', 'velocityX', 0);
        makeNumInput('Velocity Y', 'velocityY', 0);
        makeNumInput('Lifetime (s)', 'lifetime', 0);

        section.appendChild(specForm);
      }
    });

    // Column headers for the add-form
    const header = this._el('div', 'row');
    header.style.marginTop = '8px';
    header.style.color = '#556';
    header.style.fontSize = '10px';
    ['Target', 'Property', 'Op', 'Value', ''].forEach((h) => {
      const s = document.createElement('span');
      s.style.flex = '1';
      s.textContent = h;
      header.appendChild(s);
    });
    section.appendChild(header);

    // Add new effect form
    const addRow = document.createElement('div');
    addRow.className = 'row';
    addRow.style.marginTop = '2px';

    const newTarget = this._el('input');
    newTarget.placeholder = 'self';
    newTarget.style.flex = '1';
    newTarget.title = '"self", "target", or level object id';

    const newProp = this._el('input');
    newProp.placeholder = 'x';
    newProp.style.flex = '1';
    newProp.title = 'x, y, or properties.<key>';

    const newOp = document.createElement('select');
    newOp.style.flex = '0 0 70px';
    newOp.style.marginBottom = '0';
    for (const op of OPERATIONS) {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      newOp.appendChild(opt);
    }

    const newVal = this._el('input');
    newVal.placeholder = '0';
    newVal.style.flex = '0 0 50px';

    const addBtn = this._el('button', '', '+');
    addBtn.title = 'Add effect';
    addBtn.addEventListener('click', () => {
      const op = newOp.value;
      const isSpawn = op === 'spawn';
      const isDestroy = op === 'destroy';
      if (!isSpawn && !isDestroy && (!newTarget.value || !newProp.value)) return;
      const rawVal = newVal.value;
      const num = Number(rawVal);
      const spawnSpec = isSpawn
        ? { objectType: '', offsetX: 0, offsetY: 0, velocityX: 0, velocityY: 0, properties: {}, lifetime: 0 }
        : null;
      this._editor.addEffect(new BehaviorEffect({
        targetRef: newTarget.value || 'self',
        property: isSpawn || isDestroy ? '' : newProp.value,
        operation: op,
        value: isNaN(num) ? rawVal : num,
        spawnSpec,
      }));
      this.refresh();
    });

    addRow.appendChild(newTarget);
    addRow.appendChild(newProp);
    addRow.appendChild(newOp);
    addRow.appendChild(newVal);
    addRow.appendChild(addBtn);
    section.appendChild(addRow);

    this._content.appendChild(section);
  }

  _renderActions() {
    const section = this._el('div', 'section');
    section.appendChild(this._el('h3', '', 'Actions'));
    const row = this._el('div', 'row');

    const saveLibBtn = this._el('button', '', 'Save to Library');
    saveLibBtn.addEventListener('click', () => {
      this._editor.saveToLibrary();
      this.refresh();
    });
    row.appendChild(saveLibBtn);

    const exportBtn = this._el('button', '', 'Export JSON');
    exportBtn.addEventListener('click', () => {
      const json = this._editor.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `behavior_${this._editor.current.id}.json`;
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
        reader.onload = (e) => {
          try {
            this._editor.importJSON(e.target.result);
            this.refresh();
          } catch {
            alert('Failed to import: invalid behavior JSON');
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
    row.appendChild(importBtn);

    if (this._onBehaviorAssigned) {
      const assignBtn = this._el('button', 'accent', 'Assign to Object');
      assignBtn.title = 'Assign the current behavior to the selected object in the object editor';
      assignBtn.addEventListener('click', () => {
        const saved = this._editor.save();
        this._onBehaviorAssigned(saved);
      });
      row.appendChild(assignBtn);
    }

    section.appendChild(row);
    this._content.appendChild(section);
  }

  // ---- Utility ----

  /**
   * Create an element with an optional class name and text content.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   * @returns {HTMLElement}
   */
  _el(tag, className = '', text = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
}
