# Input

## Goals
- Single source of truth per frame: `InputSnapshot`.
- Sub-frame latency: poll just before `update`.
- Same shape for keyboard and gamepad; rebindable.

## InputSnapshot shape
```
InputSnapshot {
  axes: { moveX: -1..1 }
  buttonsDown:    Set<Action>
  buttonsPressed: Set<Action>   // edge: this frame
  buttonsReleased: Set<Action>  // edge: this frame
  timestamp: number             // monotonic, ms
}
```

## Actions (from design.md)
`MoveLeft, MoveRight, Crouch, Jump, Dash, Attack, ApplyPatch, Pause`

## Default bindings
| Action      | Keyboard | Gamepad |
|-------------|----------|---------|
| Move        | A / D    | Left stick X |
| Crouch      | S        | Left stick down / B |
| Jump        | Space    | A |
| Dash        | Shift    | RB |
| Attack      | H        | X |
| Apply patch | Q        | Y |
| Pause       | Esc      | Start |

## Implementation notes
- Keyboard via `keydown` / `keyup` listeners populating a raw state map; gamepad via `navigator.getGamepads()` polled each frame.
- Edge sets computed by diffing previous and current `buttonsDown`.
- **Spring jump**: charged by **holding `Crouch`**; on `Crouch` release, if a horizontal direction (`MoveLeft` / `MoveRight`) is held, the player launches diagonally upward in that direction. Releasing `Crouch` with no direction held just stands up and discards charge. Spring is not a separately bindable action.
- Rebinding stored in `localStorage`; settings UI mutates a `Bindings` table consumed by the input layer.

## Tests
- Holding a key across frames yields `buttonsDown` only, never repeated `buttonsPressed`.
- Rebinding a key updates the resulting action edge.
- Simultaneous opposite axes (e.g. A+D) resolve to 0.
- Gamepad disconnect mid-frame produces empty axes/buttons, not a crash.
