/**
 * Sock Climber — entry point.
 * Phase 10: render module wired in (Renderer, GameCamera, SpritePool,
 * ParticleSystem, DebugOverlay).  Each entity type now has a distinct
 * coloured primitive; tile world rendered via InstancedMesh.
 */
import * as THREE from "three";
import { createRealClock, createLoop, createEventBus, createRNG } from "./core/index.js";
import type { GameEvents } from "./core/index.js";
import { Input, loadBindings } from "./input/index.js";
import { Player } from "./entities/Player.js";
import { TileWorld } from "./physics/TileWorld.js";
import { step } from "./physics/Resolver.js";
import { createGenerator } from "./level/Generator.js";
import {
  CombatSystem,
  DeathPlaneSystem,
  UpgradeSystem,
  ScoreSystem,
  SpawnSystem,
} from "./systems/index.js";
import { HUD, PatchPicker, Pause, Settings, Title, LevelSelect, GameOver } from "./ui/index.js";
import type { LevelId } from "./ui/index.js";
import { Renderer, GameCamera, SpritePool, ParticleSystem, DebugOverlay } from "./render/index.js";
import {
  AudioBus,
  AudioSystem,
  Music,
  SfxRegistry,
  applyAudioSettings,
  loadAudioSettings,
} from "./audio/index.js";
import type { SfxId } from "./audio/index.js";
import type { Enemy } from "./entities/enemies/Enemy.js";
import type { Obstacle } from "./entities/obstacles/Obstacle.js";
import type { Buff } from "./entities/buffs/Buff.js";
import type { Gum } from "./entities/obstacles/Gum.js";

// ─── Three.js scene ───────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// ─── Render module ────────────────────────────────────────────────────────

const renderer = new Renderer();
const camera = new GameCamera(window.innerWidth / window.innerHeight);
const spritePool = new SpritePool();
const particles = new ParticleSystem(scene);
const debugOverlay = new DebugOverlay();

// ─── Texture loading ──────────────────────────────────────────────────────
// Load the laundry-pile image used as the rising death plane.  Once decoded,
// the SpritePool resizes its plane mesh to span the play area while keeping
// the texture's aspect ratio, so the image's vertical midpoint sits exactly
// on the actual death-plane boundary.
const _textureLoader = new THREE.TextureLoader();
_textureLoader.load("assets/objects/laundry pile.png", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  // WORLD_WIDTH_TILES is declared below; capture by name at call time.
  spritePool.setDeathPlaneTexture(tex, WORLD_WIDTH_TILES, WORLD_WIDTH_TILES / 2);
});

// ─── World constants ──────────────────────────────────────────────────────

const WORLD_WIDTH_TILES = 12;
const WORLD_HEIGHT_TILES = 4000; // large enough to never overflow
const TILE_SIZE = 1; // 1 world unit = 1 m = 1 tile

/**
 * Lower bound of addressable tile-Y in the world.
 *
 * The player spawns at world y = 0 and climbs toward negative Y (Y+ = down).
 * The tile world therefore needs to address a large negative-Y range so the
 * upward play area (walls, procedural chunks) can be stored. We reserve a
 * small buffer below the spawn floor for the floor row and any underflow.
 */
const WORLD_Y_MIN = -(WORLD_HEIGHT_TILES - 8);

// ─── Systems ──────────────────────────────────────────────────────────────

const bus = createEventBus<GameEvents>();
const rng = createRNG(Date.now());
const world = new TileWorld(WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES, WORLD_Y_MIN);

/**
 * Seed the static play-area boundary into the tile world:
 *   - A solid floor row spanning the full play width at y = 2 (just below
 *     the player's spawn at y = 0).
 *   - Full-height solid wall columns at the leftmost and rightmost tiles
 *     extending UPWARD from the floor (Y+ = down, so upward = negative Y).
 *   - No ceiling — the player must climb upward freely.
 *
 * This guarantees the player can never fall (or be knocked) into empty
 * space outside the play area, regardless of what the procedural
 * generator places.
 */
function seedWorldBoundary(): void {
  // Full-width floor.
  world.fillRect(0, 2, WORLD_WIDTH_TILES, 1, true);
  // Side walls: span from the floor row (ty = 2) upward to the top of the
  // addressable range (ty = WORLD_Y_MIN). No ceiling above WORLD_Y_MIN.
  const wallTopY = WORLD_Y_MIN;
  const wallHeight = 3 - wallTopY; // covers ty in [WORLD_Y_MIN, 2]
  world.fillRect(0, wallTopY, 1, wallHeight, true);
  world.fillRect(WORLD_WIDTH_TILES - 1, wallTopY, 1, wallHeight, true);
}

seedWorldBoundary();

const player = new Player({ x: WORLD_WIDTH_TILES / 2, y: 0 }, {}, bus);

/**
 * Inclusive tile rectangle around the player's spawn position that the
 * procedural generator must keep clear. Sized to cover the player's body
 * AABB plus a one-tile margin in every direction so the player can never
 * spawn embedded in a wall or platform tile.
 */
const PLAYER_SPAWN_SAFE_ZONE = (() => {
  const cx = WORLD_WIDTH_TILES / 2;
  const cy = 0;
  const halfW = player.body.halfExtents.x;
  const halfH = player.body.halfExtents.y;
  const margin = 1;
  return {
    minTx: Math.floor(cx - halfW) - margin,
    maxTx: Math.floor(cx + halfW - 1e-6) + margin,
    minTy: Math.floor(cy - halfH) - margin,
    maxTy: Math.floor(cy + halfH - 1e-6) + margin,
  };
})();

const input = new Input(loadBindings());
input.attach(window);

// ─── Audio ────────────────────────────────────────────────────────────────
// Construct an AudioContext lazily on first user interaction (browsers block
// autoplay before a gesture). For now, create eagerly; muted-master default
// keeps it silent until configured.
const audioCtx: AudioContext | undefined =
  typeof window !== "undefined" && "AudioContext" in window
    ? new (window as unknown as { AudioContext: new () => AudioContext }).AudioContext()
    : undefined;
const audioBus = audioCtx !== undefined ? new AudioBus({ context: audioCtx }) : new AudioBus();
const audioSettings = loadAudioSettings();
applyAudioSettings(audioBus, audioSettings);

// Sfx registry + system: subscribe to GameEvents, look up buffers by id.
const sfxRegistry = new SfxRegistry();
const audioSystem = new AudioSystem(bus, audioBus, sfxRegistry);
void audioSystem; // retained reference; subscriptions live for the page session

// Music manager: looped playback + crossfade. Idle until a track is registered.
const music = new Music(audioCtx ?? null, audioBus.getChannelNode("music"));

/**
 * Map of SfxId → public asset filename in `public/assets/sounds/`. Each file
 * is fetched + decoded once at startup and registered with the SfxRegistry.
 * Ids without an entry here remain unregistered and silently no-op when their
 * event fires.
 */
const SFX_ASSETS: Partial<Record<SfxId, string>> = {
  levelStart: "coinfall.mp3",
  dash: "dash.mp3",
  playerHurt: "oof.mp3",
  hit: "pwtu.mp3",
  springRelease: "sproioioing.mp3",
  land: "tka.mp3",
  wallKick: "tick.mp3",
  attack: "whih.mp3",
  buffApplied: "wahaa.mp3",
  gumEnter: "squelch.mp3",
  gaugeFull: "whistleup.mp3",
};

/**
 * Asynchronously fetch + decode each SFX file and register it with the
 * SfxRegistry. Failures are logged but non-fatal — a missing or corrupt file
 * just leaves that id unregistered (silent at play time).
 */
async function loadSfxAssets(): Promise<void> {
  if (audioCtx === undefined) return;
  const base = import.meta.env.BASE_URL;
  await Promise.all(
    (Object.entries(SFX_ASSETS) as [SfxId, string][]).map(async ([id, file]) => {
      try {
        const res = await fetch(`${base}assets/sounds/${file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(data);
        sfxRegistry.register(id, buffer);
      } catch (err) {
        console.warn(`[audio] failed to load SFX '${id}' (${file}):`, err);
      }
    }),
  );
}

void loadSfxAssets();

// ─── Music tracks ─────────────────────────────────────────────────────────

/** Logical music id → public asset filename in `public/assets/music/`. */
const MUSIC_ASSETS = {
  title: "The Perfect Pair.mp3",
  gameOver: "winning.mp3",
  gameplay1: "Laundry Stomp.mp3",
  gameplay2: "Zipper Whistlestomp.mp3",
  gameplay3: "Found Object Folk.mp3",
} as const;
type MusicId = keyof typeof MUSIC_ASSETS;
/** Subset of MusicIds randomly chosen from at level start. */
const GAMEPLAY_MUSIC_IDS: readonly MusicId[] = ["gameplay1", "gameplay2", "gameplay3"];

/** Decoded music buffers, keyed by MusicId. Populated asynchronously. */
const musicBuffers = new Map<MusicId, AudioBuffer>();
/** Crossfade duration (seconds) used for all music transitions. */
const MUSIC_CROSSFADE_SEC = 0.6;
/** Currently-playing music id, or null when nothing is queued/playing. */
let currentMusicId: MusicId | null = null;

/**
 * Asynchronously fetch + decode each music track and stash it in
 * `musicBuffers`. Once the title track is decoded, start playing it. If a
 * later request to play a track happens before its buffer is decoded, the
 * request is honoured as soon as the decode finishes (`tryPlayMusic` is
 * idempotent).
 */
async function loadMusicAssets(): Promise<void> {
  if (audioCtx === undefined) return;
  const base = import.meta.env.BASE_URL;
  await Promise.all(
    (Object.entries(MUSIC_ASSETS) as [MusicId, string][]).map(async ([id, file]) => {
      try {
        const res = await fetch(`${base}assets/music/${encodeURIComponent(file)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(data);
        musicBuffers.set(id, buffer);
        // If this is the track we are currently *waiting* on, start it.
        if (currentMusicId === id) {
          music.play(buffer, MUSIC_CROSSFADE_SEC);
        }
      } catch (err) {
        console.warn(`[audio] failed to load music '${id}' (${file}):`, err);
      }
    }),
  );
}

/**
 * Switch music to the given track. If the buffer is not yet decoded, the id
 * is recorded so {@link loadMusicAssets} can start it once decoding finishes.
 * No-op when the requested track is already playing.
 */
function playMusic(id: MusicId): void {
  if (currentMusicId === id) return;
  currentMusicId = id;
  const buffer = musicBuffers.get(id);
  if (buffer !== undefined) {
    music.play(buffer, MUSIC_CROSSFADE_SEC);
  }
  // Otherwise: the load callback will start it once the decode completes.
}

void loadMusicAssets();
// Title screen is shown immediately on page load — queue its music too.
playMusic("title");

/**
 * Browsers suspend AudioContext until a user gesture. Resuming on
 * `onGameStart` alone is too late for the title screen — by then we are
 * already crossfading away to gameplay music. Listen for the first
 * pointer/key event globally so the title song begins as soon as the user
 * touches the page, and re-issue the active music selection so it actually
 * starts (sources `start()`-ed while suspended do not retroactively play
 * once the context resumes).
 */
let audioResumed = false;
function maybeResumeAudio(): void {
  if (audioResumed) return;
  audioResumed = true;
  if (audioCtx === undefined) return;
  const restart = (): void => {
    if (currentMusicId === null) return;
    const buffer = musicBuffers.get(currentMusicId);
    if (buffer !== undefined) {
      // Restart from a clean state — `play(buffer, 0)` stops any source that
      // was scheduled while suspended (and which the browser will not play
      // back) and starts a fresh, audible source.
      music.play(buffer, 0);
    }
  };
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().then(restart, restart);
  } else {
    restart();
  }
}

if (typeof window !== "undefined") {
  const onFirstGesture = (): void => {
    maybeResumeAudio();
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("keydown", onFirstGesture);
  };
  window.addEventListener("pointerdown", onFirstGesture);
  window.addEventListener("keydown", onFirstGesture);
}

let generator = createGenerator({
  seed: rng.int(0, 0x7fffffff),
  cameraY: 0,
  worldWidth: WORLD_WIDTH_TILES,
  spawnSafeZone: PLAYER_SPAWN_SAFE_ZONE,
});
const spawnSystem = new SpawnSystem(generator, world, bus);
const combatSystem = new CombatSystem(bus);
/**
 * Initial death-plane Y in world units. Sits just below the floor row
 * (floor occupies tiles y=2..3, so y=3 is its bottom edge), placing the plane
 * at the bottom of the playable level. It does not begin ascending until the
 * player has climbed high enough to start moving the camera (see
 * `deathPlaneActivated` below).
 */
const DEATH_PLANE_START_Y = 3;

const deathPlaneSystem = new DeathPlaneSystem(bus, { startY: DEATH_PLANE_START_Y });

/**
 * Height in metres the player must climb above their spawn before the
 * death plane begins to ascend. Y+ = down, so the activation threshold is
 * `player.body.position.y <= -DEATH_PLANE_ACTIVATION_HEIGHT`.
 */
const DEATH_PLANE_ACTIVATION_HEIGHT = 20;

/**
 * Latched once the player first climbs `DEATH_PLANE_ACTIVATION_HEIGHT`
 * metres above spawn. The death plane is held stationary at the bottom of
 * the level until then so the player has a beat to find their footing
 * before the rise begins.
 */
let deathPlaneActivated = false;
const upgradeSystem = new UpgradeSystem(bus, rng);
const scoreSystem = new ScoreSystem(bus);

// ─── UI layer ─────────────────────────────────────────────────────────────

const settings = new Settings(input, audioBus, audioSettings);
const hud = new HUD(bus);
const patchPicker = new PatchPicker(bus, upgradeSystem, player);

/**
 * True while the Settings overlay is open. Gameplay updates (including the
 * pause toggle) are fully suspended in this state so that key/button presses
 * used to navigate or rebind controls cannot leak into the simulation.
 */
let settingsOpen = false;

/** Open the settings overlay, suspending gameplay until it is closed. */
function openSettings(onClose: () => void): void {
  settingsOpen = true;
  settings.show(() => {
    settingsOpen = false;
    // Discard any input buffered while the overlay was up so the next
    // gameplay frame starts from a clean slate.
    input.flush();
    onClose();
  });
}

const pause = new Pause(bus, onQuit, () => { pause.hide(); openSettings(() => pause.show()); });
const title = new Title(
  () => { title.hide(); levelSelect.show(); },
  () => { title.hide(); openSettings(() => title.show()); },
);
const levelSelect = new LevelSelect(
  (level) => {
    selectedLevel = level;
    bus.emit("onGameStart", {});
  },
  () => { levelSelect.hide(); title.show(); },
);
const gameOver = new GameOver(bus, scoreSystem, onRestart);

// ─── Game state ───────────────────────────────────────────────────────────

let alive = false; // starts false — loop only runs after onGameStart
let paused = false;
/**
 * The level the player most recently selected from the LevelSelect screen.
 * Defaults to `1` so a programmatic `onGameStart` (tests, keyboard cheat,
 * etc.) still has a coherent value to act on. Currently used purely for
 * diagnostics — levels 2–4 are placeholders that the LevelSelect screen
 * does not let the player pick — but kept around so future per-level
 * generator/music branches have a single source of truth to read.
 */
let selectedLevel: LevelId = 1;
/**
 * True while the patch picker is open. Halts gameplay simulation just like
 * `paused`, but is tracked separately so the pause menu UI does not appear
 * and so the Pause input toggle is suppressed for the duration.
 */
let pickerOpen = false;

bus.on("onGameStart", () => {
  maybeResumeAudio();
  resetGame();
  alive = true;
  paused = false;
  pickerOpen = false;
  hud.show();
  // Pick a random gameplay track for this run.
  const idx = rng.int(0, GAMEPLAY_MUSIC_IDS.length - 1);
  playMusic(GAMEPLAY_MUSIC_IDS[idx]!);
});

bus.on("onPause", () => { paused = true; });
bus.on("onResume", () => { paused = false; input.flush(); });
bus.on("onPickerOpen", () => { pickerOpen = true; });
bus.on("onPickerClose", () => { pickerOpen = false; input.flush(); });

bus.on("onPlayerDeath", () => {
  alive = false;
  playMusic("gameOver");
});

// ─── Particle triggers ────────────────────────────────────────────────────

bus.on("onLand", () => {
  particles.emit("dust", player.body.position.x, player.body.position.y);
});
bus.on("onSpringRelease", () => {
  particles.emit("springPuff", player.body.position.x, player.body.position.y);
});bus.on("onJump", () => {
  particles.emit("dust", player.body.position.x, player.body.position.y);
});
bus.on("onDash", () => {
  particles.emit("dust", player.body.position.x, player.body.position.y);
});

// ─── Hit-flash visual feedback ────────────────────────────────────────
bus.on("onHit", ({ entityId }) => {
  spritePool.triggerHitFlash(entityId);
});
bus.on("onPlayerHurt", () => {
  spritePool.triggerPlayerHitFlash();
});
// ─── Active-buff edge tracking ───────────────────────────────────────

/**
 * Map of currently-active buff entity ids → the buff modKey used in the
 * onBuffApplied/onBuffExpired event payloads.  Lets us emit edge events
 * without modifying the Buff base class to take a bus reference.
 */
const activeBuffs = new Map<number, string>();
/** Reusable scratch list for ids whose buff is no longer present. */
const _expiredBuffIds: number[] = [];
/** Reusable scratch set for buff ids ticked this frame (no per-frame alloc). */
const _seenBuffIds = new Set<number>();

function resetActiveBuffs(): void {
  for (const modKey of activeBuffs.values()) {
    bus.emit("onBuffExpired", { buffId: modKey });
  }
  activeBuffs.clear();
}

function resetGame(): void {
  // Reset world tiles and re-seed the bounded play area.
  world.clear();
  seedWorldBoundary();

  // Fresh procedural generator with a new seed.
  generator = createGenerator({
    seed: rng.int(0, 0x7fffffff),
    cameraY: 0,
    worldWidth: WORLD_WIDTH_TILES,
    spawnSafeZone: PLAYER_SPAWN_SAFE_ZONE,
  });

  // Reset all systems, providing the new generator to SpawnSystem.
  spawnSystem.reset(generator);
  scoreSystem.reset();
  deathPlaneSystem.reset({ startY: DEATH_PLANE_START_Y });
  deathPlaneActivated = false;
  upgradeSystem.reset();

  // Respawn player at origin.
  player.spawn();
  player.body.position.x = WORLD_WIDTH_TILES / 2;
  player.body.position.y = 0;

  // Re-prime the interpolation source so the first render frame after a
  // reset doesn't lerp from the previous run's last position.
  prevPlayerX = player.body.position.x;
  prevPlayerY = player.body.position.y;

  // Refresh HUD-driven state.  HUD subscribes to these events; if no producer
  // re-fires them on reset the HP bar and gauge would carry stale values.
  resetActiveBuffs();
  player.emitHpSnapshot();
  bus.emit("onGaugeChanged", { fill: 0 });
  bus.emit("onDistanceChanged", { distance: 0 });

  // Discard any buffered input so nothing leaks into the first gameplay frame.
  input.flush();
}

function onQuit(): void {
  alive = false;
  paused = false;
  pickerOpen = false;
  pause.hide();
  hud.hide();
  renderer.clearCanvas();
  title.show();
  playMusic("title");
}

/** Diagnostic accessor so the selected level isn't an unused variable. */
export function getSelectedLevel(): LevelId {
  return selectedLevel;
}

function onRestart(): void {
  // Full reset — not just a reposition. Without this the world tile state,
  // generator, score, and active buffs all carry over from the previous run.
  resetGame();
  alive = true;
  paused = false;
  pickerOpen = false;
  // Pick a fresh random gameplay track for this run.
  const idx = rng.int(0, GAMEPLAY_MUSIC_IDS.length - 1);
  playMusic(GAMEPLAY_MUSIC_IDS[idx]!);
}

// ─── Game loop ────────────────────────────────────────────────────────────

const clock = createRealClock();
let prevPlayerX = 0;
let prevPlayerY = 0;
/** Wall-clock timestamp (ms) of the previous render frame; null on first call. */
let lastRenderMs: number | null = null;

const loop = createLoop({
  clock,
  stepHz: 120,
  update(dt) {
    // Sample input first so the pause toggle is always responsive.
    const snap = input.poll(clock.now());

    // While the settings overlay is open, gameplay is fully suspended and
    // no input (including the Pause toggle) is allowed to affect play.
    // The Pause action acts as a "back" button that closes the overlay,
    // except while the user is mid-rebind (in which case the press is being
    // captured as a new binding and must not also close the menu).
    if (settingsOpen) {
      if (snap.buttonsPressed.has("Pause") && !settings.isListening) {
        settings.hide();
      }
      return;
    }

    // Pause toggle — edge-detect the Pause action before alive/paused guards.
    // Suppressed while the patch picker is open so Escape can't dismiss play
    // out from under the picker (and so the pause menu doesn't stack on it).
    if (snap.buttonsPressed.has("Pause") && !pickerOpen) {
      bus.emit(paused ? "onResume" : "onPause", {});
    }

    // Music crossfades must advance even when no run is in progress so
    // transitions to/from the title and game-over tracks complete. Kept
    // outside the alive/paused guard for the same reason.
    music.update(dt);

    // ApplyPatch — open the picker when the gauge is full. Tried before the
    // alive/paused guard returns so the press is consumed even on the same
    // frame we transition into the picker-open state.
    if (
      alive &&
      !paused &&
      !pickerOpen &&
      snap.buttonsPressed.has("ApplyPatch")
    ) {
      upgradeSystem.tryOpenPicker(player);
    }

    if (!alive || paused || pickerOpen) return;

    // 1. Player controller.
    player.update(dt, snap, world);

    // 2. Combat: resolve player attacks against live enemy targets.
    const enemies = spawnSystem.liveEntities
      .filter((e) => e.kind === "enemy")
      .map((e) => e.entity as Parameters<typeof combatSystem.update>[3][0]);
    combatSystem.update(dt, snap, player, enemies);

    // 3. Physics step.
    step(player.body, world, dt);

    // 3b. Tick non-player entities (enemies, obstacles, buffs) and resolve
    //     contact damage / pickups against the player.  The generator owns
    //     spawn/despawn lifecycle; we only cull entities that the gameplay
    //     loop just defeated or consumed.
    const live = spawnSystem.liveEntities;
    const px = player.body.position.x;
    const py = player.body.position.y;
    // World-space Y of the top edge of the camera view (Y+ = down). Enemies
    // become "revealed" — and only then start moving toward the player —
    // once their position has scrolled into the viewport from above.
    const cameraTopY = camera.viewTopY;
    _seenBuffIds.clear();

    for (let i = 0; i < live.length; i++) {
      const se = live[i]!;
      if (se.kind === "enemy") {
        const enemy = se.entity as Enemy;
        if (!enemy.revealed && enemy.body.position.y >= cameraTopY) {
          enemy.revealed = true;
        }
        enemy.update(dt, px, py);
        step(enemy.body, world, dt);
        if (enemy.isAlive) {
          enemy.applyContactDamage(player);
        }
      } else if (se.kind === "obstacle") {
        const obstacle = se.entity as Obstacle;
        obstacle.update(dt);
        // Gum is a stat-mod trigger; everything else is contact damage.
        if (se.tag === "Gum") {
          const gum = obstacle as Gum;
          const wasInside = gum.isPlayerInside;
          gum.processPlayer(player);
          if (!wasInside && gum.isPlayerInside) {
            bus.emit("onGumEnter", {});
          }
        } else {
          obstacle.applyContactDamage(player);
        }
      } else {
        const buff = se.entity as Buff;
        const wasActive = activeBuffs.has(buff.id);
        buff.update(dt);
        const collected = buff.tryCollect(player);
        if (buff.isActive) {
          _seenBuffIds.add(buff.id);
          if (!wasActive) {
            activeBuffs.set(buff.id, buff.modKey);
            bus.emit("onBuffApplied", { buffId: buff.modKey, duration: buff.duration });
            if (collected) {
              bus.emit("onPickup", { itemId: buff.modKey });
            }
          }
        }
      }
    }

    // Cull dead enemies and expired buffs.  Use a scratch array to avoid
    // mutating the live list while iterating it above.
    _expiredBuffIds.length = 0;
    for (const [id, modKey] of activeBuffs) {
      if (!_seenBuffIds.has(id)) {
        _expiredBuffIds.push(id);
        bus.emit("onBuffExpired", { buffId: modKey });
      }
    }
    for (const id of _expiredBuffIds) activeBuffs.delete(id);
    for (let i = live.length - 1; i >= 0; i--) {
      const se = live[i]!;
      if (se.kind === "enemy" && !(se.entity as Enemy).isAlive) {
        spawnSystem.removeById(se.entity.id);
      }
    }

    // 4. Death plane — uses player's deathPlaneSpeedMultiplier stat.
    //    Held stationary at the bottom of the level until the player has
    //    climbed `DEATH_PLANE_ACTIVATION_HEIGHT` metres above spawn. Once
    //    activated it stays active for the remainder of the run.
    if (!deathPlaneActivated && player.body.position.y <= -DEATH_PLANE_ACTIVATION_HEIGHT) {
      deathPlaneActivated = true;
    }
    if (deathPlaneActivated) {
      deathPlaneSystem.update(dt, player.body, player.effectiveStats.deathPlaneSpeedMultiplier);
    }

    // 5. Level generation — advance ahead of camera.
    const cameraTileY = Math.floor(camera.worldY / TILE_SIZE);
    const deathPlaneTileY = Math.floor(deathPlaneSystem.planeY / TILE_SIZE);
    spawnSystem.advance(cameraTileY, deathPlaneTileY);

    // 6. Upgrade picker.
    upgradeSystem.update(player);

    // 7. Score — track highest position reached.
    scoreSystem.update(player.body.position.y);

    // 8. Advance particles. Music crossfades are advanced above the
    //    alive/paused guard so transitions to/from title and game-over
    //    music continue to play.
    particles.update(dt);

    prevPlayerX = player.body.position.x;
    prevPlayerY = player.body.position.y;
  },
  render(alpha) {
    if (!alive) return;

    // Interpolate player position for smooth rendering between physics steps.
    const renderX = prevPlayerX + (player.body.position.x - prevPlayerX) * alpha;
    const renderY = prevPlayerY + (player.body.position.y - prevPlayerY) * alpha;

    // Camera must be updated first — GameCamera.worldY is read for tile culling.
    camera.follow(renderX, renderY, deathPlaneSystem.planeY);

    // Advance hit-flash timers (independent of fixed-step gameplay).
    const nowMs = clock.now();
    const renderDt = lastRenderMs === null ? 0 : Math.max(0, (nowMs - lastRenderMs) / 1000);
    lastRenderMs = nowMs;
    spritePool.tick(renderDt);

    // Sync entity meshes.
    spritePool.syncPlayer(player, scene, renderX, renderY);
    spritePool.syncAll(spawnSystem.liveEntities, scene);
    spritePool.syncDeathPlane(deathPlaneSystem.planeY, scene, !deathPlaneActivated);
    spritePool.syncTiles(world, scene, camera.worldY);

    // Debug AABB wireframes (only when ?debug=1).
    if (debugOverlay.enabled) {
      const bodies = [player.body];
      for (const e of spawnSystem.liveEntities) {
        if (e.kind !== "buff") {
          // enemies and obstacles expose a public body property
          const asHasBody = e.entity as unknown as { body: (typeof player)["body"] };
          bodies.push(asHasBody.body);
        }
      }
      debugOverlay.sync(bodies, scene);
    }

    renderer.render(scene, camera.threeCamera);
  },
});

loop.start();

window.addEventListener("resize", () => {
  renderer.resize(window.innerWidth, window.innerHeight);
  camera.resize(window.innerWidth, window.innerHeight);
});

