import type { Action } from "./Actions.js";
import type { AxisBinding, Bindings } from "./Bindings.js";
import { createDefaultBindings, saveBindings } from "./Bindings.js";
import type { InputSnapshot } from "./InputSnapshot.js";
import { GamepadInput } from "./Gamepad.js";

/**
 * Input manager. Maintains raw key state, performs edge detection,
 * and exposes `poll(now)` to produce an immutable `InputSnapshot`.
 *
 * Call `poll()` exactly once per frame, before `update()`.
 * Attach via `attach(window)` and detach via `detach(window)` to manage listeners.
 */
export class Input {
  private _bindings: Bindings;
  private _rawKeys = new Set<string>();
  private _prevDown = new Set<Action>();
  private _gamepad: GamepadInput;

  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  private readonly _onKeyUp: (e: KeyboardEvent) => void;

  constructor(bindings: Bindings = createDefaultBindings()) {
    this._bindings = bindings;
    this._gamepad = new GamepadInput(bindings);

    this._onKeyDown = (e: KeyboardEvent) => {
      this._rawKeys.add(e.code);
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      this._rawKeys.delete(e.code);
    };
  }

  /** Attach keyboard listeners to the given event target (e.g. `window`). */
  attach(target: EventTarget): void {
    target.addEventListener("keydown", this._onKeyDown as EventListener);
    target.addEventListener("keyup", this._onKeyUp as EventListener);
  }

  /** Remove keyboard listeners from the event target. */
  detach(target: EventTarget): void {
    target.removeEventListener("keydown", this._onKeyDown as EventListener);
    target.removeEventListener("keyup", this._onKeyUp as EventListener);
  }

  /** Read-only view of the current bindings. */
  get bindings(): Readonly<Bindings> {
    return this._bindings;
  }

  /** Update bindings and immediately apply them on the next poll. */
  setBindings(bindings: Bindings): void {
    this._bindings = bindings;
    this._gamepad.setBindings(bindings);
  }

  /**
   * Rebind a single keyboard key to a new action, persisting to localStorage.
   * Pass `undefined` to clear the binding for that key.
   *
   * @param code   - The `KeyboardEvent.code` string (e.g. `"KeyA"`).
   * @param action - The action to bind, or `undefined` to clear.
   */
  setKeyBinding(code: string, action: Action | undefined): void {
    if (action === undefined) {
      delete this._bindings.keyboard[code];
    } else {
      this._bindings.keyboard[code] = action;
    }
    this._gamepad.setBindings(this._bindings);
    saveBindings(this._bindings);
  }

  /**
   * Rebind a single gamepad button to a new action, persisting to localStorage.
   * Pass `undefined` to clear the binding for that index.
   *
   * @param index  - Gamepad button index (0..N).
   * @param action - The action to bind, or `undefined` to clear.
   */
  setGamepadButtonBinding(index: number, action: Action | undefined): void {
    if (action === undefined) {
      delete this._bindings.gamepadButtons[index];
    } else {
      this._bindings.gamepadButtons[index] = action;
    }
    this._gamepad.setBindings(this._bindings);
    saveBindings(this._bindings);
  }

  /**
   * Rebind a gamepad axis to a positive/negative action pair, persisting.
   * Pass `undefined` to clear the binding for that axis.
   */
  setGamepadAxisBinding(index: number, mapping: AxisBinding | undefined): void {
    if (mapping === undefined) {
      delete this._bindings.gamepadAxes[index];
    } else {
      this._bindings.gamepadAxes[index] = mapping;
    }
    this._gamepad.setBindings(this._bindings);
    saveBindings(this._bindings);
  }

  /** Reset only the keyboard bindings to defaults (and persist). */
  resetKeyboardBindings(): void {
    const defaults = createDefaultBindings();
    this._bindings.keyboard = { ...defaults.keyboard };
    this._gamepad.setBindings(this._bindings);
    saveBindings(this._bindings);
  }

  /** Reset only the gamepad bindings (buttons + axes) to defaults. */
  resetGamepadBindings(): void {
    const defaults = createDefaultBindings();
    this._bindings.gamepadButtons = { ...defaults.gamepadButtons };
    this._bindings.gamepadAxes = { ...defaults.gamepadAxes };
    this._gamepad.setBindings(this._bindings);
    saveBindings(this._bindings);
  }

  /**
   * Sample the current input state and return an immutable snapshot.
   * Must be called exactly once per frame, before `update()`.
   *
   * @param now - Monotonic timestamp in ms (e.g. from `performance.now()`).
   */
  poll(now: number): InputSnapshot {
    // --- Keyboard actions ---
    const kbDown = new Set<Action>();
    for (const code of this._rawKeys) {
      const action = this._bindings.keyboard[code];
      if (action !== undefined) kbDown.add(action);
    }

    // --- Gamepad actions ---
    const gpResult = this._gamepad.poll();
    const gpDown = gpResult?.buttonsDown ?? new Set<Action>();

    // --- Merge keyboard + gamepad ---
    const currentDown = new Set<Action>([...kbDown, ...gpDown]);

    // --- Axis values ---
    let moveX = 0;
    if (currentDown.has("MoveRight")) moveX += 1;
    if (currentDown.has("MoveLeft")) moveX -= 1;

    let springX = gpResult?.axes.springX ?? 0;
    let springY = gpResult?.axes.springY ?? 0;
    // Override with digital spring keys if held
    if (currentDown.has("SpringRight")) springX += 1;
    if (currentDown.has("SpringLeft")) springX -= 1;
    if (currentDown.has("SpringDown")) springY += 1;
    if (currentDown.has("SpringUp")) springY -= 1;
    springX = Math.max(-1, Math.min(1, springX));
    springY = Math.max(-1, Math.min(1, springY));

    // --- Edge detection ---
    const pressed = new Set<Action>();
    const released = new Set<Action>();

    for (const a of currentDown) {
      if (!this._prevDown.has(a)) pressed.add(a);
    }
    for (const a of this._prevDown) {
      if (!currentDown.has(a)) released.add(a);
    }

    this._prevDown = new Set(currentDown);

    return Object.freeze({
      axes: Object.freeze({ moveX, springX, springY }),
      buttonsDown: currentDown,
      buttonsPressed: pressed,
      buttonsReleased: released,
      timestamp: now,
    });
  }

  /**
   * Sync internal edge-detection state to the current physical input without
   * generating any "just pressed" events.  Call this immediately after
   * un-pausing so that buttons held during the pause menu interaction are not
   * re-detected as fresh presses on the first gameplay frame.
   */
  flush(): void {
    const kbDown = new Set<Action>();
    for (const code of this._rawKeys) {
      const action = this._bindings.keyboard[code];
      if (action !== undefined) kbDown.add(action);
    }
    const gpResult = this._gamepad.poll();
    const gpDown = gpResult?.buttonsDown ?? new Set<Action>();
    this._prevDown = new Set<Action>([...kbDown, ...gpDown]);
  }

  /**
   * Injects a raw key-down event (for testing without a real DOM).
   * @internal
   */
  _simulateKeyDown(code: string): void {
    this._rawKeys.add(code);
  }

  /**
   * Injects a raw key-up event (for testing without a real DOM).
   * @internal
   */
  _simulateKeyUp(code: string): void {
    this._rawKeys.delete(code);
  }
}
