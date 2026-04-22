import { describe, it, expect, beforeEach } from 'vitest';
import { BehaviorEditor } from '../../src/objects/BehaviorEditor.js';
import { Behavior, STANDARD_BEHAVIORS } from '../../src/objects/Behavior.js';
import { BehaviorEffect } from '../../src/objects/BehaviorEffect.js';

describe('BehaviorEditor', () => {
  let editor;

  beforeEach(() => {
    editor = new BehaviorEditor();
  });

  // ---- Initial state ----

  it('starts with no current behavior and empty library', () => {
    expect(editor.current).toBe(null);
    expect(editor.library).toEqual([]);
  });

  // ---- Create ----

  it('createFromStandard clones a standard behavior by id', () => {
    editor.createFromStandard('move');
    expect(editor.current).toBeInstanceOf(Behavior);
    expect(editor.current.id).toBe('move');
    // must be a clone, not the shared instance
    expect(editor.current).not.toBe(STANDARD_BEHAVIORS.find(b => b.id === 'move'));
  });

  it('createFromStandard throws for unknown id', () => {
    expect(() => editor.createFromStandard('nonexistent')).toThrow();
  });

  it('createBlank creates a blank behavior', () => {
    editor.createBlank('custom_patrol', 'Custom Patrol');
    expect(editor.current).toBeInstanceOf(Behavior);
    expect(editor.current.id).toBe('custom_patrol');
    expect(editor.current.name).toBe('Custom Patrol');
    expect(editor.current.effects).toEqual([]);
    expect(editor.current.params).toEqual({});
  });

  // ---- Load ----

  it('load sets current to a clone of the given behavior', () => {
    const b = new Behavior({ id: 'b1', name: 'B1' });
    editor.load(b);
    expect(editor.current).toBeInstanceOf(Behavior);
    expect(editor.current).not.toBe(b);
    expect(editor.current.id).toBe('b1');
  });

  // ---- Save ----

  it('save returns a clone snapshot', () => {
    editor.createBlank('x', 'X');
    const saved = editor.save();
    expect(saved).toBeInstanceOf(Behavior);
    expect(saved).not.toBe(editor.current);
    expect(saved.id).toBe('x');
  });

  it('save throws when no current behavior', () => {
    expect(() => editor.save()).toThrow();
  });

  // ---- Library ----

  it('saveToLibrary pushes a clone into the library', () => {
    editor.createBlank('x', 'X');
    editor.saveToLibrary();
    expect(editor.library).toHaveLength(1);
    expect(editor.library[0]).not.toBe(editor.current);
    expect(editor.library[0].id).toBe('x');
  });

  it('loadFromLibrary sets current to a clone of the library entry', () => {
    editor.createBlank('y', 'Y');
    editor.saveToLibrary();
    editor.current = null;
    editor.loadFromLibrary(0);
    expect(editor.current).toBeInstanceOf(Behavior);
    expect(editor.current.id).toBe('y');
  });

  it('loadFromLibrary ignores out-of-range index', () => {
    editor.loadFromLibrary(99);
    expect(editor.current).toBe(null);
  });

  it('removeFromLibrary removes entry by index', () => {
    editor.createBlank('a', 'A');
    editor.saveToLibrary();
    editor.createBlank('b', 'B');
    editor.saveToLibrary();
    editor.removeFromLibrary(0);
    expect(editor.library).toHaveLength(1);
    expect(editor.library[0].id).toBe('b');
  });

  // ---- Edit fields ----

  it('setName changes current name', () => {
    editor.createBlank('x', 'X');
    editor.setName('Renamed');
    expect(editor.current.name).toBe('Renamed');
  });

  it('setAnimation changes current animation', () => {
    editor.createBlank('x', 'X');
    editor.setAnimation('run_cycle');
    expect(editor.current.animation).toBe('run_cycle');
  });

  it('setParam adds or updates a param', () => {
    editor.createBlank('x', 'X');
    editor.setParam('speed', 5);
    expect(editor.current.params.speed).toBe(5);
    editor.setParam('speed', 10);
    expect(editor.current.params.speed).toBe(10);
  });

  it('removeParam deletes a param', () => {
    editor.createBlank('x', 'X');
    editor.setParam('speed', 5);
    editor.removeParam('speed');
    expect('speed' in editor.current.params).toBe(false);
  });

  // ---- Effects ----

  it('addEffect appends a BehaviorEffect', () => {
    editor.createBlank('x', 'X');
    const eff = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    editor.addEffect(eff);
    expect(editor.current.effects).toHaveLength(1);
    expect(editor.current.effects[0]).toBe(eff);
  });

  it('removeEffect removes by index', () => {
    editor.createBlank('x', 'X');
    editor.addEffect(new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 }));
    editor.addEffect(new BehaviorEffect({ targetRef: 'self', property: 'y', operation: 'set', value: 0 }));
    editor.removeEffect(0);
    expect(editor.current.effects).toHaveLength(1);
    expect(editor.current.effects[0].property).toBe('y');
  });

  it('updateEffect patches fields of an effect by index', () => {
    editor.createBlank('x', 'X');
    editor.addEffect(new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 }));
    editor.updateEffect(0, { value: 42, operation: 'add' });
    expect(editor.current.effects[0].value).toBe(42);
    expect(editor.current.effects[0].operation).toBe('add');
  });

  it('addEffect / removeEffect / updateEffect throw when no current', () => {
    const eff = new BehaviorEffect({ targetRef: 'self', property: 'x', operation: 'set', value: 0 });
    expect(() => editor.addEffect(eff)).toThrow();
    expect(() => editor.removeEffect(0)).toThrow();
    expect(() => editor.updateEffect(0, {})).toThrow();
  });

  // ---- JSON import/export ----

  it('exportJSON returns a valid JSON string', () => {
    editor.createBlank('x', 'X');
    const json = editor.exportJSON();
    expect(() => JSON.parse(json)).not.toThrow();
    const data = JSON.parse(json);
    expect(data.id).toBe('x');
  });

  it('importJSON loads behavior from JSON string', () => {
    editor.createBlank('x', 'X');
    const json = editor.exportJSON();
    editor.current = null;
    editor.importJSON(json);
    expect(editor.current).toBeInstanceOf(Behavior);
    expect(editor.current.id).toBe('x');
  });
});
