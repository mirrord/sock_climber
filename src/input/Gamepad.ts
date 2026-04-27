import type { Action } from "./Actions.js";
import type { Bindings } from "./Bindings.js";
import type { InputSnapshot } from "./InputSnapshot.js";
import { EMPTY_SNAPSHOT } from "./InputSnapshot.js";

const GAMEPAD_AXIS_DEAD_ZONE = 0.15;

/**
 * Polls the Gamepad API (if available) each frame.
 * Returns an empty snapshot on disconnect or when gamepad is not present.
 */
export class GamepadInput {
  private _bindings: Bindings;

  constructor(bindings: Bindings) {
    this._bindings = bindings;
  }

  setBindings(bindings: Bindings): void {
    this._bindings = bindings;
  }

  /**
   * Polls the first connected gamepad and fills `buttonsDown`.
   * Returns `null` if no gamepad is connected.
   */
  poll(): { buttonsDown: Set<Action>; axes: { moveX: number } } | null {
    let gp: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads();
      for (const pad of pads) {
        if (pad !== null && pad.connected) {
          gp = pad;
          break;
        }
      }
    } catch {
      return null;
    }

    if (gp === null) return null;

    const buttonsDown = new Set<Action>();

    // Button bindings
    for (let i = 0; i < gp.buttons.length; i++) {
      const btn = gp.buttons[i];
      if (btn !== undefined && btn.pressed) {
        const action = this._bindings.gamepadButtons[i];
        if (action !== undefined) buttonsDown.add(action);
      }
    }

    // Axis → action (digital, beyond dead zone)
    for (const [idxStr, binding] of Object.entries(this._bindings.gamepadAxes)) {
      const idx = Number(idxStr);
      const axisVal = gp.axes[idx] ?? 0;
      if (binding === undefined) continue;
      if (axisVal > GAMEPAD_AXIS_DEAD_ZONE) buttonsDown.add(binding.positive);
      if (axisVal < -GAMEPAD_AXIS_DEAD_ZONE) buttonsDown.add(binding.negative);
    }

    // Analog axes
    const leftX = applyDeadZone(gp.axes[0] ?? 0);

    return {
      buttonsDown,
      axes: {
        moveX: leftX,
      },
    };
  }
}

function applyDeadZone(v: number): number {
  return Math.abs(v) < GAMEPAD_AXIS_DEAD_ZONE ? 0 : v;
}

/**
 * Returns the index of the first currently-pressed button on any connected
 * gamepad, or `null` if no button is pressed (or no gamepad is connected).
 *
 * Used by the Settings UI to capture a button press for rebinding.
 *
 * @param exclude - Optional set of button indices to ignore. Useful when the
 *                  same button that triggered listen-mode is still being held
 *                  and should not immediately re-bind.
 */
export function pollFirstPressedButton(
  exclude?: ReadonlySet<number>,
): { index: number } | null {
  let pads: (Gamepad | null)[];
  try {
    pads = Array.from(navigator.getGamepads());
  } catch {
    return null;
  }
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    for (let i = 0; i < pad.buttons.length; i++) {
      if (exclude?.has(i)) continue;
      const btn = pad.buttons[i];
      if (btn !== undefined && btn.pressed) return { index: i };
    }
  }
  return null;
}

/**
 * Returns the first axis whose absolute value exceeds `threshold`, with the
 * sign of the deflection (`+1` or `-1`). `null` if no axis is active.
 *
 * Used by the Settings UI to capture an axis movement for rebinding.
 *
 * @param threshold - Minimum absolute axis deflection to count.
 * @param exclude   - Optional map of axis index → sign to ignore. An axis is
 *                    skipped only when it is currently deflected in the same
 *                    direction it was when listen-mode began.
 */
export function pollFirstActiveAxis(
  threshold = 0.5,
  exclude?: ReadonlyMap<number, 1 | -1>,
): { index: number; sign: 1 | -1 } | null {
  let pads: (Gamepad | null)[];
  try {
    pads = Array.from(navigator.getGamepads());
  } catch {
    return null;
  }
  for (const pad of pads) {
    if (pad === null || !pad.connected) continue;
    for (let i = 0; i < pad.axes.length; i++) {
      const v = pad.axes[i] ?? 0;
      const excludedSign = exclude?.get(i);
      if (v > threshold) {
        if (excludedSign === 1) continue;
        return { index: i, sign: 1 };
      }
      if (v < -threshold) {
        if (excludedSign === -1) continue;
        return { index: i, sign: -1 };
      }
    }
  }
  return null;
}
