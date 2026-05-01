/**
 * Records — persistent per-level best-distance tracker.
 *
 * Stores the longest distance (whole metres) the player has ever
 * traversed on each tracked level under a single localStorage key.
 *
 * Currently tracked: levels 1, 2, 3 (the linear-climb levels). Level 4
 * (the boss arena) is intentionally excluded — its run length is not
 * a meaningful "distance" measurement.
 */

/** Levels that have a tracked distance record. */
export type TrackedLevelId = 1 | 2 | 3;

/** Shape of the on-disk record blob. Missing entries default to 0. */
export type RecordsBlob = Partial<Record<TrackedLevelId, number>>;

const STORAGE_KEY = "sock_climber_records";

/** Set of levels that should have a record displayed/recorded. */
export const TRACKED_LEVELS: ReadonlySet<TrackedLevelId> = new Set<TrackedLevelId>([1, 2, 3]);

/** Returns true if `level` has a tracked distance record. */
export function isTrackedLevel(level: number): level is TrackedLevelId {
  return TRACKED_LEVELS.has(level as TrackedLevelId);
}

/**
 * RecordsStore — thin wrapper around localStorage that exposes
 * read + write of the per-level best distance.
 *
 * All distances are stored as non-negative integers (whole metres).
 * Failures to read/write localStorage (private mode, quota, etc.)
 * are swallowed; the store falls back to an in-memory cache so the
 * current session still tracks records even if persistence fails.
 */
export class RecordsStore {
  private readonly _cache: RecordsBlob;

  constructor() {
    this._cache = loadFromStorage();
  }

  /** Best recorded distance (whole metres) for `level`, or 0 if none. */
  getBest(level: TrackedLevelId): number {
    return this._cache[level] ?? 0;
  }

  /**
   * Record a run's distance for `level`. Returns `true` if it set a
   * new high score (and was persisted), `false` otherwise.
   *
   * `distance` is floored to a whole metre and clamped to >= 0 before
   * comparison.
   */
  record(level: TrackedLevelId, distance: number): boolean {
    const m = Math.max(0, Math.floor(distance));
    const prev = this._cache[level] ?? 0;
    if (m <= prev) return false;
    this._cache[level] = m;
    saveToStorage(this._cache);
    return true;
  }
}

function loadFromStorage(): RecordsBlob {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: RecordsBlob = {};
    for (const level of TRACKED_LEVELS) {
      const v = parsed[String(level)];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[level] = Math.max(0, Math.floor(v));
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveToStorage(blob: RecordsBlob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    /* ignore — storage may be unavailable; cache still tracks the session. */
  }
}
