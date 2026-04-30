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
import type { Path } from "./level/Path.js";
import { LEVEL_CONFIGS } from "./level/LevelConfig.js";
import { climbProgress, lateralAxis } from "./level/Axis.js";
import {
  CombatSystem,
  DeathPlaneSystem,
  UpgradeSystem,
  ScoreSystem,
  SpawnSystem,
} from "./systems/index.js";
import { ATTACK_TABLE } from "./systems/AttackTable.js";
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
let camera = new GameCamera(window.innerWidth / window.innerHeight, {
  climbDir: LEVEL_CONFIGS[1].climbDir,
});
const spritePool = new SpritePool();
const particles = new ParticleSystem(scene);
const debugOverlay = new DebugOverlay();

// ─── Texture loading ──────────────────────────────────────────────────────
// Load the laundry-pile image used as the rising death plane.  Once decoded,
// the SpritePool resizes its plane mesh to span the play area while keeping
// the texture's aspect ratio, so the image's vertical midpoint sits exactly
// on the actual death-plane boundary.
const _textureLoader = new THREE.TextureLoader();
/** Decoded death-plane texture; cached so level switches can re-skin it. */
let _deathPlaneTexture: THREE.Texture | null = null;
_textureLoader.load("assets/objects/laundry pile.png", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _deathPlaneTexture = tex;
  applyDeathPlaneTexture();
});

// ─── Player sprite-sheet animations ───────────────────────────────────────
// Each entry: state → (file, frameCount, frameW, frameH, fps, loop).
// Other states (jump / fall / dash / hurt / …) will be added later.
const PLAYER_SHEETS: ReadonlyArray<{
  state: import("./render/index.js").PlayerAnimState;
  file: string;
  frames: number;
  frameW: number;
  frameH: number;
  fps: number;
  loop: boolean;
}> = [
  { state: "idle", file: "idle.png", frames: 8, frameW: 64, frameH: 64, fps: 8, loop: true },
  { state: "walk", file: "walk.png", frames: 7, frameW: 64, frameH: 64, fps: 14, loop: true },
  { state: "crouch", file: "crouch.png", frames: 6, frameW: 64, frameH: 96, fps: 12, loop: false },
  // Attack frames spread across the full ATTACK_TABLE.Normal duration (12 / 60 s).
  // 10 frames over 0.2 s ≈ 50 fps so the animation finishes alongside the attack.
  { state: "attack", file: "attack.png", frames: 10, frameW: 128, frameH: 128, fps: 50, loop: false },
  { state: "crouchAttack", file: "crouch attack.png", frames: 10, frameW: 128, frameH: 48, fps: 50, loop: false },
];
for (const sheet of PLAYER_SHEETS) {
  _textureLoader.load(`assets/sprites/${encodeURI(sheet.file)}`, (tex) => {
    spritePool.playerAnimator.setSheet(
      sheet.state,
      tex,
      sheet.frames,
      sheet.frameW,
      sheet.frameH,
      sheet.fps,
      sheet.loop,
    );
  });
}

// ─── Buff pickup sprites ──────────────────────────────────────────────────
// Six animated pickup sprite-sheets are paired one-to-one with the six
// temporary-buff entity tags. The pairing is fixed (deterministic across
// sessions); each sheet's per-frame slicing is registered with the
// SpritePool so all live buff meshes of a given tag animate in lockstep.
interface BuffSpriteEntry {
  readonly tag: import("./level/Chunks.js").EntityTag;
  readonly file: string;
  readonly frames: number;
  readonly frameW: number;
  readonly frameH: number;
  readonly fps: number;
}
const BUFF_SPRITE_SHEETS: readonly BuffSpriteEntry[] = [
  { tag: "LowGravitySock", file: "girl sock.png",      frames: 8,  frameW: 32, frameH: 48, fps: 10 },
  { tag: "SpeedSock",      file: "green sock.png",     frames: 8,  frameW: 32, frameH: 48, fps: 10 },
  { tag: "HighJumpSock",   file: "smart sock.png",     frames: 11, frameW: 32, frameH: 48, fps: 12 },
  { tag: "PowerSock",      file: "demetrius sock.png", frames: 11, frameW: 32, frameH: 48, fps: 12 },
  { tag: "SlowFloodSock",  file: "underwear.png",      frames: 2,  frameW: 32, frameH: 32, fps: 4  },
  { tag: "RapidStrikeSock",file: "underwhere.png",     frames: 2,  frameW: 32, frameH: 32, fps: 4  },
];
for (const sheet of BUFF_SPRITE_SHEETS) {
  _textureLoader.load(`assets/sprites/${encodeURI(sheet.file)}`, (tex) => {
    spritePool.setEntitySheet(sheet.tag, tex, sheet.frames, sheet.frameW, sheet.frameH, sheet.fps);
  });
}

// ─── Obstacle / enemy sprite-sheets ───────────────────────────────────────
// Animated sprite-sheets for non-buff entities. Each entry registers the
// sheet's slicing with the SpritePool so all live meshes of that tag
// animate in lockstep.
interface EntitySpriteEntry {
  readonly tag: import("./level/Chunks.js").EntityTag;
  readonly file: string;
  readonly frames: number;
  readonly frameW: number;
  readonly frameH: number;
  readonly fps: number;
}
const ENTITY_SPRITE_SHEETS: readonly EntitySpriteEntry[] = [
  { tag: "DustBunny", file: "dust bunny.png", frames: 15, frameW: 48, frameH: 48, fps: 12 },
];
for (const sheet of ENTITY_SPRITE_SHEETS) {
  _textureLoader.load(`assets/sprites/${encodeURI(sheet.file)}`, (tex) => {
    spritePool.setEntitySheet(sheet.tag, tex, sheet.frames, sheet.frameW, sheet.frameH, sheet.fps);
  });
}

// ─── Level background textures ────────────────────────────────────────────
// Preload all room images shipped under public/assets/levels/. One is
// chosen at random on each `onGameStart` (see `resetGame()`) and assigned
// to `scene.background`. Textures decode asynchronously; until at least
// one has finished loading the scene falls back to its default colour.
const LEVEL_BACKGROUND_IDS = [
  "arcade",
  "basement",
  "bathroom",
  "kitchen",
  "mudroom",
] as const;
const _levelBackgrounds: THREE.Texture[] = [];
for (const id of LEVEL_BACKGROUND_IDS) {
  _textureLoader.load(`assets/levels/${id}.png`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    _levelBackgrounds.push(tex);
  });
}
/** Default scene background colour, restored when no image is active. */
const DEFAULT_SCENE_BACKGROUND = new THREE.Color(0x111111);

/**
 * Push the cached death-plane texture into the sprite pool sized to the
 * active level's lateral extent. Safe to call before the texture has
 * finished decoding (no-ops in that case) and after every level swap.
 */
function applyDeathPlaneTexture(): void {
  if (_deathPlaneTexture === null) return;
  const axis = activeLevel.climbDir.axis;
  // Lateral centre is only consulted by the renderer for "x" / "y"
  // climb axes — for path mode the death plane mesh's world position
  // is recomputed every frame from the live `Path`.
  const lateralCenter =
    axis === "x"
      ? activeLevel.corridorLateralExtent / 2 + activeLevel.worldYMin
      : activeLevel.corridorLateralExtent / 2;
  spritePool.setDeathPlaneTexture(
    _deathPlaneTexture,
    activeLevel.corridorLateralExtent,
    lateralCenter,
    activeLevel.climbDir,
  );
}

// ─── World constants ──────────────────────────────────────────────────────
// All per-level world parameters now live in LEVEL_CONFIGS. The constants
// below mirror the level-1 entry so test harnesses and inline accessors
// that import them keep working; the live values used at runtime are
// rebuilt from the active LevelConfig in `resetGame()`.

/**
 * The level the player most recently selected from the LevelSelect screen.
 * Defaults to `1` so a programmatic `onGameStart` (tests, keyboard cheat,
 * etc.) still has a coherent value to act on.
 */
let selectedLevel: LevelId = 1;
/** Active level configuration; rebuilt each `reconfigureLevel()` call. */
let activeLevel = LEVEL_CONFIGS[selectedLevel];

const TILE_SIZE = 1; // 1 world unit = 1 m = 1 tile

// ─── Systems ──────────────────────────────────────────────────────────────

const bus = createEventBus<GameEvents>();
const rng = createRNG(Date.now());

/**
 * The TileWorld is rebuilt whenever the player switches levels (the two
 * levels' tile-grid dimensions differ). The fixed game-loop closures
 * always read the current binding via the `world` module-level `let`.
 */
let world = new TileWorld(
  activeLevel.worldWidthTiles,
  activeLevel.worldHeightTiles,
  activeLevel.worldYMin,
);

/**
 * Seed the static play-area boundary into the tile world.
 *
 * Vertical climb (level 1):
 *   - Solid floor row at y = 2 spanning the full play width.
 *   - Full-height left + right wall columns from `worldYMin` to the floor.
 *   - No ceiling — the player must climb upward freely.
 *
 * Horizontal climb (level 2):
 *   - Solid ceiling row at y = `worldYMin` spanning the full world width.
 *   - Solid floor row at y = 2 spanning the full world width.
 *   - Solid trailing-wall column at x = 0 from ceiling to floor (the
 *     death wall starts here and advances rightward).
 *   - No leading-end wall — the corridor is open-ended.
 */
function seedWorldBoundary(): void {
  const W = activeLevel.worldWidthTiles;
  const yMin = activeLevel.worldYMin;
  if (activeLevel.climbDir.axis === "y") {
    world.fillRect(0, 2, W, 1, true);
    world.fillRect(0, yMin, 1, 3 - yMin, true);
    world.fillRect(W - 1, yMin, 1, 3 - yMin, true);
  } else if (activeLevel.climbDir.axis === "x") {
    // Ceiling row.
    world.fillRect(0, yMin, W, 1, true);
    // Floor row.
    world.fillRect(0, 2, W, 1, true);
    // Trailing wall column at x = 0 spanning the corridor height.
    world.fillRect(0, yMin, 1, 3 - yMin, true);
  } else {
    // Path-mode (level 3): the corridor itself is carved by the
    // SnakeGenerator, but the generator only places walls along the
    // corridor going forward (north of spawn). The south end is
    // open, so the player would fall infinitely without a manually
    // seeded back cap.
    //
    // Cap: a solid floor row spanning the full corridor width
    // (matching the wall positions at x = ±(halfW + 1) = ±5) plus
    // several rows of solid south of it so even if the player
    // somehow penetrates the floor they remain entombed instead of
    // falling forever.
    const cx = Math.floor(activeLevel.spawn.x);
    const halfWPlusWall = 10; // CORRIDOR_HALF_WIDTH (9) + 1 wall tile.
    world.fillRect(cx - halfWPlusWall, 1, halfWPlusWall * 2 + 1, 8, true);
  }
}

seedWorldBoundary();

let player = new Player(
  { x: activeLevel.spawn.x, y: activeLevel.spawn.y },
  {},
  bus,
);

/**
 * Inclusive tile rectangle around the player's spawn position that the
 * procedural generator must keep clear. Recomputed by
 * `reconfigureLevel()` since the spawn position varies per level.
 */
let PLAYER_SPAWN_SAFE_ZONE = computeSpawnSafeZone();

function computeSpawnSafeZone(): {
  minTx: number;
  maxTx: number;
  minTy: number;
  maxTy: number;
} {
  const cx = activeLevel.spawn.x;
  const cy = activeLevel.spawn.y;
  const halfW = player.body.halfExtents.x;
  const halfH = player.body.halfExtents.y;
  const margin = 1;
  return {
    minTx: Math.floor(cx - halfW) - margin,
    maxTx: Math.floor(cx + halfW - 1e-6) + margin,
    minTy: Math.floor(cy - halfH) - margin,
    maxTy: Math.floor(cy + halfH - 1e-6) + margin,
  };
}

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
  climbDir: activeLevel.climbDir,
  worldWidth: activeLevel.worldWidthTiles,
  worldYMin: activeLevel.worldYMin,
  spawnSafeZone: PLAYER_SPAWN_SAFE_ZONE,
  spawn: activeLevel.spawn,
});

/**
 * The live `Path` from a `SnakeGenerator` (level 3 only). `null` for
 * levels whose generator has no path. Used by gameplay systems to
 * estimate the player's arc-length progress and by the renderer to
 * project the death plane to world space.
 */
function activePath(): Path | null {
  // The SnakeGenerator's return shape includes a `path` getter; older
  // generators don't. Avoid depending on the union type here so a
  // missing `path` simply yields `null`.
  const maybe = generator as unknown as { path?: Path };
  return maybe.path ?? null;
}
let spawnSystem = new SpawnSystem(generator, world, bus);
const combatSystem = new CombatSystem(bus);

let deathPlaneSystem = new DeathPlaneSystem(bus, {
  climbDir: activeLevel.climbDir,
  start: activeLevel.deathPlaneStart,
});

/**
 * Latched once the player first travels `activeLevel.deathPlaneActivationDistance`
 * metres along the climb direction from spawn. The death plane is held
 * stationary until then so the player has a beat to find their footing
 * before the chase begins.
 */
let deathPlaneActivated = false;
const upgradeSystem = new UpgradeSystem(bus, rng, activeLevel.climbDir);
const scoreSystem = new ScoreSystem(bus, activeLevel.climbDir);

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
// `selectedLevel` and `activeLevel` are declared earlier (next to the
// world constants) since they are read by texture-loader callbacks that
// fire before the gameplay state below is initialised.
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
  // Apply the most recently selected level. Tile-grid dimensions, climb
  // direction, spawn position, and death-plane parameters are all
  // re-derived from `LEVEL_CONFIGS[selectedLevel]` so a level change
  // takes effect on the next run start.
  activeLevel = LEVEL_CONFIGS[selectedLevel];

  // Rebuild the TileWorld since dimensions vary per level.
  world = new TileWorld(
    activeLevel.worldWidthTiles,
    activeLevel.worldHeightTiles,
    activeLevel.worldYMin,
  );
  seedWorldBoundary();

  // Recompute the spawn safe zone for the active level.
  PLAYER_SPAWN_SAFE_ZONE = computeSpawnSafeZone();

  // Fresh procedural generator with a new seed.
  generator = createGenerator({
    seed: rng.int(0, 0x7fffffff),
    cameraY: 0,
    climbDir: activeLevel.climbDir,
    worldWidth: activeLevel.worldWidthTiles,
    worldYMin: activeLevel.worldYMin,
    spawnSafeZone: PLAYER_SPAWN_SAFE_ZONE,
    spawn: activeLevel.spawn,
  });

  // Rebuild axis-aware systems.
  spawnSystem = new SpawnSystem(generator, world, bus);
  scoreSystem.setClimbDir(activeLevel.climbDir);
  scoreSystem.reset();
  deathPlaneSystem = new DeathPlaneSystem(bus, {
    climbDir: activeLevel.climbDir,
    start: activeLevel.deathPlaneStart,
  });
  camera = new GameCamera(window.innerWidth / window.innerHeight, {
    climbDir: activeLevel.climbDir,
  });
  deathPlaneActivated = false;
  upgradeSystem.setClimbDir(activeLevel.climbDir);
  upgradeSystem.reset();

  // Re-skin the death plane to the active level's lateral extent /
  // orientation. Safe to call before the texture has decoded.
  applyDeathPlaneTexture();

  // Pick a random preloaded room image as the scene backdrop. If none
  // have decoded yet (first run, very fast start) fall back to the
  // default solid colour.
  if (_levelBackgrounds.length > 0) {
    const idx = rng.int(0, _levelBackgrounds.length - 1);
    scene.background = _levelBackgrounds[idx]!;
  } else {
    scene.background = DEFAULT_SCENE_BACKGROUND;
  }

  // Respawn player at the configured spawn position.
  player.spawn();
  player.body.position.x = activeLevel.spawn.x;
  player.body.position.y = activeLevel.spawn.y;

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
  scene.background = DEFAULT_SCENE_BACKGROUND;
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

// ─── Dev-only attack hitbox debug visualisation ───────────────────────────
// A translucent red rectangle is rendered at the active hitbox AABB during
// the attack's `active` window. Only constructed under `import.meta.env.DEV`
// so production bundles incur zero overhead.
const _attackHitboxMesh: THREE.Mesh | null = import.meta.env.DEV
  ? (() => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      );
      m.position.z = 1.5; // above the player mesh so it stays visible
      m.visible = false;
      scene.add(m);
      return m;
    })()
  : null;

function syncAttackHitboxDebug(): void {
  if (_attackHitboxMesh === null) return;
  const id = combatSystem.currentAttackId;
  const data = id !== "" ? ATTACK_TABLE[id] : undefined;
  if (data === undefined) {
    _attackHitboxMesh.visible = false;
    return;
  }
  const elapsed = combatSystem.attackElapsed;
  const inActive = elapsed >= data.startup && elapsed < data.startup + data.active;
  if (!inActive) {
    _attackHitboxMesh.visible = false;
    return;
  }
  const facing = player.facing;
  const hbX = player.body.position.x + data.offsetX * facing;
  const hbY = player.body.position.y + data.offsetY;
  _attackHitboxMesh.position.x = hbX;
  _attackHitboxMesh.position.y = -hbY; // Y-flip
  _attackHitboxMesh.scale.set(data.halfW * 2, data.halfH * 2, 1);
  _attackHitboxMesh.visible = true;
}

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
    // Coordinate of the leading edge of the camera view along the climb
    // axis (level 1: top of screen in world Y; level 2: right edge in
    // world X). Off-screen entities become "revealed" — and only then
    // start moving toward the player — once their position has scrolled
    // into the viewport from the leading edge.
    const cameraLeadingEdge = camera.viewLeadingEdge;
    const climbAxis = activeLevel.climbDir.axis;
    const climbSign = activeLevel.climbDir.sign;
    /**
     * In path-mode levels the climb axis is not a world coordinate, so
     * the leading-edge comparison below cannot be used. Reveal enemies
     * by world-space proximity to the player instead.
     */
    const PATH_REVEAL_RADIUS = 14;
    _seenBuffIds.clear();

    for (let i = 0; i < live.length; i++) {
      const se = live[i]!;
      if (se.kind === "enemy") {
        const enemy = se.entity as Enemy;
        // Reveal once the enemy's centre has crossed past the leading edge
        // of the camera (entered the visible play area). Sign-aware so the
        // same comparison works for level 1 (leading edge is the smaller Y)
        // and level 2 (leading edge is the larger X). For path-mode
        // levels we fall back to a Euclidean-distance check.
        if (!enemy.revealed) {
          if (climbAxis === "path") {
            const ex = enemy.body.position.x - px;
            const ey = enemy.body.position.y - py;
            if (ex * ex + ey * ey <= PATH_REVEAL_RADIUS * PATH_REVEAL_RADIUS) {
              enemy.revealed = true;
            }
          } else if (
            climbSign * enemy.body.position[climbAxis] <=
            climbSign * cameraLeadingEdge
          ) {
            enemy.revealed = true;
          }
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
    //    Held stationary at its starting position until the player has
    //    travelled `activeLevel.deathPlaneActivationDistance` metres along
    //    the climb direction. Once activated it stays active for the
    //    remainder of the run.
    //
    //    For path-mode levels we precompute path-`s` once and pass it
    //    through to every system that needs to compare against it.
    const path = activePath();
    const playerPathS =
      path !== null ? path.estimateS(player.body.position) : undefined;
    if (
      !deathPlaneActivated &&
      climbProgress(player.body.position, activeLevel.climbDir, playerPathS) >=
        activeLevel.deathPlaneActivationDistance
    ) {
      deathPlaneActivated = true;
    }
    if (deathPlaneActivated) {
      // Path mode: project the plane's `s` to world space once so the
      // death-plane kill check can use a finite 2-D rectangle bounded
      // by the corridor walls (matching the on-screen graphic) rather
      // than an infinite half-space along path-`s`.
      const pathContext =
        path !== null
          ? (() => {
              const proj = path.projectS(deathPlaneSystem.planePos);
              return {
                planeWorld: proj.position,
                tangent: proj.tangent,
                corridorHalfWidth: activeLevel.corridorLateralExtent / 2,
              };
            })()
          : undefined;
      deathPlaneSystem.update(
        dt,
        player.body,
        player.effectiveStats.deathPlaneSpeedMultiplier,
        playerPathS,
        pathContext,
      );
    }

    // 5. Level generation — advance ahead of camera. The generator's
    //    `advance` API takes climb-axis world tile coordinates regardless
    //    of orientation; we read the camera and death plane through their
    //    axis-agnostic accessors. For path-mode levels both arguments
    //    are path-`s` values floored to whole metres.
    const generatorPos =
      activeLevel.climbDir.axis === "path"
        ? Math.floor(playerPathS ?? 0)
        : Math.floor(camera.worldClimb / TILE_SIZE);
    const deathPlaneTile = Math.floor(deathPlaneSystem.planePos / TILE_SIZE);
    spawnSystem.advance(generatorPos, deathPlaneTile);

    // 6. Upgrade picker.
    upgradeSystem.update(player, playerPathS);

    // 7. Score — track furthest progress along the climb direction.
    scoreSystem.update(player.body.position, playerPathS);

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

    // Camera must be updated first — its climb-axis position is read for
    // tile culling.
    camera.follow(renderX, renderY, deathPlaneSystem.planePos);

    // Advance hit-flash timers (independent of fixed-step gameplay).
    const nowMs = clock.now();
    const renderDt = lastRenderMs === null ? 0 : Math.max(0, (nowMs - lastRenderMs) / 1000);
    lastRenderMs = nowMs;
    spritePool.tick(renderDt);

    // Sync entity meshes.
    spritePool.syncPlayer(player, scene, renderX, renderY, renderDt, combatSystem.isAttacking);
    spritePool.syncAll(spawnSystem.liveEntities, scene);
    spritePool.syncDeathPlane(
      deathPlaneSystem.planePos,
      scene,
      !deathPlaneActivated,
      activePath(),
    );
    spritePool.syncTiles(
      world,
      scene,
      camera.worldClimb,
      activeLevel.climbDir,
      camera.worldLateral,
    );

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

    // Dev-only attack hitbox visualisation. Renders a translucent red
    // square covering the active hitbox of the in-progress attack so we
    // can see exactly where the AoE is. Only present in `npm run dev`
    // builds (Vite strips this branch in production).
    syncAttackHitboxDebug();

    renderer.render(scene, camera.threeCamera);
  },
});

loop.start();

window.addEventListener("resize", () => {
  renderer.resize(window.innerWidth, window.innerHeight);
  camera.resize(window.innerWidth, window.innerHeight);
});

