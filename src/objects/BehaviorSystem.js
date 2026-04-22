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
        const range = trig.params.range ?? 0;
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
        if (propVal !== undefined) {
          if (comparison === 'lte' && propVal <= threshold) fired.push(trig.behaviorId);
          else if (comparison === 'lt'  && propVal <  threshold) fired.push(trig.behaviorId);
          else if (comparison === 'gte' && propVal >= threshold) fired.push(trig.behaviorId);
          else if (comparison === 'gt'  && propVal >  threshold) fired.push(trig.behaviorId);
          else if (comparison === 'eq'  && propVal === threshold) fired.push(trig.behaviorId);
        }
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
 */
export function applyEffect(effect, ownerObject, allLevelObjects) {
  const target =
    effect.targetRef === 'self'
      ? ownerObject
      : allLevelObjects.find((o) => o.id === effect.targetRef);

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
