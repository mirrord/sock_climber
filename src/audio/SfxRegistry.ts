/**
 * Sound-effect identifier — one entry per distinct game event that plays a
 * sound. The string is used as the lookup key in the registry.
 */
export type SfxId =
  | "jump"
  | "land"
  | "dash"
  | "attack"
  | "hit"
  | "kill"
  | "patchApplied"
  | "pickup"
  | "segmentCross"
  | "playerDeath";

/**
 * SfxRegistry — maps {@link SfxId} to a pre-decoded `AudioBuffer`.
 *
 * Buffers are registered once at load time via {@link register}. The audio
 * system looks up buffers via {@link get} on each event, avoiding any
 * re-decoding or re-allocation during gameplay.
 */
export class SfxRegistry {
  private readonly _buffers = new Map<SfxId, AudioBuffer>();

  /**
   * Register a decoded buffer for the given SFX id.
   * Calling this again with the same id replaces the existing buffer.
   */
  register(id: SfxId, buffer: AudioBuffer): void {
    this._buffers.set(id, buffer);
  }

  /**
   * Look up a buffer by id.
   * @returns The registered `AudioBuffer`, or `undefined` if not registered.
   */
  get(id: SfxId): AudioBuffer | undefined {
    return this._buffers.get(id);
  }

  /** Returns `true` if a buffer has been registered for `id`. */
  has(id: SfxId): boolean {
    return this._buffers.has(id);
  }

  /** Remove all registered buffers. */
  clear(): void {
    this._buffers.clear();
  }
}
