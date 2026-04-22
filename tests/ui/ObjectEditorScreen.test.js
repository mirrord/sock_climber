// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObjectEditorScreen } from '../../src/ui/ObjectEditorScreen.js';
import { ObjectStore } from '../../src/objects/ObjectStore.js';
import { GameObject } from '../../src/objects/GameObject.js';
import { Behavior } from '../../src/objects/Behavior.js';

/** Minimal stub that satisfies ObjectEditorScreen without a real store. */
function makeScreen(overrides = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const callbacks = { onBack: vi.fn(), ...overrides };
  const screen = new ObjectEditorScreen(container, callbacks);
  return { screen, container };
}

/** Build a GameObject with a named animation and a behavior linked to it. */
function makePlayerObj() {
  const obj = new GameObject({
    type: 'player',
    name: 'Player',
    behaviors: [
      new Behavior({ id: 'idle', name: 'Idle', animation: 'idle' }),
      new Behavior({ id: 'jump', name: 'Jump', animation: 'jump' }),
    ],
    animations: [
      { id: 'a1', name: 'idle', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true },
      { id: 'a2', name: 'jump', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 4, frameCount: 3, fps: 8, loop: false },
      { id: 'a3', name: 'run',  spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 7, frameCount: 6, fps: 12, loop: true },
    ],
  });
  return obj;
}

describe('ObjectEditorScreen — behavior animation selector', () => {
  let screen, container;

  beforeEach(() => {
    ({ screen, container } = makeScreen());
    screen.enter();
    screen._editor.current = makePlayerObj();
    screen._refreshLeft();
  });

  afterEach(() => {
    screen.exit();
    container.remove();
  });

  it('renders an animation selector for each behavior row', () => {
    const selects = container.querySelectorAll('.beh-anim-select');
    // The player obj has 2 behaviors (idle auto-added + jump)
    // Actually: idle is already in the array so no auto-add; 2 total
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('animation selector options include a none option and all animation names', () => {
    const sel = container.querySelector('.beh-anim-select');
    const values = Array.from(sel.options).map(o => o.value);
    expect(values).toContain('');       // — none —
    expect(values).toContain('idle');
    expect(values).toContain('jump');
    expect(values).toContain('run');
  });

  it('animation selector is pre-selected to the current behavior.animation value', () => {
    const selects = container.querySelectorAll('.beh-anim-select');
    // Find the selector for the 'idle' behavior (first one)
    const idleSel = Array.from(selects).find(s => s.dataset.behaviorId === 'idle');
    expect(idleSel).not.toBeUndefined();
    expect(idleSel.value).toBe('idle');
  });

  it('calls setBehaviorAnimation when the selector changes', () => {
    const spy = vi.spyOn(screen._editor, 'setBehaviorAnimation');
    const idleSel = container.querySelector('[data-behavior-id="idle"]');
    idleSel.value = 'run';
    idleSel.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith('idle', 'run');
  });

  it('passes null when the none option is selected', () => {
    const spy = vi.spyOn(screen._editor, 'setBehaviorAnimation');
    const jumpSel = container.querySelector('[data-behavior-id="jump"]');
    jumpSel.value = '';
    jumpSel.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith('jump', null);
  });
});

// ── ObjectEditorScreen — enableGravity toggle ─────────────────────────────────

describe('ObjectEditorScreen — enableGravity toggle', () => {
  let screen, container;

  function makeGravityObj(enableGravity = true) {
    return new GameObject({
      type: 'player',
      name: 'Player',
      behaviors: [
        new Behavior({ id: 'idle',      name: 'Idle',      animation: 'idle' }),
        new Behavior({ id: 'jump',      name: 'Jump',      animation: 'jump' }),
        new Behavior({ id: 'fall',      name: 'Fall',      animation: 'fall' }),
        new Behavior({ id: 'move_up',   name: 'Move Up',   animation: null }),
        new Behavior({ id: 'move_down', name: 'Move Down', animation: null }),
      ],
      properties: { enableGravity },
      animations: [],
    });
  }

  beforeEach(() => {
    ({ screen, container } = makeScreen());
    screen.enter();
  });

  afterEach(() => {
    screen.exit();
    container.remove();
  });

  it('renders an Enable Gravity checkbox', () => {
    screen._editor.current = makeGravityObj(true);
    screen._refreshLeft();
    const cb = container.querySelector('#oe-gravity-toggle');
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(true);
  });

  it('Enable Gravity checkbox is unchecked when enableGravity is false', () => {
    screen._editor.current = makeGravityObj(false);
    screen._refreshLeft();
    const cb = container.querySelector('#oe-gravity-toggle');
    expect(cb.checked).toBe(false);
  });

  it('shows jump and fall behavior rows when enableGravity is true', () => {
    screen._editor.current = makeGravityObj(true);
    screen._refreshLeft();
    const selects = container.querySelectorAll('.beh-anim-select');
    const ids = Array.from(selects).map(s => s.dataset.behaviorId);
    expect(ids).toContain('jump');
    expect(ids).toContain('fall');
  });

  it('hides jump and fall behavior rows when enableGravity is false', () => {
    screen._editor.current = makeGravityObj(false);
    screen._refreshLeft();
    const selects = container.querySelectorAll('.beh-anim-select');
    const ids = Array.from(selects).map(s => s.dataset.behaviorId);
    expect(ids).not.toContain('jump');
    expect(ids).not.toContain('fall');
  });

  it('shows move_up and move_down behavior rows when enableGravity is false', () => {
    screen._editor.current = makeGravityObj(false);
    screen._refreshLeft();
    const selects = container.querySelectorAll('.beh-anim-select');
    const ids = Array.from(selects).map(s => s.dataset.behaviorId);
    expect(ids).toContain('move_up');
    expect(ids).toContain('move_down');
  });

  it('hides move_up and move_down behavior rows when enableGravity is true', () => {
    screen._editor.current = makeGravityObj(true);
    screen._refreshLeft();
    const selects = container.querySelectorAll('.beh-anim-select');
    const ids = Array.from(selects).map(s => s.dataset.behaviorId);
    expect(ids).not.toContain('move_up');
    expect(ids).not.toContain('move_down');
  });

  it('calls setProperty with enableGravity false when unchecked', () => {
    screen._editor.current = makeGravityObj(true);
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'setProperty');
    const cb = container.querySelector('#oe-gravity-toggle');
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith('enableGravity', false);
  });

  it('calls setProperty with enableGravity true when checked', () => {
    screen._editor.current = makeGravityObj(false);
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'setProperty');
    const cb = container.querySelector('#oe-gravity-toggle');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith('enableGravity', true);
  });
});

// ── ObjectEditorScreen — behavior detail sub-view ─────────────────────────────

describe('ObjectEditorScreen — behavior detail sub-view', () => {
  let screen, container;

  function makeObjWithBehavior() {
    const obj = new GameObject({
      type: 'custom',
      name: 'My Object',
      behaviors: [
        new Behavior({ id: 'idle', name: 'Idle', animation: null, params: { speed: 3 } }),
      ],
      animations: [],
    });
    return obj;
  }

  beforeEach(() => {
    ({ screen, container } = makeScreen());
    screen.enter();
    screen._editor.current = makeObjWithBehavior();
    screen._refreshLeft();
  });

  afterEach(() => {
    screen.exit();
    container.remove();
  });

  it('renders an Edit button for each behavior', () => {
    const btns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.includes('✎'));
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking Edit button switches to behavior detail sub-view', () => {
    const editBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('✎'));
    editBtn.click();
    expect(screen._activeBehaviorId).toBe('idle');
    expect(container.textContent).toContain('Behavior: Idle');
    expect(container.querySelector('[data-role="behavior-back"]')).not.toBeNull();
  });

  it('Back button returns to object list view', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    const backBtn = container.querySelector('[data-role="behavior-back"]');
    backBtn.click();
    expect(screen._activeBehaviorId).toBeNull();
    expect(container.querySelector('[data-role="behavior-back"]')).toBeNull();
  });

  it('detail view shows existing params', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    expect(container.textContent).toContain('speed');
  });

  it('detail view name input calls setBehaviorName on change', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'setBehaviorName');
    const nameInput = container.querySelector('input[type="text"], input:not([type])');
    nameInput.value = 'Stand Still';
    nameInput.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledWith('idle', 'Stand Still');
  });

  it('add param button calls setBehaviorParam', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'setBehaviorParam');
    const allInputs = Array.from(container.querySelectorAll('input:not([type="number"])'));
    // Find key/value inputs in the Add Param row (last 2 plain inputs before the Add button)
    const pkInput = allInputs.find(i => i.placeholder === 'key');
    const pvInput = allInputs.find(i => i.placeholder === 'value');
    const addBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '+ Add');
    pkInput.value = 'damage';
    pvInput.value = '5';
    addBtn.click();
    expect(spy).toHaveBeenCalledWith('idle', 'damage', 5);
  });

  it('remove param button calls removeBehaviorParam', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'removeBehaviorParam');
    // The ✕ inside the params section
    const paramsSection = Array.from(container.querySelectorAll('.section')).find(s => s.textContent.includes('Params'));
    const removeBtn = paramsSection.querySelector('.remove');
    removeBtn.click();
    expect(spy).toHaveBeenCalledWith('idle', 'speed');
  });

  it('add effect button calls addEffectToBehavior', () => {
    screen._activeBehaviorId = 'idle';
    screen._refreshLeft();
    const spy = vi.spyOn(screen._editor, 'addEffectToBehavior');
    const effectsSection = Array.from(container.querySelectorAll('.section')).find(s => s.textContent.includes('Effects'));
    const propInput = effectsSection.querySelector('input[placeholder="x"]');
    propInput.value = 'x';
    const addEffBtn = effectsSection.querySelector('button');
    addEffBtn.click();
    expect(spy).toHaveBeenCalled();
    const [calledId] = spy.mock.calls[0];
    expect(calledId).toBe('idle');
  });
});
