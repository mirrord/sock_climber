# Design Document

## Core Pillars

1. **Responsiveness** — Input-to-screen in 1 frame. No smoothing or lerping on player input.
2. **Precision** — Frame-perfect mechanics: coyote time, jump buffering, wall jumps.
3. **Consistency** — Fixed physics step ensures identical behavior regardless of framerate.

---

## Implemented Systems

### Screen Manager (`src/ui/ScreenManager.js`)
A lightweight screen lifecycle manager. Screens register by name and implement `enter()` / `exit()`. Navigation uses `switchTo(name, params?)` and `back()` (history stack). Screens are DOM-based — each manages its own root element, created on `enter()` and removed on `exit()`.

### Dev / Deployment Mode (`src/main.js`)
Driven by `import.meta.env.MODE` (Vite standard). In development, `LevelBuilderScreen` and `ObjectEditorScreen` are dynamically imported and registered, and their menu buttons are shown. In a production build (`npm run build`) these imports are absent, so the editor code is tree-shaken from the bundle entirely.

### Level Data (`src/level/Level.js`)
- `tiles: Uint8Array` — row-major flat grid. Constants: `EMPTY=0, SOLID=1, SPAWN=2, HAZARD=3, GOAL=4`.
- `backgroundLayers: Array<{url: string, parallax: number}>` — parallax factor 0 (fixed) to 1 (scrolls with camera). Persisted in JSON.
- `resize(w, h)` — pads or clips the tile grid, preserving content that fits.
- `toJSON()` / `fromJSON()` — plain-object round-trip.

### Level Store (`src/level/LevelStore.js`)
In-memory key/value store mapping level names to serialized JSON strings. Used by the screen system to pass levels from the builder to the play screen.

### Level Editor (`src/editor/`)

**`LevelEditor.js`** — Controller (no DOM). Methods:
- `resize(w, h)` — delegates to `Level.resize`
- `addBackgroundLayer(url, parallax)` / `removeBackgroundLayer(i)` / `updateBackgroundLayer(i, url, parallax)`
- `toggleMode()` — `'edit'` ↔ `'play'`
- `clearLevel()`, `exportJSON()`, `importJSON(str)`

**`EditorRenderer.js`** — Three.js orthographic top-down renderer. Tile meshes use `MeshBasicMaterial` per tile type. Grid lines are a `THREE.Group` of `LineSegments`. Supports zoom (`zoomCamera`) and hover indicator.

**`EditorUI.js`** — Fixed toolbar (top-left). Controls: width/height number inputs + Apply (resize), Backgrounds button, Play/Edit toggle, Export/Import, Objects toggle, mode label.

**`EditorApp.js`** — Wires renderer, editor, UI, object editor panel, and background panel. Runs a `requestAnimationFrame` loop. Keyboard: `Tab` = play toggle, `O` = object panel.

**`PlayMode.js`** — In-editor player: keyboard WASD/Space, gravity, AABB tile collision, fixed-step physics, smooth camera follow.

### Object System (`src/objects/`)

**`GameObject`** — Core data record:
- `id` — auto-assigned (`obj_N`)
- `type`, `name`
- `collisionGroup` / `collisionMask` — bit flags: `NONE=0, PLAYER=1, ENVIRONMENT=2, ENEMY=4, COLLECTIBLE=8, TRIGGER=16, PROJECTILE=32`
- `behaviors[]` — `Behavior` instances
- `triggers[]` — `BehaviorTrigger` instances
- `properties{}` — arbitrary key/value
- `clone()`, `toJSON()`, `fromJSON()`

**`Behavior`** — `{ id, name, animation?, params{} }`. Standard behaviors: `move`, `die`, `idle`, `patrol`, `chase`. `createBehavior(id)` clones from the standard set.

**`BehaviorTrigger`** — `{ type, behaviorId, params{} }`. Trigger types: `timer`, `proximity`, `stat_change`, `on_collide`, `on_interact`.

**`templates.js`** — 7 presets:

| Template | Collision group | Default behaviors |
|----------|----------------|-------------------|
| `platform` | ENVIRONMENT | — |
| `wall` | ENVIRONMENT | — |
| `enemy` | ENEMY | patrol |
| `spawn_point` | TRIGGER | idle |
| `collectible` | COLLECTIBLE | idle |
| `level_end` | TRIGGER | idle |
| `event_trigger` | TRIGGER | — |

**`ObjectEditor`** — Controller with `current: GameObject` and `library: GameObject[]`. Methods: `createFromTemplate`, `createBlank`, `load`, `save`, `exportJSON`, `importJSON`, `saveToLibrary`, `loadFromLibrary`, `removeFromLibrary`, `setName`, `setCollisionGroup/Mask`, `addBehavior`, `removeBehavior`, `addTrigger`, `removeTrigger`, `setProperty`.

### Object Editor UIs

**`ObjectEditorUI`** (`src/editor/ObjectEditorUI.js`) — Slide-out panel (right side, 340 px). Used inside the Level Builder. Sections: template bar, library, object fields, collision groups/mask, behaviors, triggers, properties, actions (save to library, export, import). Has a ✕ Close button that hides panel and clears `current`.

**`ObjectEditorScreen`** (`src/ui/ObjectEditorScreen.js`) — Standalone 3-panel screen:
- **Left** (300 px): all editable properties + actions
- **Center** (flex): animation viewport placeholder
- **Right** (240 px): library list with New Object button, template quick-create dropdown, per-item select/delete. Unsaved objects highlighted with a gold left border.

---

## Planned / In Progress

### Player Mechanics
- [ ] Ground movement (acceleration, deceleration, max speed)
- [ ] Variable-height jump (hold = higher)
- [ ] Coyote time (grace frames after leaving edge)
- [ ] Jump buffering (press jump slightly before landing)
- [ ] Wall slide / wall jump
- [ ] Dash (single-use, resets on ground)
- [ ] Moving platforms

### Input System
- [ ] Gamepad support
- [ ] Action mapping (abstract actions, not raw keys)
- [ ] Per-frame immutable input snapshot
- [ ] Input buffering queue

### Camera
- [ ] Smooth follow with deadzone
- [ ] Look-ahead in movement direction
- [ ] Camera zones / region snapping

### Object Placement in Level Editor
- [ ] Place `GameObject` instances at world positions in the editor viewport
- [ ] Serialize placed instances into the level JSON

### Rendering
- [ ] Background layer rendering with parallax scroll in play mode
- [ ] Sprite / animation support for game objects
- [ ] Object animation preview in `ObjectEditorScreen` center panel

---

## Performance Targets

| Metric | Target |
|--------|--------|
| FPS | 60+ stable |
| Input latency | ≤1 frame |
| Physics step | 1/120s fixed |
| GC pauses | 0 during gameplay |
