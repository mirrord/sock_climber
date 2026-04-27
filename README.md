# Sock Climber

A precision platformer built with Three.js, focused on extremely responsive controls and tight timing.

## Vision

Sock Climber is a platformer where every millisecond of input matters. The game prioritizes:

- **Instant response** — zero-latency input pipeline, frame-perfect actions
- **Tight timing** — precise jump windows, coyote time, input buffering
- **Deterministic physics** — fixed-step simulation for consistent behavior
- **Buttery rendering** — 60 FPS target with interpolated visuals

## Stack

| Concern | Tool |
|---------|------|
| Rendering | Three.js (orthographic camera) |
| Language | TypeScript (strict) |
| Build / dev server | Vite |
| Tests | Vitest (jsdom environment) |
| Linting / formatting | ESLint + Prettier |

## Getting Started

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm test             # run full test suite (once)
npm run test:watch   # re-run tests on file change
npm run test:coverage  # coverage report
npm run build        # production build (tsc + vite)
npm run preview      # preview production build locally
npm run lint         # ESLint
npm run format       # Prettier (writes in place)
```

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | A / D | Left stick X |
| Crouch | S | Left stick down / B |
| Jump | Space | A |
| Dash | Shift | RB |
| Spring jump | Hold Crouch, release while holding A or D | Hold Crouch, release while holding direction |
| Attack | H | X |
| Apply patch | Q | Y |
| Pause | Esc | Start |

Key bindings are rebindable in-game via the Settings menu and persisted to `localStorage`.

## Features

- **Player controller** — run, variable-height jump, coyote time (~6 frames), jump buffer (~6 frames), air control, wall slide & wall kick, directional spring, crouch, dash with i-frames
- **Combat system** — frame-window attack data (`AttackTable`), hitbox resolution, aerial-crouch damp, invincibility frames
- **Enemies, obstacles & buffs** — entity registries and factories; AI state machines
- **Procedural level generation** — seeded chunk-based generator (Open / Tight profiles), Poisson-disk platform sampler, jump-arc reachability heuristic; identical seed → identical layout
- **Upgrade system** — kill-driven gauge; patch picker presents 3 random upgrades from `PatchCatalog`; patches trade an empty HP container for a permanent stat buff
- **Death plane** — monotonically advancing; speed bumps on segment crossings and patch applications
- **Score** — tracks distance traversed and enemies killed; summary on death
- **Full UI** — Title screen, HUD (HP, gauge, distance, buffs), Pause menu, Settings, Patch Picker, Game Over screen
- **Audio** — pooled SFX bus + looping music manager; hooks fire from `EventBus` events (not per-frame polling)
- **Render polish** — sprite pool, particle system (dust, spring puff), `DebugOverlay` toggled with `?debug=1`

## Project Structure

```
src/
├── core/       Loop, time, RNG, Vec2, EventBus, object pools
├── input/      Keyboard + gamepad → immutable InputSnapshot; rebinding
├── physics/    Swept AABB, spatial hash, TileWorld
├── entities/   Player, Entity base, components; enemies/, obstacles/, buffs/
├── systems/    CombatSystem, DeathPlaneSystem, UpgradeSystem, ScoreSystem, SpawnSystem
├── level/      Chunk profiles, Generator, Poisson sampler, reachability
├── render/     Renderer, GameCamera, SpritePool, ParticleSystem, DebugOverlay
├── ui/         HUD, PatchPicker, Pause, Settings, Title, GameOver
└── audio/      AudioBus, SfxRegistry, Music, AudioSystem
tests/          Mirrors src/ structure; 433+ unit tests
docs/           DESIGN.md (living architecture doc), PHYSICS.md, INPUT.md, LEVEL_GENERATION.md
```

## Development Conventions

- **TDD** — failing test first, minimal code to green, then refactor.
- All modules in `src/<name>/` have a corresponding `tests/<name>/` mirror.
- No allocations in the per-frame `update(dt)` path; use pools.
- Fixed-step physics (`dt = 1/120 s`); render interpolates with `alpha`.
- All units SI: meters and seconds. 1 world unit = 1 m = 1 tile.
- Input sampled once per frame into an immutable `InputSnapshot`.
- `?debug=1` URL flag draws AABB outlines, contact normals, and velocity vectors.

## CI / Deployment

Tests run on every push to `main` via GitHub Actions; the build is deployed to GitHub Pages at `https://<owner>.github.io/sock_climber/`.

## License

MIT
