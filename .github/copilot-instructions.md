# Puppets — Copilot Instructions

## Project
Three.js platformer focused on extremely responsive controls and tight timing.

## Stack
- Three.js (rendering), vanilla JS/TS modules
- Node.js + npm, Vite dev server
- Vitest for unit/integration tests

## Virtual Environment
**Always activate the project environment before running commands.**
```
npm install   # install deps
npm run dev   # start dev server
npm test      # run tests
```

## Test-Driven Development
1. Write a failing test FIRST for any new feature or bug fix.
2. Implement the minimal code to pass the test.
3. Refactor only after green.
4. Never skip tests for "trivial" code — input handling, physics, and timing are critical.
5. Run `npm test` after every change.

## Performance & Stability
- Target 60 FPS minimum; profile before optimizing.
- Avoid allocations in the game loop — reuse vectors, quaternions, matrices.
- Use `requestAnimationFrame`; never `setInterval`/`setTimeout` for game ticks.
- Keep the physics step fixed (deterministic); interpolate rendering.
- Prefer typed arrays and object pools over dynamic allocation.
- No DOM manipulation during gameplay.

## Conventions
- Modules in `src/`, tests mirror structure in `tests/`.
- Game loop: `update(dt)` → `render()`. Systems are pure functions where possible.
- Input is sampled once per frame into an immutable snapshot.
- All physics values in SI units (meters, seconds).

## Documentation
- Update `docs/DESIGN.md` with architecture decisions, mechanics, and planned features.
- Use JSDoc comments for all public functions and classes.
- Keep README.md up to date with setup instructions and project overview.