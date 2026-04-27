/**
 * Music — looping track manager with linear crossfade.
 *
 * Connects source nodes into the music channel's `GainNode` supplied by
 * {@link AudioBus.getChannelNode}. Requires an {@link AudioContext} to produce
 * sound; pass `null` for both arguments to run silently (e.g. in tests that
 * focus on non-audio logic).
 *
 * Call {@link update} once per fixed step to advance any in-progress crossfade.
 */
export class Music {
  private readonly _ctx: AudioContext | null;
  private readonly _channelGain: GainNode | null;

  private _currentGain: GainNode | null = null;
  private _currentSource: AudioBufferSourceNode | null = null;
  private _nextGain: GainNode | null = null;
  private _nextSource: AudioBufferSourceNode | null = null;

  /** Remaining seconds in the active crossfade, or 0 when idle. */
  private _crossfadeRemaining = 0;
  /** Total duration of the active crossfade in seconds. */
  private _crossfadeDuration = 0;

  constructor(ctx: AudioContext | null, channelGain: GainNode | null) {
    this._ctx = ctx;
    this._channelGain = channelGain;
  }

  /**
   * Start playing a track.
   *
   * @param buffer           - Decoded audio data to loop.
   * @param crossfadeDuration - Seconds to fade from the current track to the
   *                            new one. `0` (default) is an instant switch.
   */
  play(buffer: AudioBuffer, crossfadeDuration = 0): void {
    if (this._ctx === null || this._channelGain === null) return;

    if (crossfadeDuration > 0 && this._currentSource !== null) {
      // ── Crossfade: keep current playing, start next at gain 0 ──────────
      // Abort any previous in-flight crossfade (promote next → current first).
      if (this._nextSource !== null) {
        this._stopAndDiscard(this._currentSource, this._currentGain);
        this._currentGain = this._nextGain;
        this._currentSource = this._nextSource;
        this._nextGain = null;
        this._nextSource = null;
      }

      const gain = this._ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this._channelGain);

      const src = this._ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start();

      this._nextGain = gain;
      this._nextSource = src;
      this._crossfadeDuration = crossfadeDuration;
      this._crossfadeRemaining = crossfadeDuration;
    } else {
      // ── Instant switch ───────────────────────────────────────────────────
      this._stopAll();

      const gain = this._ctx.createGain();
      gain.gain.value = 1;
      gain.connect(this._channelGain);

      const src = this._ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start();

      this._currentGain = gain;
      this._currentSource = src;
    }
  }

  /**
   * Advance any active crossfade by `dt` seconds.
   * Must be called once per fixed step.
   */
  update(dt: number): void {
    if (this._crossfadeRemaining <= 0) return;

    this._crossfadeRemaining = Math.max(0, this._crossfadeRemaining - dt);
    const t = 1 - this._crossfadeRemaining / this._crossfadeDuration;

    if (this._currentGain !== null) this._currentGain.gain.value = 1 - t;
    if (this._nextGain !== null) this._nextGain.gain.value = t;

    if (this._crossfadeRemaining === 0) {
      // Crossfade complete — swap next into current position.
      this._stopAndDiscard(this._currentSource, this._currentGain);
      this._currentGain = this._nextGain;
      this._currentSource = this._nextSource;
      if (this._currentGain !== null) this._currentGain.gain.value = 1;
      this._nextGain = null;
      this._nextSource = null;
      this._crossfadeDuration = 0;
    }
  }

  /** Stop all currently playing tracks and cancel any crossfade. */
  stop(): void {
    this._stopAll();
  }

  /**
   * Fractional progress of the active crossfade in [0, 1].
   * Returns `1` when no crossfade is in progress.
   */
  get crossfadeProgress(): number {
    if (this._crossfadeDuration === 0) return 1;
    return 1 - this._crossfadeRemaining / this._crossfadeDuration;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _stopAndDiscard(
    src: AudioBufferSourceNode | null,
    gain: GainNode | null,
  ): void {
    if (src !== null) {
      try {
        src.stop();
      } catch {
        // may have already ended
      }
      src.disconnect();
    }
    gain?.disconnect();
  }

  private _stopAll(): void {
    this._stopAndDiscard(this._currentSource, this._currentGain);
    this._currentSource = null;
    this._currentGain = null;

    this._stopAndDiscard(this._nextSource, this._nextGain);
    this._nextSource = null;
    this._nextGain = null;

    this._crossfadeRemaining = 0;
    this._crossfadeDuration = 0;
  }
}
