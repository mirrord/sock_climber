// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpriteAnimationManager } from '../../src/ui/SpriteAnimationManager.js';

describe('SpriteAnimationManager', () => {
  let container;

  function makeCallbacks(overrides = {}) {
    const animations = overrides.animations ?? [];
    const sheets = overrides.sheets ?? [];
    return {
      getAnimations: () => animations,
      addAnimation: overrides.addAnimation ?? ((a) => animations.push(a)),
      removeAnimation:
        overrides.removeAnimation ??
        ((id) => {
          const idx = animations.findIndex((a) => a.id === id);
          if (idx !== -1) animations.splice(idx, 1);
        }),
      updateAnimation:
        overrides.updateAnimation ??
        ((id, patch) => {
          const anim = animations.find((a) => a.id === id);
          if (anim) Object.assign(anim, patch);
        }),
      getSpriteSheets: () => sheets,
      addSpriteSheet: overrides.addSpriteSheet ?? ((s) => sheets.push(s)),
    };
  }

  beforeEach(() => {
    container = document.createElement('div');
  });

  // ---- Root element ----

  it('renders a root element into the container', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-root')).not.toBe(null);
  });

  // ---- Empty / populated states ----

  it('shows empty state message when there are no animations', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-empty')).not.toBe(null);
  });

  it('hides empty state when animations exist', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
        ],
      }),
    );
    sam.render();
    expect(container.querySelector('.sam-empty')).toBe(null);
  });

  it('renders one card per animation', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
          {
            id: 'a2',
            name: 'run',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 4,
            frameCount: 6,
            fps: 12,
            loop: true,
          },
        ],
      }),
    );
    sam.render();
    expect(container.querySelectorAll('.sam-anim-card').length).toBe(2);
  });

  it('shows animation name inside its card', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
        ],
      }),
    );
    sam.render();
    expect(container.querySelector('.sam-anim-card').textContent).toContain('idle');
  });

  // ---- Toolbar buttons ----

  it('renders import sprite sheet button', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-import-btn')).not.toBe(null);
  });

  it('renders drag-and-drop zone', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-drop-zone')).not.toBe(null);
  });

  it('renders new animation button', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-new-anim-btn')).not.toBe(null);
  });

  // ---- Config panel: new animation ----

  it('shows config panel when new animation button is clicked', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('.sam-config-panel')).not.toBe(null);
  });

  it('config panel contains frameWidth field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="frameWidth"]')).not.toBe(null);
  });

  it('config panel contains frameHeight field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="frameHeight"]')).not.toBe(null);
  });

  it('config panel contains frameStart field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="frameStart"]')).not.toBe(null);
  });

  it('config panel contains frameCount field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="frameCount"]')).not.toBe(null);
  });

  it('config panel contains fps field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="fps"]')).not.toBe(null);
  });

  it('config panel contains loop field', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('[data-field="loop"]')).not.toBe(null);
  });

  it('config panel has confirm and cancel buttons', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    expect(container.querySelector('.sam-config-confirm')).not.toBe(null);
    expect(container.querySelector('.sam-config-cancel')).not.toBe(null);
  });

  it('calls addAnimation when confirm is clicked', () => {
    const addSpy = vi.fn();
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ addAnimation: addSpy }),
    );
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    container.querySelector('.sam-config-confirm').click();
    expect(addSpy).toHaveBeenCalledOnce();
  });

  it('added animation has expected shape', () => {
    let added = null;
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ addAnimation: (a) => { added = a; } }),
    );
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    container.querySelector('.sam-config-confirm').click();
    expect(added).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      frameWidth: expect.any(Number),
      frameHeight: expect.any(Number),
      frameStart: expect.any(Number),
      frameCount: expect.any(Number),
      fps: expect.any(Number),
      loop: expect.any(Boolean),
    });
  });

  it('hides config panel when cancel is clicked', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    container.querySelector('.sam-new-anim-btn').click();
    container.querySelector('.sam-config-cancel').click();
    expect(container.querySelector('.sam-config-panel')).toBe(null);
  });

  // ---- Card actions ----

  it('calls removeAnimation with animation id when remove button is clicked', () => {
    const removeSpy = vi.fn();
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
        ],
        removeAnimation: removeSpy,
      }),
    );
    sam.render();
    container.querySelector('.sam-anim-remove').click();
    expect(removeSpy).toHaveBeenCalledWith('a1');
  });

  it('shows edit config panel when edit button is clicked on a card', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
        ],
      }),
    );
    sam.render();
    container.querySelector('.sam-anim-edit').click();
    expect(container.querySelector('.sam-config-panel')).not.toBe(null);
  });

  it('edit config panel is pre-filled with the animation values', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 48,
            frameHeight: 48,
            frameStart: 2,
            frameCount: 6,
            fps: 10,
            loop: false,
          },
        ],
      }),
    );
    sam.render();
    container.querySelector('.sam-anim-edit').click();
    const panel = container.querySelector('.sam-config-panel');
    expect(panel.querySelector('[data-field="frameWidth"]').value).toBe('48');
    expect(panel.querySelector('[data-field="fps"]').value).toBe('10');
  });

  it('calls updateAnimation when edit confirm is clicked', () => {
    const updateSpy = vi.fn();
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({
        animations: [
          {
            id: 'a1',
            name: 'idle',
            spriteSheetId: null,
            frameWidth: 32,
            frameHeight: 32,
            frameStart: 0,
            frameCount: 4,
            fps: 8,
            loop: true,
          },
        ],
        updateAnimation: updateSpy,
      }),
    );
    sam.render();
    container.querySelector('.sam-anim-edit').click();
    container.querySelector('.sam-config-confirm').click();
    expect(updateSpy).toHaveBeenCalledWith('a1', expect.any(Object));
  });

  // ---- Drag and drop ----

  it('drag over drop zone calls preventDefault', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    const zone = container.querySelector('.sam-drop-zone');
    const ev = new Event('dragover');
    ev.preventDefault = vi.fn();
    zone.dispatchEvent(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
  });
});
