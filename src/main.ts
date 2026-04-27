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
import { HUD, PatchPicker, Pause, Settings, Title, GameOver } from "./ui/index.js";
import { Renderer, GameCamera, SpritePool, ParticleSystem, DebugOverlay } from "./render/index.js";
import {
  AudioBus,
  applyAudioSettings,
  loadAudioSettings,
} from "./audio/index.js";

// ─── Three.js scene ───────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// ─── Render module ────────────────────────────────────────────────────────

const renderer = new Renderer();
const camera = new GameCamera(window.innerWidth / window.innerHeight);
const spritePool = new SpritePool();
const particles = new ParticleSystem(scene);
const debugOverlay = new DebugOverlay();

// ─── World constants ──────────────────────────────────────────────────────

const WORLD_WIDTH_TILES = 12;
const WORLD_HEIGHT_TILES = 4000; // large enough to never overflow
const TILE_SIZE = 1; // 1 world unit = 1 m = 1 tile

// ─── Systems ──────────────────────────────────────────────────────────────

const bus = createEventBus<GameEvents>();
const rng = createRNG(Date.now());
const world = new TileWorld(WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES);

// Seed a solid floor at y=2 (just below spawn at y=0).
world.fillRect(0, 2, WORLD_WIDTH_TILES, 1, true);

const player = new Player({ x: WORLD_WIDTH_TILES / 2, y: 0 });

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

const generator = createGenerator({ seed: rng.int(0, 0x7fffffff), cameraY: 0, worldWidth: WORLD_WIDTH_TILES });
const spawnSystem = new SpawnSystem(generator, world, bus);
const combatSystem = new CombatSystem(bus);
const deathPlaneSystem = new DeathPlaneSystem(bus, { startY: WORLD_HEIGHT_TILES / 4 });
const upgradeSystem = new UpgradeSystem(bus, rng);
const scoreSystem = new ScoreSystem(bus);

// ─── UI layer ─────────────────────────────────────────────────────────────

const settings = new Settings(input, audioBus, audioSettings);
const hud = new HUD(bus);
const patchPicker = new PatchPicker(bus, upgradeSystem, player);
const pause = new Pause(bus, onQuit, () => settings.show());
const title = new Title(bus, () => settings.show());
const gameOver = new GameOver(bus, scoreSystem, onRestart);

// ─── Game state ───────────────────────────────────────────────────────────

let alive = false; // starts false — loop only runs after onGameStart
let paused = false;

bus.on("onGameStart", () => {
  alive = true;
  paused = false;
  hud.show();
});

bus.on("onPause", () => { paused = true; });
bus.on("onResume", () => { paused = false; });

bus.on("onPlayerDeath", () => {
  alive = false;
});

// ─── Particle triggers ────────────────────────────────────────────────────

bus.on("onLand", () => {
  particles.emit("dust", player.body.position.x, player.body.position.y);
});
bus.on("onSpringRelease", () => {
  particles.emit("springPuff", player.body.position.x, player.body.position.y);
});

function onQuit(): void {
  alive = false;
  paused = false;
  title.show();
}

function onRestart(): void {
  // Hide game-over screen (done by GameOver internally via show/hide pattern)
  alive = true;
  paused = false;
  // Reset player position to spawn.
  player.body.position.x = WORLD_WIDTH_TILES / 2;
  player.body.position.y = 0;
}

// ─── Game loop ────────────────────────────────────────────────────────────

const clock = createRealClock();
let prevPlayerX = 0;
let prevPlayerY = 0;

const loop = createLoop({
  clock,
  stepHz: 120,
  update(dt) {
    // Sample input first so the pause toggle is always responsive.
    const snap = input.poll(clock.now());

    // Pause toggle — edge-detect the Pause action before alive/paused guards.
    if (snap.buttonsPressed.has("Pause")) {
      bus.emit(paused ? "onResume" : "onPause", {});
    }

    if (!alive || paused) return;

    // 1. Player controller.
    player.update(dt, snap);

    // 2. Combat: resolve player attacks against live enemy targets.
    const enemies = spawnSystem.liveEntities
      .filter((e) => e.kind === "enemy")
      .map((e) => e.entity as Parameters<typeof combatSystem.update>[3][0]);
    combatSystem.update(dt, snap, player, enemies);

    // 3. Physics step.
    step(player.body, world, dt);

    // 4. Death plane — uses player's deathPlaneSpeedMultiplier stat.
    deathPlaneSystem.update(dt, player.body, player.effectiveStats.deathPlaneSpeedMultiplier);

    // 5. Level generation — advance ahead of camera.
    const cameraTileY = Math.floor(camera.worldY / TILE_SIZE);
    const deathPlaneTileY = Math.floor(deathPlaneSystem.planeY / TILE_SIZE);
    spawnSystem.advance(cameraTileY, deathPlaneTileY);

    // 6. Upgrade picker.
    upgradeSystem.update(player);

    // 7. Score — track highest position reached.
    scoreSystem.update(player.body.position.y);

    // 8. Advance particles.
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

    // Sync entity meshes.
    spritePool.syncPlayer(player, scene, renderX, renderY);
    spritePool.syncAll(spawnSystem.liveEntities, scene);
    spritePool.syncDeathPlane(deathPlaneSystem.planeY, scene);
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

