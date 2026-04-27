/** Audio channel identifier. */
export type AudioChannel = "sfx" | "music" | "master";

/** Options for creating an AudioBus. */
export interface AudioBusOptions {
  /** AudioContext to use. If omitted, audio is silently suppressed. */
  context?: AudioContext;
  /** Number of simultaneous SFX voices (default 8). */
  sfxPoolSize?: number;
}

/** One entry in the SFX voice pool. */
interface Voice {
  /** Permanent gain node — connected to the sfx channel gain at construction time. */
  gain: GainNode;
  /** Currently playing source node, or `null` when the voice is idle. */
  source: AudioBufferSourceNode | null;
}

/**
 * AudioBus — manages three gain-stage channels with per-channel volume and
 * mute. Routing graph:
 *
 *     voice gain ──► sfx gain ──┐
 *                                ├──► master gain ──► destination
 *                  music gain ──┘
 *
 * Construct with an `AudioContext` for live audio. Omit it for silent / test
 * mode where all operations are no-ops.
 */
export class AudioBus {
  private readonly _ctx: AudioContext | null;
  private readonly _channelGains: {
    sfx: GainNode | null;
    music: GainNode | null;
    master: GainNode | null;
  };
  private readonly _volumes: { sfx: number; music: number; master: number } = {
    sfx: 1,
    music: 1,
    master: 1,
  };
  private readonly _muted: { sfx: boolean; music: boolean; master: boolean } = {
    sfx: false,
    music: false,
    master: false,
  };
  private readonly _pool: Voice[];

  constructor(opts: AudioBusOptions = {}) {
    const ctx = opts.context ?? null;
    this._ctx = ctx;

    if (ctx !== null) {
      const masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 1;
      sfxGain.connect(masterGain);

      const musicGain = ctx.createGain();
      musicGain.gain.value = 1;
      musicGain.connect(masterGain);

      this._channelGains = { sfx: sfxGain, music: musicGain, master: masterGain };

      // Pre-allocate voice pool — GainNodes created here, not during playback.
      const size = opts.sfxPoolSize ?? 8;
      this._pool = Array.from<unknown, Voice>({ length: size }, () => {
        const gain = ctx.createGain();
        gain.connect(sfxGain);
        return { gain, source: null };
      });
    } else {
      this._channelGains = { sfx: null, music: null, master: null };
      this._pool = [];
    }
  }

  // ─── Volume / mute ────────────────────────────────────────────────────────

  /**
   * Set the volume for a channel (clamped to [0, 1]).
   * Has no effect while the channel is muted (gain stays at 0 until unmuted).
   */
  setVolume(channel: AudioChannel, volume: number): void {
    this._volumes[channel] = Math.max(0, Math.min(1, volume));
    if (!this._muted[channel]) {
      this._applyGain(channel);
    }
  }

  /** Current volume for a channel (0–1). */
  getVolume(channel: AudioChannel): number {
    return this._volumes[channel];
  }

  /** Mute or unmute a channel. Muting sets the channel gain to 0 without changing stored volume. */
  setMute(channel: AudioChannel, muted: boolean): void {
    this._muted[channel] = muted;
    this._applyGain(channel);
  }

  /** Whether a channel is currently muted. */
  isMuted(channel: AudioChannel): boolean {
    return this._muted[channel];
  }

  /**
   * Returns the current raw gain value of the channel's GainNode.
   * Useful for testing and debugging.
   */
  getChannelGainValue(channel: AudioChannel): number {
    return this._channelGains[channel]?.gain.value ?? 0;
  }

  /**
   * Returns the channel's GainNode, or `null` in silent mode.
   * Music.ts uses this to connect its source nodes into the music channel.
   */
  getChannelNode(channel: AudioChannel): GainNode | null {
    return this._channelGains[channel];
  }

  // ─── SFX playback ─────────────────────────────────────────────────────────

  /**
   * Play an AudioBuffer on the SFX channel using a pooled voice.
   * If all voices are busy the oldest voice is stolen.
   * No-op when in silent mode or when the sfx channel is muted.
   */
  playSfx(buffer: AudioBuffer): void {
    if (this._ctx === null || this._muted.sfx) return;

    // Find an idle voice; fall back to the first (oldest) slot.
    let voice: Voice = this._pool[0]!;
    for (const v of this._pool) {
      if (v.source === null) {
        voice = v;
        break;
      }
    }

    // Stop any currently playing source in the chosen slot.
    if (voice.source !== null) {
      try {
        voice.source.stop();
      } catch {
        // source may have already ended
      }
      voice.source.disconnect();
      voice.source = null;
    }

    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(voice.gain);
    src.onended = () => {
      if (voice.source === src) {
        voice.source = null;
      }
    };
    src.start();
    voice.source = src;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Disconnect all nodes and release resources. */
  destroy(): void {
    for (const v of this._pool) {
      if (v.source !== null) {
        try {
          v.source.stop();
        } catch {
          // may already be ended
        }
        v.source.disconnect();
        v.source = null;
      }
      v.gain.disconnect();
    }
    this._channelGains.sfx?.disconnect();
    this._channelGains.music?.disconnect();
    this._channelGains.master?.disconnect();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _applyGain(channel: AudioChannel): void {
    const node = this._channelGains[channel];
    if (node === null) return;
    node.gain.value = this._muted[channel] ? 0 : this._volumes[channel];
  }
}
