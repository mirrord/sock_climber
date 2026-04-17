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
