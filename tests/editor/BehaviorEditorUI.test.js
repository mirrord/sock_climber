// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BehaviorEditorUI } from '../../src/editor/BehaviorEditorUI.js';
import { BehaviorEditor } from '../../src/objects/BehaviorEditor.js';

function makeUI() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new BehaviorEditor();
  const ui = new BehaviorEditorUI(container, editor);
  return { container, editor, ui };
}

function makeObject(properties = {}) {
  return {
    id: 'obj_1',
    name: 'TestObj',
    type: 'enemy',
    collisionGroup: 0,
    collisionMask: 0,
    properties,
    behaviors: [],
    triggers: [],
  };
}

describe('BehaviorEditorUI', () => {
  let container, editor, ui;

  beforeEach(() => {
    ({ container, editor, ui } = makeUI());
  });

  afterEach(() => {
    ui.dispose();
    container.remove();
  });

  // ---- Custom named behavior creation ----

  describe('custom behavior creation form', () => {
    it('renders a Name input in the library section', () => {
      ui.show();
      const inputs = container.querySelectorAll('input[placeholder="Name…"]');
      expect(inputs.length).toBe(1);
    });

    it('renders an ID input with placeholder "id (auto)"', () => {
      ui.show();
      const inputs = container.querySelectorAll('input[placeholder="id (auto)"]');
      expect(inputs.length).toBe(1);
    });

    it('renders a Create button', () => {
      ui.show();
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.some((b) => b.textContent.includes('Create'))).toBe(true);
    });

    it('clicking Create with a name sets current behavior name', () => {
      ui.show();
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      nameInput.value = 'My Behavior';
      const createBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Create'));
      createBtn.click();
      expect(editor.current).not.toBeNull();
      expect(editor.current.name).toBe('My Behavior');
    });

    it('clicking Create with a custom ID uses that ID', () => {
      ui.show();
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      const idInput = container.querySelector('input[placeholder="id (auto)"]');
      nameInput.value = 'Bounce';
      idInput.value = 'bounce_001';
      const createBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Create'));
      createBtn.click();
      expect(editor.current.id).toBe('bounce_001');
    });

    it('clicking Create with blank name falls back to "New Behavior"', () => {
      ui.show();
      const createBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Create'));
      createBtn.click();
      expect(editor.current.name).toBe('New Behavior');
    });

    it('clicking Create with blank ID auto-generates one starting with "custom_"', () => {
      ui.show();
      const nameInput = container.querySelector('input[placeholder="Name…"]');
      nameInput.value = 'AutoId Test';
      const createBtn = Array.from(container.querySelectorAll('button'))
        .find((b) => b.textContent.includes('Create'));
      createBtn.click();
      expect(editor.current.id).toMatch(/^custom_/);
    });
  });

  // ---- Member variables section ----

  describe('_renderMemberVariables (Accessible Variables section)', () => {
    it('renders the "Accessible Variables" heading when a behavior is loaded', () => {
      editor.createBlank('test_id', 'Test');
      ui.show();
      const headings = Array.from(container.querySelectorAll('h3'));
      expect(headings.some((h) => h.textContent.includes('Accessible Variables'))).toBe(true);
    });

    it('shows built-in variable tags (x, y, name, type, id)', () => {
      editor.createBlank('test_id', 'Test');
      ui.show();
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('x');
      expect(tags).toContain('y');
      expect(tags).toContain('name');
      expect(tags).toContain('type');
      expect(tags).toContain('id');
    });

    it('shows velocityX and velocityY in built-ins', () => {
      editor.createBlank('test_id', 'Test');
      ui.show();
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('velocityX');
      expect(tags).toContain('velocityY');
    });

    it('shows "Open via object editor" hint when no context object is set', () => {
      editor.createBlank('test_id', 'Test');
      ui.show();
      const panel = container.querySelector('#behavior-editor-panel');
      expect(panel.textContent).toContain('Open via object editor');
    });

    it('shows custom properties as properties.<key> tags when context object is set', () => {
      editor.createBlank('test_id', 'Test');
      ui.setContext(makeObject({ health: 100, speed: 4 }));
      ui.show();
      const tags = Array.from(container.querySelectorAll('.tag')).map((t) => t.textContent);
      expect(tags).toContain('properties.health');
      expect(tags).toContain('properties.speed');
    });

    it('shows "No custom properties" message when context object has empty properties', () => {
      editor.createBlank('test_id', 'Test');
      ui.setContext(makeObject({}));
      ui.show();
      const panel = container.querySelector('#behavior-editor-panel');
      expect(panel.textContent).toContain('No custom properties');
    });

    it('does not show the Accessible Variables section when no behavior is loaded', () => {
      // editor.current is null
      ui.show();
      const headings = Array.from(container.querySelectorAll('h3'));
      expect(headings.some((h) => h.textContent.includes('Accessible Variables'))).toBe(false);
    });

    it('setContext clears on null', () => {
      editor.createBlank('test_id', 'Test');
      ui.setContext(makeObject({ foo: 1 }));
      ui.setContext(null);
      ui.show();
      const panel = container.querySelector('#behavior-editor-panel');
      expect(panel.textContent).toContain('Open via object editor');
      expect(panel.textContent).not.toContain('properties.foo');
    });
  });
});
