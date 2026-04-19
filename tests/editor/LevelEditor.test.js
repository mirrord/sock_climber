import { describe, it, expect, beforeEach } from 'vitest';
import { LevelEditor } from '../../src/editor/LevelEditor.js';

describe('LevelEditor', () => {
  let editor;

  beforeEach(() => {
    editor = new LevelEditor(20, 15);
  });

  it('initializes with an empty level of given size', () => {
    expect(editor.level.width).toBe(20);
    expect(editor.level.height).toBe(15);
    expect(editor.mode).toBe('edit');
  });

  it('toggles between edit and play mode', () => {
    expect(editor.mode).toBe('edit');
    editor.toggleMode();
    expect(editor.mode).toBe('play');
    editor.toggleMode();
    expect(editor.mode).toBe('edit');
  });

  it('resizes the level', () => {
    editor.resize(40, 30);
    expect(editor.level.width).toBe(40);
    expect(editor.level.height).toBe(30);
  });

  it('exports and imports level JSON', () => {
    editor.resize(25, 18);
    const json = editor.exportJSON();
    const editor2 = new LevelEditor(1, 1);
    editor2.importJSON(json);
    expect(editor2.level.width).toBe(25);
    expect(editor2.level.height).toBe(18);
  });

  it('clears the level without throwing', () => {
    editor.clearLevel();
    expect(editor.level.width).toBe(20);
  });

  it('adds a background layer', () => {
    editor.addBackgroundLayer('sky.png', 0.5);
    expect(editor.level.backgroundLayers).toHaveLength(1);
    expect(editor.level.backgroundLayers[0].url).toBe('sky.png');
    expect(editor.level.backgroundLayers[0].parallax).toBe(0.5);
  });

  it('removes a background layer by index', () => {
    editor.addBackgroundLayer('sky.png', 0.5);
    editor.addBackgroundLayer('clouds.png', 0.3);
    editor.removeBackgroundLayer(0);
    expect(editor.level.backgroundLayers).toHaveLength(1);
    expect(editor.level.backgroundLayers[0].url).toBe('clouds.png');
  });

  it('updates a background layer', () => {
    editor.addBackgroundLayer('sky.png', 0.5);
    editor.updateBackgroundLayer(0, 'newsky.png', 0.8);
    expect(editor.level.backgroundLayers[0].url).toBe('newsky.png');
    expect(editor.level.backgroundLayers[0].parallax).toBe(0.8);
  });

  it('clamps parallax to [0, 1] range', () => {
    editor.addBackgroundLayer('bg.png', 1.5);
    expect(editor.level.backgroundLayers[0].parallax).toBe(1);
    editor.addBackgroundLayer('bg2.png', -0.2);
    expect(editor.level.backgroundLayers[1].parallax).toBe(0);
  });

  it('persists background layers through JSON round-trip', () => {
    editor.addBackgroundLayer('sky.png', 0.4);
    const json = editor.exportJSON();
    const editor2 = new LevelEditor(1, 1);
    editor2.importJSON(json);
    expect(editor2.level.backgroundLayers).toHaveLength(1);
    expect(editor2.level.backgroundLayers[0].url).toBe('sky.png');
    expect(editor2.level.backgroundLayers[0].parallax).toBe(0.4);
  });
});

describe('LevelEditor object placement', () => {
  let editor;

  beforeEach(() => {
    editor = new LevelEditor(20, 15);
  });

  it('placeObject places an object in the level and returns an id', () => {
    const id = editor.placeObject('player', 5, 3);
    expect(typeof id).toBe('string');
    expect(editor.level.objects).toHaveLength(1);
    expect(editor.level.objects[0]).toMatchObject({ type: 'player', x: 5, y: 3 });
  });

  it('placeObject forwards properties', () => {
    editor.placeObject('enemy', 1, 2, { hp: 5 });
    expect(editor.level.objects[0].properties.hp).toBe(5);
  });

  it('removeObject removes the object from the level', () => {
    const id = editor.placeObject('player', 0, 0);
    editor.removeObject(id);
    expect(editor.level.objects).toHaveLength(0);
  });

  it('getObjects returns a copy of the placed objects array', () => {
    editor.placeObject('player', 2, 2);
    const objs = editor.getObjects();
    expect(objs).toHaveLength(1);
    objs.push({ type: 'fake' });
    expect(editor.level.objects).toHaveLength(1);
  });

  it('validateLevel returns invalid when no player placed', () => {
    const result = editor.validateLevel();
    expect(result.valid).toBe(false);
  });

  it('validateLevel returns valid when exactly 1 player placed', () => {
    editor.placeObject('player', 5, 5);
    const result = editor.validateLevel();
    expect(result.valid).toBe(true);
  });

  it('placeObject and removeObject round-trip through exportJSON/importJSON', () => {
    editor.placeObject('player', 3, 7);
    const json = editor.exportJSON();
    const editor2 = new LevelEditor(1, 1);
    editor2.importJSON(json);
    expect(editor2.level.objects).toHaveLength(1);
    expect(editor2.level.objects[0]).toMatchObject({ type: 'player', x: 3, y: 7 });
  });

  it('placing a second player replaces the first (unique-type enforcement)', () => {
    editor.placeObject('player', 0, 0);
    editor.placeObject('player', 3, 7);
    const players = editor.level.objects.filter(o => o.type === 'player');
    expect(players).toHaveLength(1);
    expect(players[0].x).toBe(3);
    expect(players[0].y).toBe(7);
  });

  it('placing a non-unique type does not replace existing objects of that type', () => {
    editor.placeObject('enemy', 0, 0);
    editor.placeObject('enemy', 5, 5);
    const enemies = editor.level.objects.filter(o => o.type === 'enemy');
    expect(enemies).toHaveLength(2);
  });

  it('getObjectAt returns the topmost object at grid coordinates', () => {
    editor.placeObject('enemy', 2, 3);
    const found = editor.getObjectAt(2, 3);
    expect(found).not.toBeNull();
    expect(found.type).toBe('enemy');
  });

  it('getObjectAt returns null when no object at that position', () => {
    expect(editor.getObjectAt(0, 0)).toBeNull();
  });
});
