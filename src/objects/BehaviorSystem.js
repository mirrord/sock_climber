/**
 * BehaviorSystem — evaluates trigger conditions and applies behavior effects.
 *
 * All functions are pure (stateless) except for timer state which is managed
 * by the caller (a persistent Map) so that it survives across frames without
 * allocating here.
 */

// ── Timer state helpers ────────────────────────────────────────────────────

/**
 * Create a fresh timer state map.
 * Keys are trigger-local keys (index-based), values are remaining seconds.
 * @returns {Map<string, number>}
 */
export function createTimerState() {
  return new Map();
}

// ── evaluateTriggers ────────────────────────────────────────────────────────

/**
 * Evaluate all triggers for a single object and return the list of behavior
 * ids that should fire this frame.
 *
 * @param {object} owner            — the level object these triggers belong to
 * @param {import('./BehaviorTrigger.js').BehaviorTrigger[]} triggers
 * @param {number} dt               — delta time in seconds
 * @param {{ actions: Set<string> }} inputSnapshot
 * @param {Set<string>} collisionEvents — set of behaviorIds that were marked as
 *   collided this frame (caller must populate from collision system)
 * @param {Map<string, number>} timerState — mutable timer countdown map
 * @param {object[]} [allLevelObjects=[]] — all objects in the level (for proximity)
 * @returns {string[]} — behavior ids to activate
 */
export function evaluateTriggers(
  owner,
  triggers,
  dt,
  inputSnapshot,
  collisionEvents,
  timerState,
  allLevelObjects = [],
) {
  const fired = [];

  for (let i = 0; i < triggers.length; i++) {
    const trig = triggers[i];
    const key = `${owner.id}_${i}`;

    switch (trig.type) {
      case 'timer': {
        const interval = trig.params.interval ?? 1.0;
        const remaining = (timerState.get(key) ?? interval) - dt;
        if (remaining <= 0) {
          fired.push(trig.behaviorId);
          timerState.set(key, interval);
        } else {
          timerState.set(key, remaining);
        }
        break;
      }

      case 'proximity': {
        const range = trig.params.radius ?? trig.params.range ?? 0;
        const inRange = allLevelObjects.some((obj) => {
          if (obj === owner || obj.id === owner.id) return false;
          const dx = (obj.x ?? 0) - (owner.x ?? 0);
          const dy = (obj.y ?? 0) - (owner.y ?? 0);
          return Math.sqrt(dx * dx + dy * dy) <= range;
        });
        if (inRange) fired.push(trig.behaviorId);
        break;
      }

      case 'on_collide': {
        if (collisionEvents.has(trig.behaviorId)) {
          fired.push(trig.behaviorId);
        }
        break;
      }

      case 'control': {
        const action = trig.params.action ?? '';
        if (action && inputSnapshot.actions.has(action)) {
          fired.push(trig.behaviorId);
        }
        break;
      }

      case 'stat_change': {
        const propKey = trig.params.property;
        const threshold = trig.params.threshold ?? 0;
        const comparison = trig.params.comparison ?? 'lte';
        const propVal = owner.properties?.[propKey];
        const prevKey = `${key}_prev`;
        let conditionMet = false;
        if (propVal !== undefined) {
          if (comparison === 'lte' && propVal <= threshold) conditionMet = true;
          else if (comparison === 'lt'  && propVal <  threshold) conditionMet = true;
          else if (comparison === 'gte' && propVal >= threshold) conditionMet = true;
          else if (comparison === 'gt'  && propVal >  threshold) conditionMet = true;
          else if (comparison === 'eq'  && propVal === threshold) conditionMet = true;
        }
        const wasTrue = timerState.get(prevKey) === true;
        timerState.set(prevKey, conditionMet);
        if (conditionMet && !wasTrue) fired.push(trig.behaviorId);
        break;
      }

      case 'on_interact':
        // Placeholder — requires player action system; never fires automatically.
        break;

      default:
        break;
    }
  }

  return fired;
}

// ── applyEffect ─────────────────────────────────────────────────────────────

/**
 * Apply a single BehaviorEffect, mutating the target object.
 *
 * Supported property paths:
 *   'x'                   → object.x
 *   'y'                   → object.y
 *   'properties.<key>'    → object.properties[key]
 *
 * @param {import('./BehaviorEffect.js').BehaviorEffect} effect
 * @param {object} ownerObject         — the object the behavior belongs to
 * @param {object[]} allLevelObjects   — all level objects (for remote targeting)
 * @param {Map<string, string[]>} [contacts] — contact map from detectContacts; required to resolve 'target'
 */
export function applyEffect(effect, ownerObject, allLevelObjects, contacts = new Map()) {
  let target;
  if (effect.targetRef === 'self') {
    target = ownerObject;
  } else if (effect.targetRef === 'target') {
    const contactIds = contacts.get(ownerObject.id) ?? [];
    const firstId = contactIds[0];
    target = firstId ? allLevelObjects.find((o) => o.id === firstId) : undefined;
  } else {
    target = allLevelObjects.find((o) => o.id === effect.targetRef);
  }

  if (!target) return;

  const { property, operation, value } = effect;

  if (property === 'x' || property === 'y') {
    _applyOp(target, property, operation, value);
    return;
  }

  if (property.startsWith('properties.')) {
    const key = property.slice('properties.'.length);
    if (!target.properties) target.properties = {};
    _applyOp(target.properties, key, operation, value);
    return;
  }
}

/**
 * Apply an arithmetic or assignment operation to obj[key].
 * @param {object} obj
 * @param {string} key
 * @param {'set'|'add'|'multiply'} operation
 * @param {number|string|boolean} value
 */
function _applyOp(obj, key, operation, value) {
  switch (operation) {
    case 'set':
      obj[key] = value;
      break;
    case 'add':
      obj[key] = (obj[key] ?? 0) + value;
      break;
    case 'multiply':
      obj[key] = (obj[key] ?? 0) * value;
      break;
    default:
      break;
  }
}

// ── detectContacts ─────────────────────────────────────────────────────────

/**
 * Compute AABB overlaps for a flat list of level objects.
 * Returns a Map<id, id[]> where each array is the list of ids that object
 * is currently touching.
 *
 * Object bounds: center at (x, y); half-extents from properties.width/height
 * (defaulting to 1×1).
 *
 * @param {object[]} levelObjects
 * @returns {Map<string, string[]>}
 */
export function detectContacts(levelObjects) {
  const contacts = new Map();
  const n = levelObjects.length;
  for (let i = 0; i < n; i++) {
    const a = levelObjects[i];
    const aw = (a.properties?.width ?? 1) / 2;
    const ah = (a.properties?.height ?? 1) / 2;
    for (let j = i + 1; j < n; j++) {
      const b = levelObjects[j];
      const bw = (b.properties?.width ?? 1) / 2;
      const bh = (b.properties?.height ?? 1) / 2;
      const overlapX = Math.abs((a.x ?? 0) - (b.x ?? 0)) < aw + bw;
      const overlapY = Math.abs((a.y ?? 0) - (b.y ?? 0)) < ah + bh;
      if (overlapX && overlapY) {
        if (!contacts.has(a.id)) contacts.set(a.id, []);
        if (!contacts.has(b.id)) contacts.set(b.id, []);
        contacts.get(a.id).push(b.id);
        contacts.get(b.id).push(a.id);
      }
    }
  }
  return contacts;
}

// ── executeBehavior ────────────────────────────────────────────────────────

/**
 * Execute all effects of a behavior for a given owner object.
 * Normal (set/add/multiply) effects are applied immediately.
 * 'spawn' effects produce SpawnRequest records for the caller to process.
 * 'destroy' effects produce object ids for the caller to remove.
 *
 * @param {import('./Behavior.js').Behavior} behavior
 * @param {object} ownerObject
 * @param {object[]} allLevelObjects
 * @param {Map<string, string[]>} contacts  — from detectContacts()
 * @returns {{ spawnRequests: SpawnRequest[], destroyIds: string[] }}
 */
export function executeBehavior(behavior, ownerObject, allLevelObjects, contacts) {
  const spawnRequests = [];
  const destroyIds = [];

  for (const effect of (behavior.effects ?? [])) {
    if (effect.operation === 'spawn') {
      if (!effect.spawnSpec) continue;
      const spec = effect.spawnSpec;
      spawnRequests.push({
        objectType: spec.objectType,
        x: (ownerObject.x ?? 0) + (spec.offsetX ?? 0),
        y: (ownerObject.y ?? 0) + (spec.offsetY ?? 0),
        velocityX: spec.velocityX ?? 0,
        velocityY: spec.velocityY ?? 0,
        properties: { ...(spec.properties ?? {}) },
        lifetime: spec.lifetime ?? 0,
        ownerId: ownerObject.id,
      });
    } else if (effect.operation === 'destroy') {
      // Resolve the target id
      let targetId;
      if (effect.targetRef === 'self') {
        targetId = ownerObject.id;
      } else if (effect.targetRef === 'target') {
        const contactIds = contacts.get(ownerObject.id) ?? [];
        targetId = contactIds[0] ?? null;
      } else {
        targetId = effect.targetRef;
      }
      if (targetId) destroyIds.push(targetId);
    } else {
      applyEffect(effect, ownerObject, allLevelObjects, contacts);
    }
  }

  return { spawnRequests, destroyIds };
}

/**
 * @typedef {object} SpawnRequest
 * @property {string} objectType
 * @property {number} x
 * @property {number} y
 * @property {number} velocityX
 * @property {number} velocityY
 * @property {object} properties
 * @property {number} lifetime   — seconds; 0 = infinite
 * @property {string} ownerId
 */
