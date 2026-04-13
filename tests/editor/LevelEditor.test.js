import { describe, it, expect, beforeEach } from 'vitest';
import { LevelEditor } from '../../src/editor/LevelEditor.js';
import { Level, TILE } from '../../src/level/Level.js';

describe('LevelEditor', () => {
  let editor;

  beforeEach(() => {
    editor = new LevelEditor(20, 15);
  });

  it('initializes with an empty level of given size', () => {
    expect(editor.level.width).toBe(20);
    expect(editor.level.height).toBe(15);
    expect(editor.selectedTile).toBe(TILE.SOLID);
    expect(editor.mode).toBe('edit');
  });

  it('places a tile at grid coordinates', () => {
    editor.paint(3, 4);
    expect(editor.level.getTile(3, 4)).toBe(TILE.SOLID);
  });

  it('erases a tile at grid coordinates', () => {
    editor.paint(3, 4);
    editor.erase(3, 4);
    expect(editor.level.getTile(3, 4)).toBe(TILE.EMPTY);
  });

  it('selects different tile types', () => {
    editor.selectTile(TILE.HAZARD);
    expect(editor.selectedTile).toBe(TILE.HAZARD);
    editor.paint(1, 1);
    expect(editor.level.getTile(1, 1)).toBe(TILE.HAZARD);
  });

  it('enforces single spawn point', () => {
    editor.selectTile(TILE.SPAWN);
    editor.paint(2, 2);
    editor.paint(4, 4);
    // First spawn should be cleared
    expect(editor.level.getTile(2, 2)).toBe(TILE.EMPTY);
    expect(editor.level.getTile(4, 4)).toBe(TILE.SPAWN);
  });

  it('toggles between edit and play mode', () => {
    expect(editor.mode).toBe('edit');
    editor.toggleMode();
    expect(editor.mode).toBe('play');
    editor.toggleMode();
    expect(editor.mode).toBe('edit');
  });

  it('exports and imports level JSON', () => {
    editor.paint(5, 5);
    const json = editor.exportJSON();
    
    const editor2 = new LevelEditor(1, 1);
    editor2.importJSON(json);
    expect(editor2.level.width).toBe(20);
    expect(editor2.level.height).toBe(15);
    expect(editor2.level.getTile(5, 5)).toBe(TILE.SOLID);
  });

  it('clears the level', () => {
    editor.paint(1, 1);
    editor.paint(2, 2);
    editor.clearLevel();
    expect(editor.level.getTile(1, 1)).toBe(TILE.EMPTY);
    expect(editor.level.getTile(2, 2)).toBe(TILE.EMPTY);
  });

  it('has undo support', () => {
    editor.paint(1, 1);
    editor.paint(2, 2);
    editor.undo();
    expect(editor.level.getTile(2, 2)).toBe(TILE.EMPTY);
    expect(editor.level.getTile(1, 1)).toBe(TILE.SOLID);
  });

  it('undo does nothing when history is empty', () => {
    editor.undo(); // should not throw
    expect(editor.level.getTile(0, 0)).toBe(TILE.EMPTY);
  });
});
