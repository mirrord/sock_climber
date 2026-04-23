// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ObjectEditorUI } from '../../src/editor/ObjectEditorUI.js';
import { ObjectEditor } from '../../src/objects/ObjectEditor.js';

function makeUI(callbackOverrides = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new ObjectEditor();
  const ui = new ObjectEditorUI(container, editor, callbackOverrides);
  return { container, editor, ui };
}

describe('ObjectEditorUI', () => {
  let container, editor, ui;

  afterEach(() => {
    ui.dispose();
    container.remove();
  });

  // ---- Custom named behavior creation form ----

  describe('custom behavior creation form in Behaviors section', () => {
    beforeEach(() => {
      ({ container, editor, ui } = makeUI());
      editor.createBlank('custom', 'Test Object');
      ui.show();
    });

    it('renders a Name input with placeholder "Name…"', () => {
      const inputs = container.querySelectorAll('input[placeholder="Name…"]');
      expect(inputs.length).toBe(1);
    });

    it('renders an ID input with placeholder "id (auto)"', () => {
      const inputs = container.querySelectorAll('input[placeholder="id (auto)"]');
      expect(inputs.length).toBe(1);
    });

    it('renders a "+ Custom" button', () => {
      const btns = Array.from(container.querySelectorAll('button'));
      expect(btns.some((b) => b.textContent.includes('Custom'))).toBe(true);
    });

    it('clicking Custom adds a behavior with the given name to the object', () => {
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      nameInput.value = 'Spin';
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      expect(editor.current.behaviors.some((b) => b.name === 'Spin')).toBe(true);
    });

    it('clicking Custom with a provided ID uses that ID', () => {
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      const idInput = container.querySelector('input[placeholder="id (auto)"]');
      nameInput.value = 'Wobble';
      idInput.value = 'wobble_42';
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      expect(editor.current.behaviors.some((b) => b.id === 'wobble_42')).toBe(true);
    });

    it('clicking Custom with blank name falls back to "New Behavior"', () => {
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      expect(editor.current.behaviors.some((b) => b.name === 'New Behavior')).toBe(true);
    });

    it('clicking Custom with blank ID auto-generates one starting with "custom_"', () => {
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      nameInput.value = 'AutoId';
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      const added = editor.current.behaviors.find((b) => b.name === 'AutoId');
      expect(added).toBeDefined();
      expect(added.id).toMatch(/^custom_/);
    });

    it('inputs are cleared after a successful creation', () => {
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      const idInput = container.querySelector('input[placeholder="id (auto)"]');
      nameInput.value = 'ClearMe';
      idInput.value = 'clear_id';
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      // After refresh, inputs are re-rendered blank
      const newNameInput = container.querySelector('input[placeholder="Name…"]');
      const newIdInput = container.querySelector('input[placeholder="id (auto)"]');
      expect(newNameInput.value).toBe('');
      expect(newIdInput.value).toBe('');
    });

    it('custom behavior is listed in the behaviors section after creation', () => {
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      nameInput.value = 'Bounce';
      const customBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Custom'));
      customBtn.click();
      expect(container.querySelector('#oe-content').textContent).toContain('Bounce');
    });
  });

  // ---- Accessible Variables section ----

  describe('_renderAccessibleVariables', () => {
    beforeEach(() => {
      ({ container, editor, ui } = makeUI());
      editor.createBlank('custom', 'VarTestObj');
      ui.show();
    });

    it('renders the "Accessible Variables" heading when an object is loaded', () => {
      const headings = Array.from(container.querySelectorAll('h3'));
      expect(headings.some((h) => h.textContent.includes('Accessible Variables'))).toBe(true);
    });

    it('shows standard built-in variable tags: x, y, name, type, id', () => {
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('x');
      expect(tags).toContain('y');
      expect(tags).toContain('name');
      expect(tags).toContain('type');
      expect(tags).toContain('id');
    });

    it('shows velocityX and velocityY in built-ins', () => {
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('velocityX');
      expect(tags).toContain('velocityY');
    });

    it('shows collisionGroup and collisionMask in built-ins', () => {
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('collisionGroup');
      expect(tags).toContain('collisionMask');
    });

    it('shows "No custom properties" when properties are empty', () => {
      expect(container.querySelector('#oe-content').textContent).toContain('No custom properties');
    });

    it('shows properties.<key> tags after adding custom properties', () => {
      // Add a property and refresh
      editor.setProperty('health', 100);
      editor.setProperty('speed', 3);
      ui.refresh();
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('properties.health');
      expect(tags).toContain('properties.speed');
    });

    it('does not show the Accessible Variables section when no object is loaded', () => {
      // editor.current is null
      editor.current = null;
      ui.refresh();
      const headings = Array.from(container.querySelectorAll('h3'));
      expect(headings.some((h) => h.textContent.includes('Accessible Variables'))).toBe(false);
    });
  });

  // ---- Auto-save (no explicit Save to Library button) ----

  describe('auto-save on edit', () => {
    beforeEach(() => {
      ({ container, editor, ui } = makeUI());
    });

    it('does not render a "Save to Library" button', () => {
      editor.createBlank('custom', 'MyObj');
      ui.show();
      const btns = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
      expect(btns.every((t) => !t.includes('Save to Library'))).toBe(true);
    });

    it('creating a blank object immediately adds it to the library', () => {
      const blankBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Blank'));
      // panel must be shown so buttons are rendered
      ui.show();
      const blankBtn2 = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Blank'));
      blankBtn2.click();
      expect(editor.library.length).toBe(1);
    });

    it('name change immediately updates the library entry', () => {
      // Simulate the production flow: click the Blank button (which sets _currentLibIdx)
      ui.show();
      const blankBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Blank'));
      blankBtn.click();
      const nameInput = container.querySelector('input');
      nameInput.value = 'Renamed';
      nameInput.dispatchEvent(new Event('change'));
      expect(editor.library[0].name).toBe('Renamed');
    });

    it('adding a behavior immediately updates the library entry', () => {
      ui.show();
      const blankBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Blank'));
      blankBtn.click();
      const addBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent === '+ Add');
      addBtn.click();
      expect(editor.library[0].behaviors.length).toBeGreaterThan(0);
    });
  });
});
