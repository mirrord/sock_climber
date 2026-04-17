# Puppets

A precision platformer built on Three.js, focused on extremely responsive controls and tight timing.

## Vision

Puppets is a platformer where every millisecond of input matters. The game prioritizes:

- **Instant response** — zero-latency input pipeline, frame-perfect actions
- **Tight timing** — precise jump windows, coyote time, input buffering
- **Deterministic physics** — fixed-step simulation for consistent behavior
- **Buttery rendering** — 60 FPS minimum with interpolated visuals

## Getting Started

```bash
npm install
npm run dev     # start dev server at localhost:5173 (dev mode with editors)
npm test        # run test suite
npm run build   # production build (editors excluded)
```

## Modes

| Mode | Command | Features |
|------|---------|----------|
| Dev | `npm run dev` | Full editor suite (Level Builder, Object Editor) visible in menu |
| Production | `npm run build` | Editor screens excluded from bundle; menu shows Level Select + Settings only |

The mode is driven by `import.meta.env.MODE` (Vite standard).

## Project Structure

```
src/
  core/            # Game loop, clock, fixed-step runner (planned)
  editor/
    EditorApp.js   # Wires level editor, renderer, UI, play mode
    EditorRenderer.js  # Three.js orthographic top-down view
    EditorUI.js    # Toolbar: size, backgrounds, play, export/import, objects
    LevelEditor.js # Level state: resize, background layers, mode toggle
    ObjectEditorUI.js  # Slide-out panel: object create/edit/save (used in level builder)
    PlayMode.js    # In-editor play: player physics, AABB collision, camera follow
    editorConstants.js # Tile colors, grid color, tile/zoom sizes
  input/           # Input sampling, buffering, action mapping (planned)
  level/
    Level.js       # Tile grid (Uint8Array), backgroundLayers[], resize, serialize
    LevelStore.js  # In-memory name→serialized level map
  objects/
    Behavior.js         # Behavior data model; STANDARD_BEHAVIORS (move/die/idle/patrol/chase)
    BehaviorTrigger.js  # Trigger data model; TRIGGER_TYPES
    GameObject.js       # id, type, name, collisionGroup/Mask (bit flags), behaviors, triggers, properties
    ObjectEditor.js     # Controller: create, load, save, library CRUD, edit current
    templates.js        # 7 built-in templates (platform, wall, enemy, spawn_point, collectible, level_end, event_trigger)
  physics/         # Collision detection, movement (planned)
  player/          # Player controller state machine (planned)
  rendering/       # Shared Three.js scene helpers (planned)
  ui/
    LevelBuilderScreen.js   # Screen that hosts EditorApp with save-level bar
    LevelSelectScreen.js    # Lists saved levels; launch play or delete
    MainMenuScreen.js       # Title screen; hides editor buttons in production
    ObjectEditorScreen.js   # 3-panel object editor (left: props, center: viewport, right: list)
    PlayScreen.js           # Loads level from store and runs PlayMode
    ScreenManager.js        # Screen lifecycle: register, switchTo, back (history stack)
    SettingsScreen.js       # Placeholder settings
    menuStyles.js           # Shared CSS injected once for all menu screens
  main.js          # Entry point: wires ScreenManager, screens, and devMode flag
tests/             # Mirrors src/ structure
assets/            # Models, textures, audio (placeholder)
public/            # Static files served by Vite
docs/
  DESIGN.md        # Architecture decisions and planned mechanics
```

## Architecture

### Screen System
`ScreenManager` manages a stack of screens. Each screen implements `enter()` and `exit()`. Screens are registered by name and navigated with `switchTo(name)` / `back()`. The main menu conditionally shows dev-only screens based on `devMode`.

### Level Editor
The level editor (`EditorApp`) provides:
- **Orthographic Three.js viewport** — grid-aligned top-down view with zoom
- **Resize tool** — change level dimensions (columns × rows) at any time, tiles are preserved where they fit
- **Background layers panel** — add/remove image layers each with a 0–1 parallax factor
- **Object placement** — via the slide-out object editor panel (press `O` or toolbar button)
- **Play mode** — press `Tab` to run the level with the built-in player controller
- **Export / Import** — JSON round-trip for level files

### Object System
Game objects are data records (`GameObject`) composed of:
- **Collision groups / masks** — bit-flag based (PLAYER, ENVIRONMENT, ENEMY, COLLECTIBLE, TRIGGER, PROJECTILE)
- **Behaviors** — named actions with optional animation and parameters
- **Triggers** — `(triggerType, behaviorId)` pairs that fire behaviors on events (timer, proximity, collision, interact, stat change)
- **Properties** — arbitrary key/value pairs

The `ObjectEditor` controller manages a `current` object and a `library` of saved objects. `ObjectEditorUI` is the slide-out panel used in the level builder; `ObjectEditorScreen` is the standalone 3-panel editor (properties / viewport / list).

### Level Data
`Level` holds a `Uint8Array` tile grid (for performance) and a `backgroundLayers[]` array. The tile system is retained for collision geometry while objects carry gameplay logic. Levels serialize to JSON.

### Physics (Play Mode)
Fixed-step AABB collision against the tile grid. Player state: velocity, grounded flag. Input sampled via keyboard. Camera follows the player smoothly.

### Dev / Deployment Split
Editor code is conditionally `import()`'d in `main.js` only when `import.meta.env.MODE !== 'production'`. Vite tree-shakes the editor bundle in production builds.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Rendering | Three.js |
| Bundler | Vite |
| Testing | Vitest |
| Language | JavaScript (ES modules) |

## License

TBD
