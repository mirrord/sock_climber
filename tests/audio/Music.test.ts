import { describe, it, expect } from "vitest";
import { Music } from "../../src/audio/Music.js";

// ─── Mock Web Audio API ───────────────────────────────────────────────────────

class MockGainNode {
  gain = { value: 1 };
  connected: MockGainNode[] = [];
  disconnectCount = 0;
  connect(node: MockGainNode): void {
    this.connected.push(node);
  }
  disconnect(): void {
    this.disconnectCount++;
  }
}

class MockBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  startCount = 0;
  stopCount = 0;
  disconnectCount = 0;
  connect(_node: MockGainNode): void {}
  disconnect(): void {
    this.disconnectCount++;
  }
  start(): void {
    this.startCount++;
  }
  stop(): void {
    this.stopCount++;
  }
}

class MockAudioContext {
  destination = new MockGainNode();
  gainNodeCount = 0;
  bufferSourceCount = 0;
  readonly createdGains: MockGainNode[] = [];
  readonly createdSources: MockBufferSourceNode[] = [];

  createGain(): MockGainNode {
    this.gainNodeCount++;
    const g = new MockGainNode();
    this.createdGains.push(g);
    return g;
  }

  createBufferSource(): MockBufferSourceNode {
    this.bufferSourceCount++;
    const s = new MockBufferSourceNode();
    this.createdSources.push(s);
    return s;
  }
}

const TRACK_A = {} as AudioBuffer;
const TRACK_B = {} as AudioBuffer;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Music — instant play", () => {
  it("play() starts a looping source node", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    expect(ctx.bufferSourceCount).toBe(1);
    expect(ctx.createdSources[0]!.startCount).toBe(1);
    expect(ctx.createdSources[0]!.loop).toBe(true);
  });

  it("play() without crossfade stops the previous track", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.play(TRACK_B); // instant switch
    expect(ctx.createdSources[0]!.stopCount).toBe(1);
    expect(ctx.createdSources[1]!.startCount).toBe(1);
  });

  it("does nothing when no AudioContext is provided", () => {
    const music = new Music(null, null);
    music.play(TRACK_A); // no throw
    music.update(1);
  });
});

describe("Music — crossfade", () => {
  it("play() with crossfade starts the new source at gain 0", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.play(TRACK_B, 2); // 2-second crossfade

    // The new (next) source should be the second source created and gain 0
    const nextSrc = ctx.createdSources[1]!;
    expect(nextSrc.startCount).toBe(1);
    // The next track's GainNode starts at 0
    expect(music.crossfadeProgress).toBeCloseTo(0);
  });

  it("update() advances crossfade linearly", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.play(TRACK_B, 4); // 4-second crossfade

    music.update(1); // 1s into a 4s fade
    expect(music.crossfadeProgress).toBeCloseTo(0.25);

    music.update(1); // 2s
    expect(music.crossfadeProgress).toBeCloseTo(0.5);
  });

  it("crossfade reaches target volume in N seconds", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);

    const duration = 3;
    music.play(TRACK_B, duration);

    // Drive the crossfade to completion
    music.update(duration);

    expect(music.crossfadeProgress).toBeCloseTo(1);
  });

  it("after crossfade completes, the previous track is stopped", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.play(TRACK_B, 1);
    music.update(1); // complete the fade

    const prevSrc = ctx.createdSources[0]!;
    expect(prevSrc.stopCount).toBe(1);
  });

  it("crossfadeProgress is 1 with no active crossfade", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    expect(music.crossfadeProgress).toBe(1);
  });
});

describe("Music — stop", () => {
  it("stop() stops the current track", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.stop();
    expect(ctx.createdSources[0]!.stopCount).toBe(1);
  });

  it("stop() during crossfade stops both tracks", () => {
    const ctx = new MockAudioContext();
    const channelGain = ctx.createGain();
    const music = new Music(
      ctx as unknown as AudioContext,
      channelGain as unknown as GainNode,
    );
    music.play(TRACK_A);
    music.play(TRACK_B, 2);
    music.stop();
    expect(ctx.createdSources[0]!.stopCount).toBe(1);
    expect(ctx.createdSources[1]!.stopCount).toBe(1);
  });
});
