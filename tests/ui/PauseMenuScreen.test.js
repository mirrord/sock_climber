// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PauseMenuScreen } from '../../src/ui/PauseMenuScreen.js';

/** Minimal SettingsStore stub. */
function makeSettings(initial = {}) {
  const data = { sfxVolume: 0.8, musicVolume: 0.5, ...initial };
  return {
    get: vi.fn((key) => data[key] ?? null),
    set: vi.fn((key, val) => { data[key] = val; }),
  };
}

/** Minimal ActionMap stub — returns null for all bindings. */
function makeActionMap() {
  return {
    getKeyBinding:     vi.fn(() => null),
    getGamepadBinding: vi.fn(() => null),
    rebindKey:         vi.fn(),
    rebindGamepad:     vi.fn(),
  };
}

function makeScreen(callbackOverrides = {}, options = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const callbacks = {
    onResume:    vi.fn(),
    onMainMenu:  vi.fn(),
    ...callbackOverrides,
  };
  const screen = new PauseMenuScreen(container, callbacks, options);
  return { screen, container, callbacks };
}

describe('PauseMenuScreen', () => {
  let screen, container, callbacks;

  afterEach(() => {
    screen.exit();
    container.remove();
  });

  describe('lifecycle', () => {
    beforeEach(() => {
      ({ screen, container, callbacks } = makeScreen());
      screen.enter();
    });

    it('appends the overlay to the container on enter()', () => {
      expect(container.querySelector('.pause-overlay')).not.toBeNull();
    });

    it('removes the overlay from the container on exit()', () => {
      screen.exit();
      expect(container.querySelector('.pause-overlay')).toBeNull();
    });

    it('calling exit() twice does not throw', () => {
      expect(() => { screen.exit(); screen.exit(); }).not.toThrow();
    });
  });

  describe('resume button', () => {
    beforeEach(() => {
      ({ screen, container, callbacks } = makeScreen());
      screen.enter();
    });

    it('calls onResume when the resume button is clicked', () => {
      const btn = container.querySelector('[data-action="resume"]');
      expect(btn).not.toBeNull();
      btn.click();
      expect(callbacks.onResume).toHaveBeenCalledOnce();
    });
  });

  describe('exit to main menu button', () => {
    beforeEach(() => {
      ({ screen, container, callbacks } = makeScreen());
      screen.enter();
    });

    it('calls onMainMenu when the exit-to-main-menu button is clicked', () => {
      const btn = container.querySelector('[data-action="mainMenu"]');
      expect(btn).not.toBeNull();
      btn.click();
      expect(callbacks.onMainMenu).toHaveBeenCalledOnce();
    });
  });

  describe('settings — audio', () => {
    let settings;

    beforeEach(() => {
      settings = makeSettings({ sfxVolume: 0.6, musicVolume: 0.3 });
      ({ screen, container, callbacks } = makeScreen({}, { settings }));
      screen.enter();
    });

    it('renders volume sliders when settings are provided', () => {
      const sliders = container.querySelectorAll('[data-vol]');
      expect(sliders.length).toBeGreaterThanOrEqual(2);
    });

    it('initialises sfxVolume slider to the stored value', () => {
      const sfxSlider = container.querySelector('[data-vol="sfxVolume"]');
      expect(sfxSlider).not.toBeNull();
      expect(parseInt(sfxSlider.value, 10)).toBe(60);
    });

    it('initialises musicVolume slider to the stored value', () => {
      const musicSlider = container.querySelector('[data-vol="musicVolume"]');
      expect(musicSlider).not.toBeNull();
      expect(parseInt(musicSlider.value, 10)).toBe(30);
    });

    it('updates settings store when a volume slider changes', () => {
      const sfxSlider = container.querySelector('[data-vol="sfxVolume"]');
      sfxSlider.value = '75';
      sfxSlider.dispatchEvent(new Event('input', { bubbles: true }));
      expect(settings.set).toHaveBeenCalledWith('sfxVolume', 0.75);
    });

    it('updates the displayed percentage when a volume slider changes', () => {
      const sfxSlider = container.querySelector('[data-vol="sfxVolume"]');
      sfxSlider.value = '75';
      sfxSlider.dispatchEvent(new Event('input', { bubbles: true }));
      const display = sfxSlider.closest('.slider-wrap')?.querySelector('.vol-value');
      expect(display?.textContent).toBe('75%');
    });
  });

  describe('settings — tabs', () => {
    beforeEach(() => {
      const settings = makeSettings();
      const actionMap = makeActionMap();
      ({ screen, container, callbacks } = makeScreen({}, { settings, actionMap }));
      screen.enter();
    });

    it('renders Audio and Controls tab buttons', () => {
      const tabs = container.querySelectorAll('.tab-btn');
      const labels = Array.from(tabs).map(t => t.textContent.trim());
      expect(labels).toContain('Audio');
      expect(labels).toContain('Controls');
    });

    it('starts on the Audio tab by default', () => {
      const active = container.querySelector('.tab-btn.active');
      expect(active?.textContent.trim()).toBe('Audio');
    });

    it('switches to the Controls tab when clicked', () => {
      const controlsTab = Array.from(container.querySelectorAll('.tab-btn'))
        .find(b => b.textContent.trim() === 'Controls');
      controlsTab.click();
      const active = container.querySelector('.tab-btn.active');
      expect(active?.textContent.trim()).toBe('Controls');
    });
  });

  describe('settings — no settings provided', () => {
    beforeEach(() => {
      ({ screen, container, callbacks } = makeScreen());
      screen.enter();
    });

    it('still renders without throwing when no settings/actionMap provided', () => {
      expect(container.querySelector('.pause-overlay')).not.toBeNull();
    });
  });

  describe('exit button label', () => {
    it('defaults to "Exit to Main Menu" when no exitLabel is provided', () => {
      ({ screen, container, callbacks } = makeScreen());
      screen.enter();
      const btn = container.querySelector('[data-action="mainMenu"]');
      expect(btn?.textContent.trim()).toBe('Exit to Main Menu');
    });

    it('uses the provided exitLabel option', () => {
      ({ screen, container, callbacks } = makeScreen({}, { exitLabel: 'Return to Level Editor' }));
      screen.enter();
      const btn = container.querySelector('[data-action="mainMenu"]');
      expect(btn?.textContent.trim()).toBe('Return to Level Editor');
    });

    it('still fires onMainMenu callback regardless of label', () => {
      ({ screen, container, callbacks } = makeScreen({}, { exitLabel: 'Return to Level Editor' }));
      screen.enter();
      const btn = container.querySelector('[data-action="mainMenu"]');
      btn.click();
      expect(callbacks.onMainMenu).toHaveBeenCalledOnce();
    });
  });
});
