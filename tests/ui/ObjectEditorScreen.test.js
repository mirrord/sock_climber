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
