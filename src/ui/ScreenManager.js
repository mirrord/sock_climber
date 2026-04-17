/**
 * Manages named screens with enter/exit lifecycle and back-navigation.
 */
export class ScreenManager {
  constructor() {
    /** @type {Map<string, {enter: function, exit: function}>} */
    this._screens = new Map();
    /** @type {string|null} */
    this.active = null;
    /** @type {string[]} */
    this._history = [];
  }

  /**
   * Register a screen.
   * @param {string} name
   * @param {{enter: function, exit: function}} screen
   */
  register(name, screen) {
    this._screens.set(name, screen);
  }

  /**
   * Switch to a registered screen.
   * @param {string} name
   * @param {*} [data] — passed to enter()
   */
  switchTo(name, data) {
    if (!this._screens.has(name)) {
      throw new Error(`Unknown screen: ${name}`);
    }
    if (name === this.active) return;

    if (this.active) {
      this._history.push(this.active);
      this._screens.get(this.active).exit();
    }

    this.active = name;
    this._screens.get(name).enter(data);
  }

  /** Go back to the previous screen. */
  back() {
    if (this._history.length === 0) return;
    const prev = this._history.pop();
    const cur = this.active;
    if (cur) this._screens.get(cur).exit();
    this.active = prev;
    this._screens.get(prev).enter();
  }
}
