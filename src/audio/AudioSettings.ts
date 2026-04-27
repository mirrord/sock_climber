import type { AudioBus, AudioChannel } from "./AudioBus.js";

/**
 * Persisted audio configuration: per-channel volume (0..1) + mute flag.
 * Held in localStorage under {@link STORAGE_KEY}.
 */
export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  mutedMaster: boolean;
  mutedMusic: boolean;
  mutedSfx: boolean;
}

const STORAGE_KEY = "sock_climber_audio";

/** Returns the default audio settings (full volume, nothing muted). */
export function createDefaultAudioSettings(): AudioSettings {
  return {
    master: 1,
    music: 1,
    sfx: 1,
    mutedMaster: false,
    mutedMusic: false,
    mutedSfx: false,
  };
}

/**
 * Loads audio settings from localStorage, falling back to defaults.
 * Missing fields are filled from defaults; numeric fields are clamped to [0, 1].
 */
export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return createDefaultAudioSettings();
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    const defaults = createDefaultAudioSettings();
    return {
      master: clamp01(parsed.master ?? defaults.master),
      music: clamp01(parsed.music ?? defaults.music),
      sfx: clamp01(parsed.sfx ?? defaults.sfx),
      mutedMaster: parsed.mutedMaster ?? defaults.mutedMaster,
      mutedMusic: parsed.mutedMusic ?? defaults.mutedMusic,
      mutedSfx: parsed.mutedSfx ?? defaults.mutedSfx,
    };
  } catch {
    return createDefaultAudioSettings();
  }
}

/** Persists audio settings to localStorage. */
export function saveAudioSettings(settings: AudioSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Apply settings (volume + mute) to all channels of an AudioBus. */
export function applyAudioSettings(bus: AudioBus, settings: AudioSettings): void {
  bus.setVolume("master", settings.master);
  bus.setVolume("music", settings.music);
  bus.setVolume("sfx", settings.sfx);
  bus.setMute("master", settings.mutedMaster);
  bus.setMute("music", settings.mutedMusic);
  bus.setMute("sfx", settings.mutedSfx);
}

/** Channel → settings field name for the volume value. */
export const VOLUME_FIELD: Record<AudioChannel, keyof AudioSettings> = {
  master: "master",
  music: "music",
  sfx: "sfx",
};

/** Channel → settings field name for the mute flag. */
export const MUTE_FIELD: Record<AudioChannel, keyof AudioSettings> = {
  master: "mutedMaster",
  music: "mutedMusic",
  sfx: "mutedSfx",
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
