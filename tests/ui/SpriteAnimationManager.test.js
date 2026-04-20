// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  // ---- Enlarged preview ----

  const animWithSheet = {
    id: 'a1',
    name: 'idle',
    spriteSheetId: 'sheet1',
    frameWidth: 32,
    frameHeight: 32,
    frameStart: 0,
    frameCount: 4,
    fps: 8,
    loop: true,
  };
  const sheetEntry = { id: 'sheet1', name: 'spritesheet.png', dataUrl: 'data:image/png;base64,AA==', width: 128, height: 32 };

  it('enlarged preview is not shown on first render', () => {
    const sam = new SpriteAnimationManager(container, makeCallbacks());
    sam.render();
    expect(container.querySelector('.sam-enlarged-preview')).toBe(null);
  });

  it('clicking an animation card opens the enlarged preview overlay', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-card').click();
    expect(container.querySelector('.sam-enlarged-preview')).not.toBe(null);
  });

  it('enlarged preview shows the animation name', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-card').click();
    expect(container.querySelector('.sam-enlarged-preview').textContent).toContain('idle');
  });

  it('enlarged preview contains a canvas element', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-card').click();
    expect(container.querySelector('.sam-enlarged-preview canvas')).not.toBe(null);
  });

  it('enlarged preview has a close button', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-card').click();
    expect(container.querySelector('.sam-enlarged-close')).not.toBe(null);
  });

  it('clicking the close button dismisses the enlarged preview', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-card').click();
    container.querySelector('.sam-enlarged-close').click();
    expect(container.querySelector('.sam-enlarged-preview')).toBe(null);
  });

  it('clicking a different card switches the enlarged preview to that animation', () => {
    const anim2 = { ...animWithSheet, id: 'a2', name: 'run' };
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet, anim2], sheets: [sheetEntry] }),
    );
    sam.render();
    const cards = container.querySelectorAll('.sam-anim-card');
    cards[0].click();  // opens 'idle'
    cards[1].click();  // switches to 'run'
    expect(container.querySelector('.sam-enlarged-preview').textContent).toContain('run');
  });

  it('clicking Edit on a card does NOT open the enlarged preview', () => {
    const sam = new SpriteAnimationManager(
      container,
      makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
    );
    sam.render();
    container.querySelector('.sam-anim-edit').click();
    // config panel appears but not the enlarged preview
    expect(container.querySelector('.sam-enlarged-preview')).toBe(null);
  });

  // ---- Animation loop ----
  describe('animation loop', () => {
    let OrigImage;

    beforeEach(() => {
      OrigImage = globalThis.Image;
      // Synchronous Image stub: fires onload immediately when src is set
      globalThis.Image = class {
        set onload(fn) { this._onload = fn; }
        set src(_) { if (this._onload) this._onload(); }
      };
    });

    afterEach(() => {
      globalThis.Image = OrigImage;
      vi.restoreAllMocks();
    });

    it('rAF tick loop does not throw when animDef is preserved across frames', () => {
      const callbacks = [];
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        callbacks.push(cb);
        return callbacks.length;
      });
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

      const sam = new SpriteAnimationManager(
        container,
        makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
      );
      sam.render();
      container.querySelector('.sam-anim-card').click();
      // tick 0: dt=0, no advance (lastTimestamp is null)
      callbacks[0]?.(0);
      // tick 1: dt=200ms → elapsed=1, advanceAnimFrame returns state WITHOUT animDef
      callbacks[1]?.(200);
      // tick 2: if animDef was lost, this call throws TypeError inside advanceAnimFrame
      expect(() => callbacks[2]?.(400)).not.toThrow();
    });

    it('starts a requestAnimationFrame loop when enlarged preview opens with a sheet', () => {
      const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);
      const sam = new SpriteAnimationManager(
        container,
        makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
      );
      sam.render();
      container.querySelector('.sam-anim-card').click();
      expect(rafSpy).toHaveBeenCalled();
    });

    it('cancels the animation loop when the close button is clicked', () => {
      vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(77);
      const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
      const sam = new SpriteAnimationManager(
        container,
        makeCallbacks({ animations: [animWithSheet], sheets: [sheetEntry] }),
      );
      sam.render();
      container.querySelector('.sam-anim-card').click();
      container.querySelector('.sam-enlarged-close').click();
      expect(cafSpy).toHaveBeenCalledWith(77);
    });

    it('cancels the previous loop when switching to a different animation card', () => {
      let count = 0;
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => ++count);
      const cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
      const anim2 = { ...animWithSheet, id: 'a2', name: 'run' };
      const sam = new SpriteAnimationManager(
        container,
        makeCallbacks({ animations: [animWithSheet, anim2], sheets: [sheetEntry] }),
      );
      sam.render();
      container.querySelectorAll('.sam-anim-card')[0].click(); // rAF id = 1
      container.querySelectorAll('.sam-anim-card')[1].click(); // should cancel 1
      expect(cafSpy).toHaveBeenCalledWith(1);
    });
  });
});
