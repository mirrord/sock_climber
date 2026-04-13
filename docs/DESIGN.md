# Design Document

## Core Pillars

1. **Responsiveness** — Input-to-screen in 1 frame. No smoothing or lerping on player input.
2. **Precision** — Frame-perfect mechanics: coyote time, jump buffering, wall jumps.
3. **Consistency** — Fixed physics step ensures identical behavior regardless of framerate.

## Player Mechanics (Planned)

- [ ] Ground movement (acceleration, deceleration, max speed)
- [ ] Variable-height jump (hold = higher)
- [ ] Coyote time (grace frames after leaving edge)
- [ ] Jump buffering (press jump slightly before landing)
- [ ] Wall slide / wall jump
- [ ] Dash (single-use, resets on ground)
- [ ] Moving platforms

## Input System (Planned)

- [ ] Keyboard + gamepad support
- [ ] Action mapping (abstract actions, not raw keys)
- [ ] Per-frame immutable input snapshot
- [ ] Input buffering queue

## Camera (Planned)

- [ ] Smooth follow with deadzone
- [ ] Look-ahead in movement direction
- [ ] Snap to regions / camera zones

## Level Design (Planned)

- [ ] Tile-based geometry for collision
- [ ] JSON level format
- [ ] Hazards, checkpoints, collectibles

## Performance Targets

| Metric | Target |
|--------|--------|
| FPS | 60+ stable |
| Input latency | ≤1 frame |
| Physics step | 1/120s fixed |
| GC pauses | 0 during gameplay |
