import { describe, it, expect, beforeEach } from "vitest";
import {
  AudioSettings,
  applyAudioSettings,
  createDefaultAudioSettings,
  loadAudioSettings,
  saveAudioSettings,
} from "../../src/audio/AudioSettings.js";
import { AudioBus } from "../../src/audio/AudioBus.js";

const STORAGE_KEY = "sock_climber_audio";

class MockGainNode {
  gain = { value: 1 };
  connect(): void {}
  disconnect(): void {}
}
class MockAudioContext {
  destination = new MockGainNode();
  createGain(): MockGainNode { return new MockGainNode(); }
  createBufferSource(): unknown {
    return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
  }
}

function makeBus(): AudioBus {
  return new AudioBus({
    context: new MockAudioContext() as unknown as AudioContext,
    sfxPoolSize: 1,
  });
}

describe("AudioSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("createDefaultAudioSettings returns full volume, nothing muted", () => {
    const s = createDefaultAudioSettings();
    expect(s).toEqual<AudioSettings>({
      master: 1, music: 1, sfx: 1,
      mutedMaster: false, mutedMusic: false, mutedSfx: false,
    });
  });

  it("loadAudioSettings returns defaults when storage empty", () => {
    expect(loadAudioSettings()).toEqual(createDefaultAudioSettings());
  });

  it("saveAudioSettings round-trips via loadAudioSettings", () => {
    const s: AudioSettings = {
      master: 0.5, music: 0.25, sfx: 0.75,
      mutedMaster: false, mutedMusic: true, mutedSfx: false,
    };
    saveAudioSettings(s);
    expect(loadAudioSettings()).toEqual(s);
  });

  it("loadAudioSettings clamps out-of-range values", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ master: 5, music: -1, sfx: 0.5 }));
    const s = loadAudioSettings();
    expect(s.master).toBe(1);
    expect(s.music).toBe(0);
    expect(s.sfx).toBe(0.5);
  });

  it("loadAudioSettings falls back to defaults on bad JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadAudioSettings()).toEqual(createDefaultAudioSettings());
  });

  it("loadAudioSettings fills missing fields from defaults", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ master: 0.3 }));
    const s = loadAudioSettings();
    expect(s.master).toBe(0.3);
    expect(s.music).toBe(1);
    expect(s.sfx).toBe(1);
    expect(s.mutedMaster).toBe(false);
  });

  it("applyAudioSettings sets channel volumes and mute on the bus", () => {
    const bus = makeBus();
    applyAudioSettings(bus, {
      master: 0.4, music: 0.6, sfx: 0.8,
      mutedMaster: false, mutedMusic: true, mutedSfx: false,
    });
    expect(bus.getVolume("master")).toBeCloseTo(0.4);
    expect(bus.getVolume("music")).toBeCloseTo(0.6);
    expect(bus.getVolume("sfx")).toBeCloseTo(0.8);
    expect(bus.isMuted("music")).toBe(true);
    expect(bus.isMuted("master")).toBe(false);
    expect(bus.isMuted("sfx")).toBe(false);
    // Muted channel reports a 0 gain.
    expect(bus.getChannelGainValue("music")).toBe(0);
    expect(bus.getChannelGainValue("master")).toBeCloseTo(0.4);
  });
});
