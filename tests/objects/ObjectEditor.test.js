import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectEditor } from '../../src/objects/ObjectEditor.js';
import { GameObject, COLLISION_GROUP } from '../../src/objects/GameObject.js';
import { Behavior } from '../../src/objects/Behavior.js';
import { BehaviorTrigger } from '../../src/objects/BehaviorTrigger.js';

describe('ObjectEditor', () => {
  let editor;

  beforeEach(() => {
    editor = new ObjectEditor();
  });

  it('starts with no object loaded', () => {
    expect(editor.current).toBe(null);
  });

  it('creates a new object from a template type', () => {
    editor.createFromTemplate('enemy');
    expect(editor.current).not.toBe(null);
    expect(editor.current.type).toBe('enemy');
  });

  it('creates a blank object', () => {
    editor.createBlank('custom', 'My Object');
    expect(editor.current.type).toBe('custom');
    expect(editor.current.name).toBe('My Object');
  });

  it('loads an existing object', () => {
    const obj = new GameObject({ type: 'wall', name: 'Test Wall' });
    editor.load(obj);
    expect(editor.current.name).toBe('Test Wall');
  });

  it('load clones the object (edits do not mutate original)', () => {
    const obj = new GameObject({ type: 'wall', name: 'Test Wall' });
    editor.load(obj);
    editor.setName('Modified');
    expect(obj.name).toBe('Test Wall');
    expect(editor.current.name).toBe('Modified');
  });

  it('setName updates current object name', () => {
    editor.createBlank('custom', 'Old');
    editor.setName('New');
    expect(editor.current.name).toBe('New');
  });

  it('setCollisionGroup updates group', () => {
    editor.createBlank('custom', 'Obj');
    editor.setCollisionGroup(COLLISION_GROUP.ENEMY);
    expect(editor.current.collisionGroup).toBe(COLLISION_GROUP.ENEMY);
  });

  it('setCollisionMask updates mask', () => {
    editor.createBlank('custom', 'Obj');
    editor.setCollisionMask(COLLISION_GROUP.PLAYER | COLLISION_GROUP.ENVIRONMENT);
    expect(editor.current.collisionMask & COLLISION_GROUP.PLAYER).toBeTruthy();
  });

  it('addBehavior appends a behavior', () => {
    editor.createBlank('custom', 'Obj');
    editor.addBehavior(new Behavior({ id: 'move', name: 'Move' }));
    // idle is auto-included; move is added on top
    expect(editor.current.behaviors.some((b) => b.id === 'move')).toBe(true);
  });

  it('removeBehavior removes by id', () => {
    editor.createBlank('custom', 'Obj');
    editor.addBehavior(new Behavior({ id: 'move', name: 'Move' }));
    editor.removeBehavior('move');
    expect(editor.current.behaviors.every((b) => b.id !== 'move')).toBe(true);
    // idle remains after removing move
    expect(editor.current.behaviors.some((b) => b.id === 'idle')).toBe(true);
  });

  it('addTrigger appends a trigger', () => {
    editor.createBlank('custom', 'Obj');
    editor.addBehavior(new Behavior({ id: 'move', name: 'Move' }));
    editor.addTrigger(new BehaviorTrigger({ type: 'proximity', behaviorId: 'move' }));
    expect(editor.current.triggers).toHaveLength(1);
  });

  it('removeTrigger removes by index', () => {
    editor.createBlank('custom', 'Obj');
    editor.addTrigger(new BehaviorTrigger({ type: 'timer', behaviorId: 'die' }));
    editor.removeTrigger(0);
    expect(editor.current.triggers).toHaveLength(0);
  });

  it('setProperty sets arbitrary properties', () => {
    editor.createBlank('custom', 'Obj');
    editor.setProperty('hp', 10);
    expect(editor.current.properties.hp).toBe(10);
  });

  it('save returns a cloned snapshot', () => {
    editor.createBlank('custom', 'Obj');
    editor.setProperty('hp', 5);
    const saved = editor.save();
    editor.setProperty('hp', 99);
    expect(saved.properties.hp).toBe(5);
  });

  it('exportJSON returns valid JSON string', () => {
    editor.createBlank('custom', 'Obj');
    const json = editor.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('custom');
  });

  it('importJSON loads from JSON string', () => {
    editor.createBlank('enemy', 'Slime');
    editor.setProperty('hp', 3);
    const json = editor.exportJSON();

    const editor2 = new ObjectEditor();
    editor2.importJSON(json);
    expect(editor2.current.type).toBe('enemy');
    expect(editor2.current.properties.hp).toBe(3);
  });

  it('throws when editing with no object loaded', () => {
    expect(() => editor.setName('x')).toThrow();
  });

  it('manages a library of saved objects', () => {
    editor.createBlank('custom', 'Obj A');
    editor.saveToLibrary();
    editor.createBlank('custom', 'Obj B');
    editor.saveToLibrary();

    expect(editor.library).toHaveLength(2);
    expect(editor.library[0].name).toBe('Obj A');
    expect(editor.library[1].name).toBe('Obj B');
  });

  it('loads from library by index', () => {
    editor.createBlank('custom', 'Obj A');
    editor.saveToLibrary();
    editor.createBlank('custom', 'Obj B');

    editor.loadFromLibrary(0);
    expect(editor.current.name).toBe('Obj A');
  });

  it('removeFromLibrary removes by index', () => {
    editor.createBlank('custom', 'Obj A');
    editor.saveToLibrary();
    editor.removeFromLibrary(0);
    expect(editor.library).toHaveLength(0);
  });

  // ---- Idle behavior ----

  it('createBlank automatically includes an idle behavior', () => {
    editor.createBlank('custom', 'Obj');
    const ids = editor.current.behaviors.map((b) => b.id);
    expect(ids).toContain('idle');
  });

  it('createFromTemplate automatically includes an idle behavior', () => {
    editor.createFromTemplate('enemy');
    const ids = editor.current.behaviors.map((b) => b.id);
    expect(ids).toContain('idle');
  });

  // ---- setBehaviorAnimation ----

  it('setBehaviorAnimation sets animation on an existing behavior', () => {
    editor.createBlank('custom', 'Obj');
    editor.addBehavior(new Behavior({ id: 'move', name: 'Move' }));
    editor.setBehaviorAnimation('move', 'walk_cycle');
    const b = editor.current.behaviors.find((bh) => bh.id === 'move');
    expect(b.animation).toBe('walk_cycle');
  });

  it('setBehaviorAnimation can configure the idle behavior animation', () => {
    editor.createBlank('custom', 'Obj');
    editor.setBehaviorAnimation('idle', 'my_idle_anim');
    const b = editor.current.behaviors.find((bh) => bh.id === 'idle');
    expect(b.animation).toBe('my_idle_anim');
  });

  it('setBehaviorAnimation does nothing for unknown behavior id', () => {
    editor.createBlank('custom', 'Obj');
    expect(() => editor.setBehaviorAnimation('nonexistent', 'anim')).not.toThrow();
  });

  it('setBehaviorAnimation throws when no object is loaded', () => {
    expect(() => editor.setBehaviorAnimation('idle', 'anim')).toThrow();
  });
});
