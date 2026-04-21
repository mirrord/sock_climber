/**
 * MenuNavigator — Gamepad/keyboard navigation for DOM-based menus.
 * Tracks focusable elements, handles directional input, and triggers actions.
 *
 * Usage:
 *  1. Create a MenuNavigator with an InputSystem reference
 *  2. Call setFocusables(elements) to define navigable items
 *  3. Call update() once per frame to process input
 *  4. Call dispose() on exit to clean up
 */
export class MenuNavigator {
  /**
   * @param {import('../input/InputSystem.js').InputSystem} inputSystem
   * @param {object} [options]
   * @param {boolean} [options.wrap] — wrap around at start/end of list
   * @param {'vertical'|'horizontal'|'grid'} [options.mode] — navigation mode
   * @param {number} [options.columns] — for grid mode
   */
  constructor(inputSystem, options = {}) {
    this._input = inputSystem;
    this._wrap = options.wrap ?? true;
    this._mode = options.mode ?? 'vertical';
    this._columns = options.columns ?? 1;

    /** @type {HTMLElement[]} */
    this._focusables = [];
    this._selectedIndex = 0;

    /** Track previous frame input state for edge detection */
    this._prevActions = new Set();

    /** RAF ID for continuous update loop */
    this._rafId = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Set the list of focusable elements.
   * @param {HTMLElement[]|NodeList} elements
   */
  setFocusables(elements) {
    this._focusables = Array.from(elements);
    this._selectedIndex = 0;
    this._updateVisualFocus();
  }

  /**
   * Start the continuous update loop.
   */
  start() {
    if (this._rafId) return;
    const loop = () => {
      this.update();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Stop the continuous update loop.
   */
  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * Clean up resources.
   */
  dispose() {
    this.stop();
    this._clearVisualFocus();
    this._focusables = [];
  }

  // ── Input handling ──────────────────────────────────────────────────────

  /**
   * Update once per frame. Checks for edge-triggered input.
   */
  update() {
    if (this._focusables.length === 0) return;

    const snapshot = this._input.snapshot;
    const actions = snapshot.actions;

    // Edge-triggered: action just pressed this frame
    const justPressed = (action) => actions.has(action) && !this._prevActions.has(action);

    // Check if current element is a slider
    const currentEl = this._focusables[this._selectedIndex];
    const isSlider = currentEl && currentEl.tagName === 'INPUT' && currentEl.type === 'range';

    if (isSlider) {
      // For sliders, left/right adjusts value
      if (justPressed('menuLeft')) {
        this._adjustSlider(currentEl, -5);
      } else if (justPressed('menuRight')) {
        this._adjustSlider(currentEl, 5);
      }
      // Up/down navigates away from slider
      if (justPressed('menuUp')) {
        this._navigate('up');
      } else if (justPressed('menuDown')) {
        this._navigate('down');
      }
    } else {
      // Normal navigation
      if (justPressed('menuUp')) {
        this._navigate('up');
      } else if (justPressed('menuDown')) {
        this._navigate('down');
      } else if (justPressed('menuLeft')) {
        this._navigate('left');
      } else if (justPressed('menuRight')) {
        this._navigate('right');
      }
    }

    if (justPressed('menuConfirm')) {
      this._confirm();
    }

    // menuBack is typically handled by the screen itself (e.g., navigate back to previous screen)

    this._prevActions = new Set(actions);
  }

  /**
   * Adjust a slider's value.
   * @param {HTMLInputElement} slider
   * @param {number} delta
   */
  _adjustSlider(slider, delta) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const step = parseFloat(slider.step) || 1;
    let value = parseFloat(slider.value) || 0;
    
    value += delta;
    value = Math.max(min, Math.min(max, value));
    
    slider.value = value.toString();
    
    // Trigger input event for live updates
    const event = new Event('input', { bubbles: true });
    slider.dispatchEvent(event);
  }

  /**
   * Navigate in a direction.
   * @param {'up'|'down'|'left'|'right'} direction
   */
  _navigate(direction) {
    const oldIndex = this._selectedIndex;
    let newIndex = oldIndex;

    if (this._mode === 'vertical') {
      if (direction === 'up')   newIndex = oldIndex - 1;
      if (direction === 'down') newIndex = oldIndex + 1;
    } else if (this._mode === 'horizontal') {
      if (direction === 'left')  newIndex = oldIndex - 1;
      if (direction === 'right') newIndex = oldIndex + 1;
    } else if (this._mode === 'grid') {
      const cols = this._columns;
      if (direction === 'up')    newIndex = oldIndex - cols;
      if (direction === 'down')  newIndex = oldIndex + cols;
      if (direction === 'left')  newIndex = oldIndex - 1;
      if (direction === 'right') newIndex = oldIndex + 1;
    }

    // Clamp or wrap
    if (newIndex < 0) {
      newIndex = this._wrap ? this._focusables.length - 1 : 0;
    } else if (newIndex >= this._focusables.length) {
      newIndex = this._wrap ? 0 : this._focusables.length - 1;
    }

    if (newIndex !== oldIndex) {
      this._selectedIndex = newIndex;
      this._updateVisualFocus();
    }
  }

  /**
   * Confirm the currently selected item (simulate click).
   */
  _confirm() {
    const el = this._focusables[this._selectedIndex];
    if (!el) return;

    // Trigger click event
    el.click();

    // Also dispatch a focus event for accessibility
    el.focus();
  }

  // ── Visual feedback ─────────────────────────────────────────────────────

  _updateVisualFocus() {
    this._clearVisualFocus();
    const el = this._focusables[this._selectedIndex];
    if (el) {
      el.classList.add('menu-nav-selected');
      // Scroll into view if needed
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  _clearVisualFocus() {
    for (const el of this._focusables) {
      el.classList.remove('menu-nav-selected');
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Get the currently selected index.
   * @returns {number}
   */
  get selectedIndex() {
    return this._selectedIndex;
  }

  /**
   * Set the selected index programmatically.
   * @param {number} index
   */
  set selectedIndex(index) {
    if (index >= 0 && index < this._focusables.length) {
      this._selectedIndex = index;
      this._updateVisualFocus();
    }
  }
}
