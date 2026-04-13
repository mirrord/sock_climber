# Puppets

A precision platformer built on Three.js, focused on extremely responsive controls and tight timing.

## Vision

Puppets is a 3D platformer where every millisecond of input matters. The game prioritizes:

- **Instant response** — zero-latency input pipeline, frame-perfect actions
- **Tight timing** — precise jump windows, coyote time, input buffering
- **Deterministic physics** — fixed-step simulation for consistent behavior
- **Buttery rendering** — 60 FPS minimum with interpolated visuals

## Getting Started

```bash
npm install
npm run dev     # start dev server at localhost:5173
npm test        # run test suite
npm run build   # production build
```

## Project Structure

```
src/
  core/         # Game loop, clock, fixed-step runner
  input/        # Input sampling, buffering, action mapping
  physics/      # Collision detection, movement, gravity
  player/       # Player controller, state machine
  level/        # Level loading, tile/geometry management
  rendering/    # Three.js scene, camera, renderer setup
  ui/           # HUD, menus, overlays
  utils/        # Math helpers, object pools, constants
tests/          # Mirrors src/ structure
assets/         # Models, textures, audio (placeholder)
public/         # Static files served by Vite
```

## Architecture

### Game Loop
Fixed timestep physics (`update(dt)`) decoupled from variable-rate rendering (`render(alpha)`). Input is sampled once per frame into an immutable snapshot consumed by all systems.

### Player Controller
State machine (idle, running, jumping, falling, wall-sliding, dashing) with frame-perfect transition windows. Supports coyote time, jump buffering, and variable jump height.

### Physics
Custom lightweight 2.5D collision using axis-aligned checks against level geometry. No heavy physics engine — every operation is budgeted.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Rendering | Three.js |
| Bundler | Vite |
| Testing | Vitest |
| Language | JavaScript (ES modules) |

## License

TBD
