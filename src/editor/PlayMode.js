import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_SIZE } from '../editor/editorConstants.js';
import { PlayerController } from '../player/PlayerController.js';
import { InputSystem } from '../input/InputSystem.js';
import { ActionMap } from '../input/ActionMap.js';
import { SettingsStore } from '../settings/SettingsStore.js';
import { PLAYER_W, PLAYER_H, FIXED_DT } from '../utils/constants.js';
import { resolveBehaviorAnimDef } from './animUtils.js';
import { STATE } from '../player/PlayerState.js';
import { evaluateTriggers, applyEffect, createTimerState, detectContacts, executeBehavior } from '../objects/BehaviorSystem.js';

/**
 * Maps a PlayerController state string to the behavior id used to look up
 * the associated animation on the player's GameObject definition.
 * @type {Record<string, string>}
 */
const STATE_BEHAVIOR = {
  [STATE.IDLE]:       'idle',
  [STATE.RUNNING]:    'move_right',  // move_left shares the same animation
  [STATE.JUMPING]:    'jump',
  [STATE.FALLING]:    'fall',
  [STATE.CROUCHING]:  'crouch',
  [STATE.WALL_SLIDE]: 'idle',        // no dedicated wall-slide behavior
  [STATE.MOVE_UP]:    'move_up',     // free vertical movement (no gravity)
  [STATE.MOVE_DOWN]:  'move_down',   // free vertical movement (no gravity)
};

/** Dead-zone threshold for analogue sticks. */
const STICK_DEAD = 0.5;

/**
 * Map raw Gamepad API state to the three boolean inputs PlayMode needs.
 * Pure function — safe to call with mock data in tests.
 *
 * Standard mapping (W3C):
 *   button 0  = A / Cross         → jump
 *   button 12 = D-Pad Up          → jump
 *   button 14 = D-Pad Left        → left
 *   button 15 = D-Pad Right       → right
 *   axis  0   = Left stick horiz  → left / right
 *
 * @param {Iterable<Gamepad|null|undefined>} gamepads
 * @returns {{ left: boolean, right: boolean, jump: boolean }}
 */
export function pollGamepadInput(gamepads) {
  const result = { left: false, right: false, jump: false };
  for (const gp of gamepads) {
    if (!gp) continue;
    if (gp.buttons[14]?.pressed)           result.left  = true;
    if (gp.buttons[15]?.pressed)           result.right = true;
    if (gp.buttons[0]?.pressed)            result.jump  = true;
    if (gp.buttons[12]?.pressed)           result.jump  = true;
    const ax = gp.axes[0] ?? 0;
    if (ax < -STICK_DEAD)                  result.left  = true;
    if (ax >  STICK_DEAD)                  result.right = true;
  }
  return result;
}

/**
 * Convert an InputSystem snapshot to the boolean input format expected by
 * PlayerController.step().
 *
 * @param {{ actions: ReadonlySet<string> }} snapshot
 * @returns {{ left: boolean, right: boolean, jump: boolean, dash: boolean, crouch: boolean }}
 */
export function snapshotToControllerInput(snapshot) {
  const a = snapshot.actions;
  return {
    left:   a.has('moveLeft'),
    right:  a.has('moveRight'),
    jump:   a.has('jump'),
    dash:   a.has('dash'),
    crouch: a.has('crouch'),
  };
}

/**
 * Minimal player controller for play-testing a level.
 * Handles movement, gravity, AABB collision against level tiles.
 */
export class PlayMode {
  /**
   * @param {import('../level/Level.js').Level} level
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} [options]
   * @param {InputSystem} [options.inputSystem] — injectable for testing; a default is created if omitted
   * @param {THREE.Mesh|null} [options.playerMesh] — mesh from the renderer representing the
   *   level's player object. When provided PlayMode drives it directly and does not
   *   create or destroy the placeholder. When omitted a cyan placeholder is created.
   * @param {EventTarget} [options.eventTarget] — target for input listener attachment;
   *   defaults to globalThis (=== window in browsers). Injectable for testing.
   * @param {object|null} [options.playerDef] — the player’s GameObject definition.
   *   When provided, PlayMode calls onAnimationChange whenever the controller
   *   state changes, passing the resolved animation definition.
   * @param {((animDef: object|null) => void)|null} [options.onAnimationChange] —
   *   called with the new animation definition each time the player state changes.
   * @param {((dt: number) => void)|null} [options.onAnimationsUpdate] —
   *   called with dt each frame so the renderer can advance all object animations.
   * @param {Map<string, import('../objects/GameObject.js').GameObject>|null} [options.objectDefs] —
   *   Map<type, GameObject> for all object types; used by BehaviorSystem.
   */
  constructor(level, scene, camera, { inputSystem, playerMesh, eventTarget, playerDef, onAnimationChange, onAnimationsUpdate, onPausePressed, objectDefs } = {}) {
    this.level = level;
    this.scene = scene;
    this.camera = camera;

    // Input system — use injected instance or create a default one
    if (inputSystem) {
      this._inputSystem = inputSystem;
    } else {
      const settings = new SettingsStore();
      const actionMap = new ActionMap(settings);
      this._inputSystem = new InputSystem(actionMap);
    }
    // Event target stored so dispose() can detach from the same target.
    this._eventTarget = eventTarget ?? globalThis;
    this._inputSystem.attach(this._eventTarget);

    // Player spawn from the level's configured player object
    const spawn = level.findPlayerSpawn() ?? level.findSpawn();
    this._offsetX = level.width / 2;
    this._offsetY = level.height / 2;

    // Player controller — physics owned here, positioned at spawn
    const enableGravity = playerDef?.properties?.enableGravity !== false;
    this._ctrl = new PlayerController(
      { enableGravity },
      (gx, gy) => level.getTile(gx, gy) === TILE.SOLID
    );
    this._ctrl.x = spawn.x + 0.5;
    this._ctrl.y = spawn.y + 0.5;

    this._accumulator = 0;

    // Animation-state tracking
    this._playerDef = playerDef ?? null;
    this._onAnimationChange = onAnimationChange ?? null;
    /** @type {string|undefined} Tracks the last resolved animDef.id to avoid redundant callbacks. */
    this._lastAnimId = undefined;

    // Pause action — rising-edge detection
    this._onPausePressed = onPausePressed ?? null;
    this._pauseWasActive = false;

    // Per-frame animation tick callback (drives renderer.updateObjectAnimations)
    this._onAnimationsUpdate = onAnimationsUpdate ?? null;

    // Behavior system
    this._objectDefs = objectDefs ?? null;
    this._timerState = createTimerState();
    /** @type {Map<string, {obj: object, mesh: THREE.Mesh, lifetime: number}>} */
    this._runtimeObjects = new Map();

    // Player mesh: use the level's player object mesh when provided; otherwise
    // create a cyan placeholder so play-testing still works without a full renderer.
    if (playerMesh) {
      this.mesh = playerMesh;
      this._ownsPlayerMesh = false;
    } else {
      const geo = new THREE.PlaneGeometry(PLAYER_W * TILE_SIZE, PLAYER_H * TILE_SIZE);
      const mat = new THREE.MeshBasicMaterial({ color: 0x48bfe3 });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.position.z = 0.2;
      scene.add(this.mesh);
      this._ownsPlayerMesh = true;
    }
  }

  /**
   * Sample input and fire onPausePressed on the rising edge of the pause action.
   * Called every frame (by update() or pollPause()).
   * @private
   */
  _sampleInput() {
    this._inputSystem.update();
    const isPauseActive = this._inputSystem.snapshot.actions.has('pause');
    if (isPauseActive && !this._pauseWasActive && this._onPausePressed) {
      this._onPausePressed();
    }
    this._pauseWasActive = isPauseActive;
  }

  /**
   * Sample input only (no physics). Use this when the game is paused so that
   * the gamepad/keyboard pause button can trigger a resume.
   */
  pollPause() {
    this._sampleInput();
  }

  /** Advance simulation and sync visuals. */
  update(dt) {
    this._sampleInput();
    const input = snapshotToControllerInput(this._inputSystem.snapshot);
    this._accumulator += dt;
    while (this._accumulator >= FIXED_DT) {
      this._ctrl.step(input, FIXED_DT);
      this._accumulator -= FIXED_DT;
    }
    this._runBehaviorSystem(dt);
    this._updatePlayerAnimation();
    if (this._onAnimationsUpdate) this._onAnimationsUpdate(dt);
    this._syncMesh();
    this._syncCamera();
  }

  /** Remove mesh and detach input listeners. */
  dispose() {
    this._inputSystem.detach(this._eventTarget);
    // Clean up runtime-spawned objects
    for (const { mesh } of this._runtimeObjects.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this._runtimeObjects.clear();
    if (this._ownsPlayerMesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }

  /** Access the input system for external use (e.g., pause menu navigation). */
  get inputSystem() {
    return this._inputSystem;
  }

  // ---- Private ----

  /**
   * Run the behavior system for all level objects (including the player).
   * Evaluates triggers and applies effects each frame.
   * @param {number} dt
   */
  _runBehaviorSystem(dt) {
    if (!this._objectDefs) return;

    // Build the full object list: level objects + runtime-spawned objects
    const levelObjs = this.level.objects;
    const runtimeObjs = Array.from(this._runtimeObjects.values()).map((r) => r.obj);
    const allObjs = [...levelObjs, ...runtimeObjs];

    // Sync player level-object position from the physics controller so proximity
    // checks and collision detection use the current world position.
    const playerLevelObj = levelObjs.find((o) => o.type === 'player');
    if (playerLevelObj) {
      playerLevelObj.x = this._ctrl.x;
      playerLevelObj.y = this._ctrl.y;
    }

    // Detect AABB contacts between all objects
    const contacts = detectContacts(allObjs);

    const snapshot = this._inputSystem.snapshot;

    // Collect spawn and destroy requests across all objects this frame
    const spawnQueue = [];
    const destroySet = new Set();

    for (const obj of allObjs) {
      const def = this._objectDefs.get(obj.type);
      if (!def) continue;

      // Build per-object collisionEvents: add behaviorIds for on_collide triggers
      // whose 'with' type matches at least one of this object's current contacts.
      const objContactIds = contacts.get(obj.id) ?? [];
      const objCollisionEvents = new Set();
      const defTriggers = def.triggers ?? [];
      if (objContactIds.length > 0) {
        for (const trig of defTriggers) {
          if (trig.type !== 'on_collide') continue;
          const withType = trig.params?.with;
          if (!withType || objContactIds.some((cId) => {
            const co = allObjs.find((o) => o.id === cId);
            return co && co.type === withType;
          })) {
            objCollisionEvents.add(trig.behaviorId);
          }
        }
      }

      const fired = evaluateTriggers(
        obj,
        defTriggers,
        dt,
        snapshot,
        objCollisionEvents,
        this._timerState,
        allObjs,
      );

      for (const behaviorId of fired) {
        const behavior = def.behaviors.find((b) => b.id === behaviorId);
        if (!behavior) continue;
        const { spawnRequests, destroyIds } = executeBehavior(behavior, obj, allObjs, contacts);
        for (const req of spawnRequests) spawnQueue.push(req);
        for (const id of destroyIds) destroySet.add(id);
      }
    }

    // Update lifetime of existing runtime objects; mark expired ones for destroy
    for (const [id, entry] of this._runtimeObjects) {
      if (entry.lifetime > 0) {
        entry.lifetime -= dt;
        if (entry.lifetime <= 0) destroySet.add(id);
      }
    }

    // Process destroy requests
    for (const id of destroySet) {
      this._destroyRuntimeObject(id);
    }

    // Process spawn requests
    for (const req of spawnQueue) {
      this._spawnRuntimeObject(req);
    }
  }

  /**
   * Spawn a new runtime object from a SpawnRequest.
   * @param {import('../objects/BehaviorSystem.js').SpawnRequest} req
   */
  _spawnRuntimeObject(req) {
    const id = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const w = (req.properties?.width ?? 0.5) * TILE_SIZE;
    const h = (req.properties?.height ?? 0.5) * TILE_SIZE;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = (req.x - this._offsetX) * TILE_SIZE;
    mesh.position.y = (req.y - this._offsetY) * TILE_SIZE;
    mesh.position.z = 0.1;
    this.scene.add(mesh);
    const obj = {
      id,
      type: req.objectType,
      x: req.x,
      y: req.y,
      properties: {
        velocityX: req.velocityX,
        velocityY: req.velocityY,
        ...req.properties,
      },
    };
    this._runtimeObjects.set(id, { obj, mesh, lifetime: req.lifetime });
  }

  /**
   * Remove a runtime object by id (level or runtime).
   * Also purges any timer/stat-change state entries keyed by this id.
   * @param {string} id
   */
  _destroyRuntimeObject(id) {
    const entry = this._runtimeObjects.get(id);
    if (entry) {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
      this._runtimeObjects.delete(id);
    }
    // Purge any timerState / stat_change-prev entries for this object id
    const prefix = `${id}_`;
    for (const key of this._timerState.keys()) {
      if (key.startsWith(prefix)) this._timerState.delete(key);
    }
  }

  /**
   * Emit onAnimationChange when the resolved animation changes.
   * Direction of horizontal movement is used to disambiguate move_left vs move_right
   * so that each can carry its own animation.
   * Tracks by resolved animDef.id so switching between behaviors that share the
   * same animation does not restart it unnecessarily.
   */
  _updatePlayerAnimation() {
    if (!this._playerDef || !this._onAnimationChange) return;
    const state = this._ctrl.state;
    let behaviorId = STATE_BEHAVIOR[state] ?? 'idle';
    // Distinguish left/right running so move_left animations are honoured
    if (state === STATE.RUNNING && this._ctrl.vx < 0) {
      behaviorId = 'move_left';
    }
    // For FALLING, try 'jump' as an intermediate fallback before 'idle' so the
    // jump animation continues playing when no dedicated fall animation is set.
    // This preserves visual continuity and prevents a blank frame on fall entry.
    let animDef = resolveBehaviorAnimDef(this._playerDef, behaviorId);
    if (!animDef && state === STATE.FALLING) {
      animDef = resolveBehaviorAnimDef(this._playerDef, 'jump');
    }
    // For MOVE_DOWN, fall back to move_up animation when no dedicated animation is set.
    if (!animDef && state === STATE.MOVE_DOWN) {
      animDef = resolveBehaviorAnimDef(this._playerDef, 'move_up');
    }
    animDef ??= resolveBehaviorAnimDef(this._playerDef, 'idle');
    const animId = animDef?.id ?? null;
    if (animId === this._lastAnimId) return;
    this._lastAnimId = animId;
    this._onAnimationChange(animDef);
  }

  _syncMesh() {
    this.mesh.position.x = (this._ctrl.x - this._offsetX) * TILE_SIZE;
    this.mesh.position.y = (this._ctrl.y - this._offsetY) * TILE_SIZE;
    this.mesh.scale.x = this._ctrl.facing === 'left' ? -1 : 1;
  }

  _syncCamera() {
    const cx = (this._ctrl.x - this._offsetX) * TILE_SIZE;
    const cy = (this._ctrl.y - this._offsetY) * TILE_SIZE;
    const hw = (this.camera.right - this.camera.left) / 2;
    const hh = (this.camera.top - this.camera.bottom) / 2;
    this.camera.left = cx - hw;
    this.camera.right = cx + hw;
    this.camera.top = cy + hh;
    this.camera.bottom = cy - hh;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Factory that wires a PlayMode to an existing renderer for a given level.
 * Finds the player object mesh, resolves its definition from objectDefs, and
 * sets up the onAnimationChange callback automatically.
 *
 * This is the single point of play-session construction shared by both the
 * level-select PlayScreen and the editor's in-place test mode.
 *
 * @param {import('../level/Level.js').Level} level
 * @param {{ scene: THREE.Scene, camera: THREE.Camera, getObjectMesh: (id: string) => THREE.Mesh|null, setObjectAnimation: (id: string, animDef: object|null) => void }} renderer
 * @param {Map<string, object>|null} objectDefs — Map<type, GameObject> built from the object store
 * @param {object} [options] — forwarded to the PlayMode constructor (e.g. { inputSystem, eventTarget } for testing)
 * @returns {PlayMode}
 */
export function createPlayMode(level, renderer, objectDefs, options = {}) {
  const playerObj = level.findObjectByType('player');
  const playerMesh = playerObj ? renderer.getObjectMesh(playerObj.id) : null;
  const playerDef = objectDefs?.get('player') ?? null;
  const onAnimationChange = (playerObj && playerDef)
    ? (animDef) => renderer.setObjectAnimation(playerObj.id, animDef)
    : null;
  const onAnimationsUpdate = typeof renderer.updateObjectAnimations === 'function'
    ? (dt) => renderer.updateObjectAnimations(dt)
    : null;
  return new PlayMode(
    level,
    renderer.scene,
    renderer.camera,
    { playerMesh, playerDef, onAnimationChange, onAnimationsUpdate, objectDefs, ...options },
  );
}
