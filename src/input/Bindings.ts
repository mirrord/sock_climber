import type { Action } from "./Actions.js";

/** Maps a keyboard key (e.g. "KeyA", "Space") to an Action. */
export type KeyboardBindings = Partial<Record<string, Action>>;

/** Gamepad button index → Action */
export type GamepadButtonBindings = Partial<Record<number, Action>>;

/** Gamepad axis index → positive/negative Action pair */
export interface AxisBinding {
  positive: Action;
  negative: Action;
}

export interface Bindings {
  keyboard: KeyboardBindings;
  gamepadButtons: GamepadButtonBindings;
  /** Axis index → { positive, negative } action pair. */
  gamepadAxes: Partial<Record<number, AxisBinding>>;
}

/** Default keyboard bindings matching docs/INPUT.md. */
export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  KeyA: "MoveLeft",
  KeyD: "MoveRight",
  KeyS: "Crouch",
  Space: "Jump",
  ShiftLeft: "Dash",
  ShiftRight: "Dash",
  KeyH: "Attack",
  KeyQ: "ApplyPatch",
  Escape: "Pause",
};

/** Default gamepad bindings (standard mapping). */
export const DEFAULT_GAMEPAD_BUTTON_BINDINGS: GamepadButtonBindings = {
  0: "Jump",        // A
  1: "Crouch",      // B
  2: "Attack",      // X
  3: "ApplyPatch",  // Y
  5: "Dash",        // RB
  9: "Pause",       // Start
};

export const DEFAULT_GAMEPAD_AXES: Partial<Record<number, AxisBinding>> = {
  0: { positive: "MoveRight", negative: "MoveLeft" },   // left stick X
};

const STORAGE_KEY = "sock_climber_bindings";

/** Returns the default bindings. */
export function createDefaultBindings(): Bindings {
  return {
    keyboard: { ...DEFAULT_KEYBOARD_BINDINGS },
    gamepadButtons: { ...DEFAULT_GAMEPAD_BUTTON_BINDINGS },
    gamepadAxes: { ...DEFAULT_GAMEPAD_AXES },
  };
}

/**
 * Loads bindings from localStorage, falling back to defaults.
 * Merged shallowly so any missing keys fall back to defaults.
 */
export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return createDefaultBindings();
    const parsed = JSON.parse(raw) as Partial<Bindings>;
    const defaults = createDefaultBindings();
    return {
      keyboard: { ...defaults.keyboard, ...(parsed.keyboard ?? {}) },
      gamepadButtons: { ...defaults.gamepadButtons, ...(parsed.gamepadButtons ?? {}) },
      gamepadAxes: { ...defaults.gamepadAxes, ...(parsed.gamepadAxes ?? {}) },
    };
  } catch {
    return createDefaultBindings();
  }
}

/** Persists bindings to localStorage. */
export function saveBindings(bindings: Bindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}
