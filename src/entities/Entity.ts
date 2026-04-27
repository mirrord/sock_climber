/** Base lifecycle interface for all in-world actors. */
export interface Entity {
  readonly id: number;
  spawn(): void;
  despawn(): void;
  update(dt: number): void;
}

let _nextEntityId = 0;

/**
 * Allocates a monotonically-increasing entity ID.
 * IDs are unique per runtime session.
 */
export function nextEntityId(): number {
  return _nextEntityId++;
}

/** Resets the ID counter to zero. For testing only. */
export function _resetEntityIds(): void {
  _nextEntityId = 0;
}
