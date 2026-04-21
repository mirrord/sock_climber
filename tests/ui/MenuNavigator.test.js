import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MenuNavigator } from '../../src/ui/MenuNavigator.js';

/**
 * Create a mock InputSystem for testing.
 * @param {Set<string>} [initialActions]
 * @returns {object}
 */
function createMockInputSystem(initialActions = new Set()) {
  return {
    snapshot: {
      actions: initialActions,
      axes: {},
    },
  };
}

/**
 * Create mock focusable elements.
 * @param {number} count
 * @returns {HTMLElement[]}
 */
function createMockElements(count) {
  return Array.from({ length: count }, () => {
    const el = document.createElement('button');
    // Mock scrollIntoView which isn't implemented in jsdom
    el.scrollIntoView = vi.fn();
    return el;
  });
}

describe('MenuNavigator', () => {
  let inputSystem;
  let navigator;
  let elements;

  beforeEach(() => {
    inputSystem = createMockInputSystem();
    navigator = new MenuNavigator(inputSystem, { mode: 'vertical', wrap: true });
    elements = createMockElements(3);
  });

  describe('setFocusables', () => {
    it('should set focusable elements', () => {
      navigator.setFocusables(elements);
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should apply visual focus to first element', () => {
      navigator.setFocusables(elements);
      expect(elements[0].classList.contains('menu-nav-selected')).toBe(true);
    });

    it('should accept NodeList', () => {
      const div = document.createElement('div');
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');
      btn1.scrollIntoView = vi.fn();
      btn2.scrollIntoView = vi.fn();
      div.appendChild(btn1);
      div.appendChild(btn2);
      const nodeList = div.querySelectorAll('button');
      navigator.setFocusables(nodeList);
      expect(navigator.selectedIndex).toBe(0);
    });
  });

  describe('vertical navigation', () => {
    beforeEach(() => {
      navigator = new MenuNavigator(inputSystem, { mode: 'vertical', wrap: true });
      navigator.setFocusables(elements);
    });

    it('should navigate down', () => {
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);
    });

    it('should navigate up', () => {
      navigator.selectedIndex = 1;
      inputSystem.snapshot.actions = new Set(['menuUp']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should wrap to end when navigating up from first', () => {
      inputSystem.snapshot.actions = new Set(['menuUp']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(2);
    });

    it('should wrap to start when navigating down from last', () => {
      navigator.selectedIndex = 2;
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should not wrap when wrap=false', () => {
      navigator = new MenuNavigator(inputSystem, { mode: 'vertical', wrap: false });
      navigator.setFocusables(elements);
      inputSystem.snapshot.actions = new Set(['menuUp']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should ignore left/right in vertical mode', () => {
      inputSystem.snapshot.actions = new Set(['menuLeft']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
      
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });
  });

  describe('horizontal navigation', () => {
    beforeEach(() => {
      navigator = new MenuNavigator(inputSystem, { mode: 'horizontal', wrap: true });
      navigator.setFocusables(elements);
    });

    it('should navigate right', () => {
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);
    });

    it('should navigate left', () => {
      navigator.selectedIndex = 1;
      inputSystem.snapshot.actions = new Set(['menuLeft']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should ignore up/down in horizontal mode', () => {
      inputSystem.snapshot.actions = new Set(['menuUp']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
      
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });
  });

  describe('grid navigation', () => {
    beforeEach(() => {
      // 2x3 grid (2 columns, 3 rows)
      elements = createMockElements(6);
      navigator = new MenuNavigator(inputSystem, { mode: 'grid', columns: 2, wrap: true });
      navigator.setFocusables(elements);
    });

    it('should navigate down by column count', () => {
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(2);
    });

    it('should navigate up by column count', () => {
      navigator.selectedIndex = 2;
      inputSystem.snapshot.actions = new Set(['menuUp']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should navigate right by 1', () => {
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);
    });

    it('should navigate left by 1', () => {
      navigator.selectedIndex = 1;
      inputSystem.snapshot.actions = new Set(['menuLeft']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(0);
    });
  });

  describe('edge detection', () => {
    beforeEach(() => {
      navigator.setFocusables(elements);
    });

    it('should only trigger on rising edge', () => {
      // First frame: action pressed
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);

      // Second frame: action still held
      navigator.update();
      expect(navigator.selectedIndex).toBe(1); // Should not move again

      // Third frame: action released
      inputSystem.snapshot.actions = new Set();
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);

      // Fourth frame: action pressed again
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(2); // Should move now
    });
  });

  describe('confirm action', () => {
    beforeEach(() => {
      navigator.setFocusables(elements);
    });

    it('should trigger click on confirm', () => {
      const clickSpy = vi.fn();
      elements[0].addEventListener('click', clickSpy);
      inputSystem.snapshot.actions = new Set(['menuConfirm']);
      navigator.update();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should trigger click on selected element', () => {
      navigator.selectedIndex = 1;
      const clickSpy = vi.fn();
      elements[1].addEventListener('click', clickSpy);
      inputSystem.snapshot.actions = new Set(['menuConfirm']);
      navigator.update();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should focus element on confirm', () => {
      // Element must be in the document to be focusable
      document.body.appendChild(elements[0]);
      inputSystem.snapshot.actions = new Set(['menuConfirm']);
      navigator.update();
      expect(document.activeElement).toBe(elements[0]);
      document.body.removeChild(elements[0]);
    });
  });

  describe('slider adjustment', () => {
    it('should adjust slider value with left/right', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = '50';
      slider.scrollIntoView = vi.fn();
      
      navigator.setFocusables([slider]);
      
      // Move right
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      expect(slider.value).toBe('55');
      
      // Move left
      inputSystem.snapshot.actions = new Set();
      navigator.update();
      inputSystem.snapshot.actions = new Set(['menuLeft']);
      navigator.update();
      expect(slider.value).toBe('50');
    });

    it('should clamp slider value at min/max', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = '98';
      slider.scrollIntoView = vi.fn();
      
      navigator.setFocusables([slider]);
      
      // Move right twice
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      inputSystem.snapshot.actions = new Set();
      navigator.update();
      inputSystem.snapshot.actions = new Set(['menuRight']);
      navigator.update();
      
      expect(slider.value).toBe('100');
    });

    it('should navigate away from slider with up/down', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = '50';
      slider.scrollIntoView = vi.fn();
      
      const button = document.createElement('button');
      button.scrollIntoView = vi.fn();
      
      navigator.setFocusables([slider, button]);
      
      inputSystem.snapshot.actions = new Set(['menuDown']);
      navigator.update();
      expect(navigator.selectedIndex).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop update loop', () => {
      navigator.setFocusables(elements);
      navigator.start();
      expect(navigator._rafId).toBeTruthy();
      
      navigator.stop();
      expect(navigator._rafId).toBeNull();
    });

    it('should clean up on dispose', () => {
      navigator.setFocusables(elements);
      navigator.start();
      navigator.dispose();
      
      expect(navigator._rafId).toBeNull();
      expect(navigator._focusables).toEqual([]);
    });

    it('should clear visual focus on dispose', () => {
      navigator.setFocusables(elements);
      expect(elements[0].classList.contains('menu-nav-selected')).toBe(true);
      navigator.dispose();
      
      for (const el of elements) {
        expect(el.classList.contains('menu-nav-selected')).toBe(false);
      }
    });
  });

  describe('selectedIndex property', () => {
    beforeEach(() => {
      navigator.setFocusables(elements);
    });

    it('should get selected index', () => {
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should set selected index', () => {
      navigator.selectedIndex = 1;
      expect(navigator.selectedIndex).toBe(1);
    });

    it('should not set invalid index', () => {
      navigator.selectedIndex = 10;
      expect(navigator.selectedIndex).toBe(0);
      
      navigator.selectedIndex = -1;
      expect(navigator.selectedIndex).toBe(0);
    });

    it('should update visual focus when setting index', () => {
      navigator.selectedIndex = 1;
      expect(elements[1].classList.contains('menu-nav-selected')).toBe(true);
      expect(elements[0].classList.contains('menu-nav-selected')).toBe(false);
    });
  });
});
