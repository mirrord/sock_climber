# Architecture — Living Document

This file is updated at the end of every phase with decisions actually made (not just planned).

## Current state
**Phase 0 complete.** Vite + TypeScript (strict) + Vitest + Three.js scaffolding in place.
**Phase 1 complete.** Core engine and input module implemented and tested.
**Phase 2 complete.** Physics module (AABB, swept collision, spatial hash) implemented and tested.
**Phase 3 complete.** Player controller (run, jump, coyote, buffer, air control, wall kick, dash, spring, crouch, health/i-frames) implemented and tested.
**Phase 4 complete.** Combat system (attack frame windows, hitbox resolution, aerial-crouch damp, i-frames) implemented and tested.
**Phases 5a/5b/5c complete.** Enemies, obstacles, and temporary buffs implemented and tested (registries, factories, AI stubs).
**Phase 6 complete.** Level generation (chunk profiles, Poisson-disk sampler, jump-arc reachability, Generator) implemented and tested.
**Phase 7 complete.** Death plane, upgrade system, score, and spawn systems implemented and tested. Vertical slice playable via `npm run dev`. Score logged to console on death.
**Phase 8 complete.** Full UI layer: HUD, PatchPicker, Pause menu, Settings (key rebinding), Title screen, and Game Over screen implemented and tested. Simulation pauses while PatchPicker or Pause menu is open. 390 unit tests green (`npm test`).
**Phase 9 complete.** Audio module (AudioBus, SfxRegistry, Music, AudioSystem) implemented and tested. 433 unit tests green (`npm test`).

## High-level architecture
- **Game loop** drives a fixed-step `update(dt)` followed by an interpolated `render(alpha)`.
- **Systems** operate over **entities** built from **components** (composition over inheritance).
- **Input** is sampled into an immutable per-frame snapshot before `update`.
- **Physics** is deterministic; render is decoupled.
- **Rendering** uses Three.js with an orthographic camera; sprites are textured planes.

## Module map
| Module | Responsibility | Plan |
|--------|----------------|------|
| `core` | Loop, time, RNG, math pools | [../src/core/PLAN.md](../src/core/PLAN.md) |
| `input` | Keyboard + gamepad sampling, rebinding | [../src/input/PLAN.md](../src/input/PLAN.md) |
| `physics` | AABB bodies, swept collision, spatial hash | [../src/physics/PLAN.md](../src/physics/PLAN.md) |
| `entities` | Player + entity base + components | [../src/entities/PLAN.md](../src/entities/PLAN.md) |
| `systems` | Combat, death plane, upgrades, score | [../src/systems/PLAN.md](../src/systems/PLAN.md) |
| `level` | Chunk-based procedural generator | [../src/level/PLAN.md](../src/level/PLAN.md) || `render` | Three.js scene/camera/sprites/particles | [../src/render/PLAN.md](../src/render/PLAN.md) |
| `ui` | HUD, pause, settings, patch picker | [../src/ui/PLAN.md](../src/ui/PLAN.md) |
| `audio` | SFX/music bus | [../src/audio/PLAN.md](../src/audio/PLAN.md) |
## Data flow per frame
```
poll input ──► InputSnapshot
                    │
                    ▼
           fixed-step accumulator
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  MovementSys  CombatSys   DeathPlaneSys ... (consume snapshot + world)
                    │
                    ▼
              physics step (swept AABB)
                    │
                    ▼
              event bus (kills, hits, segment crosses)
                    │
                    ▼
       UpgradeSys / ScoreSys / SpawnSys react
                    │
                    ▼
              render(alpha) — interpolated
```

## Decisions made (Phases 0–4)

| Decision | Rationale |
|----------|-----------|
| `TileWorld.solidAt` returns `false` for OOB tiles | World opens upward; death plane handles falling off the bottom |
| `Vec2Pool` with global `vec2Pool` instance | Zero allocations in hot path; tests verify no growth after warmup |
| `EventBus` nulls handlers mid-emit, compacts after | O(1) unsubscribe, safe re-entrant emission |
| Swept AABB uses slab method (Minkowski sum) | Handles tunnelling at any speed; integrates naturally with tile grid |
| Adjacency probe after each step | Resting contact sets `onGround`/`onWallL/R` even at zero velocity |
| `Input._simulateKeyDown/Up` internal API | Enables deterministic unit tests without a real DOM |
| `driveLoop` helper for tests | Bypasses `requestAnimationFrame`; fully synchronous |
| `Player.update(dt, snap)` called **before** `step(body, world, dt)` | Controller sets velocity intent; physics resolves collisions; flags from previous step are available for coyote/jump-buffer logic |
| `body.gravity` mutated by Player each frame | Cleanly supports wall-slide gravity reduction and dash zero-gravity without extra indirection |
| `coyoteTime` and `jumpBufferTime` both default to `6/60` s | Matches PLAN.md "~6 frames at 60 fps" spec; large enough to feel forgiving |
| `groundAccel = airAccel = 1000 m/s²` | `1000 × (1/120) ≈ 8.33 ≥ maxSpeed (8)` → velocity reaches target in one physics step; "instant" feel |
| `ATTACK_TABLE` keyed by string (`"Normal"`, `"AerialCrouch"`) | Extensible without enum churn; attack selection is a simple runtime string |
| Hit-targets `Set<number>` per attack instance | O(1) membership test; prevents double-hits within one activation with no per-target state |
| `Damageable` interface (not base class) | Enemies and obstacles in Phases 5a/5b only need to satisfy the interface |
| `ChunkProfile.wallProfile(t)` returns `WallSlice` at normalised position | Pure function; easy to test and compose; no mutable state in profiles |
| World Y=0 at spawn; negative = upward; death plane starts at large positive Y | Consistent with physics (+Y down) and LEVEL_GENERATION.md; death plane rising = Y decreasing |
| `createGenerator` returns a closure with `advance(cameraY, deathPlaneY)` | Keeps all mutable generator state private; pure functional interface for tests |
| Despawn condition: `chunkBottomY > deathPlaneY - GRACE_ROWS` | Ensures chunks are kept until the death plane has fully passed them plus a margin |
| Sub-RNG cloned via `rng.clone()` per chunk | Each chunk's placement is independent; reproducing a single chunk doesn't require replaying the whole seed |
| `poissonSample` uses integer occupancy grid | Efficient for small chunk sizes (≤ 20 tiles); avoids floating-point distance checks on hot path |
| `hasReachablePredecessor` force-step: if no platforms placed, a centred stepping stone is inserted | Guarantees every chunk has at least one reachable entry point regardless of density settings |
| `GameEvents` extended with `onPlayerDeath` and `onPatchApplied` | Minimal additions at phase boundary; both needed for system coordination |
| `DeathPlaneSystem` speed is always additive, never reduced | Monotonic difficulty; multiplied per-frame by `deathPlaneSpeedMultiplier` (floored at 0.1) |
| `ExtraHP` patch calls `gainContainer` only (no `consumeEmptyContainer`) | ExtraHP is a true max-HP increase; other patches trade an empty slot for a permanent stat buff |
| Upgrade gauge: 25% per kill, picker opens at 100% with ≥1 empty container | Gating ensures the player must have taken damage to unlock upgrades (ROADMAP open question #3 resolved) |
| `PatchCatalog` as pure data (`readonly PatchEntry[]`) | No class overhead; eligibility is a per-entry predicate; easy to extend in Phase 8 |
| `onPause` / `onResume` events gate `update()` | Clean separation: toggle flag in loop, emit from both Pause menu and PatchPicker; no coupling between UI classes |
| `PatchPicker` emits `onPause` on open, `onResume` on selection | Simulation reliably freezes during patch selection without the picker owning loop state |
| `Title` shown on construction (not hidden) | First thing the player sees; `onGameStart` starts the loop |
| `alive = false` until `onGameStart` | Loop is inert until the player explicitly starts a run |
| `Settings.setKeyBinding` calls `saveBindings` internally | Single call site for persistence; no risk of forgetting to persist |
| Open design question #2 resolved: DOM overlay, event-driven | Avoids in-canvas HUD complexity; CSS handles layout; zero per-frame DOM writes |
| `SpawnSystem` included in Phase 7 (was Phase 6 scope) | Required for the vertical slice gate; bridges Generator into live entity list and fires `onSegmentCross` |
| `SpawnSystem` segmentId is a monotonic counter | Consistent with `GameEvents.onSegmentCross: { segmentId: number }` type; each crossing is unique |
| `AudioBus` owns two `GainNode` channels (sfx, music) + pre-allocated voice pool | Pool GainNodes created at construction; only lightweight `AudioBufferSourceNode` created per play — no chain allocations during gameplay |
| `Player` takes optional `EventBus<GameEvents>` as third constructor parameter | Keeps all existing call sites unchanged (bus defaults to `null`); Player emits `onJump`/`onLand`/`onDash` when present |
| Land detection: `grounded && !_wasGrounded` at top of `Player.update` | Reuses existing edge-detection pattern; fires before any locomotion state changes for that frame |
| `CombatSystem` emits `onAttack` at the moment a new attack is started | Consistent with how `onHit`/`onKill` are already emitted from the same system |
| `AudioSystem` subscribes to bus events, never polls per-frame | Matches PLAN.md goal; event handlers call `AudioBus.playSfx` → pool look-up is O(pool size) |
| `Music` accepts `(ctx, channelGain)` directly instead of going through `AudioBus` | Enables independent unit testing of crossfade logic with a minimal mock; `AudioBus.getChannelNode("music")` bridges them at wiring time |
| `SfxRegistry` is a plain `Map<SfxId, AudioBuffer>` | No class overhead; pre-decoded buffers are registered once at load time; look-up is O(1) |

## Performance budget
- 60 fps minimum, target 16.6 ms frame budget.
- Zero allocations in `update()` after warmup; verified by a dev-mode allocation tracker around the loop step.
- Physics step `dt = 1/120` s, two steps per render frame at 60 fps.
