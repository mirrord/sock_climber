import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { AudioSystem } from "../../src/audio/AudioSystem.js";
import { AudioBus } from "../../src/audio/AudioBus.js";
import { SfxRegistry } from "../../src/audio/SfxRegistry.js";

function makeSystem() {
  const bus = createEventBus<GameEvents>();
  const audio = new AudioBus(); // silent mode (no AudioContext)
  const registry = new SfxRegistry();
  const playSfxSpy = vi.spyOn(audio, "playSfx");
  const system = new AudioSystem(bus, audio, registry);
  return { bus, audio, registry, system, playSfxSpy };
}

const FAKE_BUFFER = {} as AudioBuffer;

describe("AudioSystem — event routing", () => {
  let s: ReturnType<typeof makeSystem>;

  beforeEach(() => {
    s = makeSystem();
  });

  it("plays jump SFX on onJump", () => {
    s.registry.register("jump", FAKE_BUFFER);
    s.bus.emit("onJump", {});
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays land SFX on onLand", () => {
    s.registry.register("land", FAKE_BUFFER);
    s.bus.emit("onLand", {});
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays dash SFX on onDash", () => {
    s.registry.register("dash", FAKE_BUFFER);
    s.bus.emit("onDash", {});
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays attack SFX on onAttack", () => {
    s.registry.register("attack", FAKE_BUFFER);
    s.bus.emit("onAttack", {});
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays hit SFX on onHit", () => {
    s.registry.register("hit", FAKE_BUFFER);
    s.bus.emit("onHit", { entityId: 1, damage: 1 });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays kill SFX on onKill", () => {
    s.registry.register("kill", FAKE_BUFFER);
    s.bus.emit("onKill", { entityId: 2 });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays patchApplied SFX on onPatchApplied", () => {
    s.registry.register("patchApplied", FAKE_BUFFER);
    s.bus.emit("onPatchApplied", { patchId: "SpeedSock" });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays pickup SFX on onPickup", () => {
    s.registry.register("pickup", FAKE_BUFFER);
    s.bus.emit("onPickup", { itemId: "coin" });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays segmentCross SFX on onSegmentCross", () => {
    s.registry.register("segmentCross", FAKE_BUFFER);
    s.bus.emit("onSegmentCross", { segmentId: 5 });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("plays playerDeath SFX on onPlayerDeath", () => {
    s.registry.register("playerDeath", FAKE_BUFFER);
    s.bus.emit("onPlayerDeath", { reason: "drowned" });
    expect(s.playSfxSpy).toHaveBeenCalledWith(FAKE_BUFFER);
  });

  it("does not call playSfx when the SFX is not registered", () => {
    // registry has no entries
    s.bus.emit("onJump", {});
    expect(s.playSfxSpy).not.toHaveBeenCalled();
  });

  it("stops reacting after destroy()", () => {
    s.registry.register("jump", FAKE_BUFFER);
    s.system.destroy();
    s.bus.emit("onJump", {});
    expect(s.playSfxSpy).not.toHaveBeenCalled();
  });
});
