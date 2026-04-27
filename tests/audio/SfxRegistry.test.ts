import { describe, it, expect } from "vitest";
import { SfxRegistry } from "../../src/audio/SfxRegistry.js";
import type { SfxId } from "../../src/audio/SfxRegistry.js";

const FAKE_BUFFER = {} as AudioBuffer;
const FAKE_BUFFER_2 = {} as AudioBuffer;

describe("SfxRegistry", () => {
  it("returns undefined for an unregistered id", () => {
    const reg = new SfxRegistry();
    expect(reg.get("jump")).toBeUndefined();
  });

  it("has() returns false for an unregistered id", () => {
    const reg = new SfxRegistry();
    expect(reg.has("land")).toBe(false);
  });

  it("register and get round-trips the buffer", () => {
    const reg = new SfxRegistry();
    reg.register("jump", FAKE_BUFFER);
    expect(reg.get("jump")).toBe(FAKE_BUFFER);
  });

  it("has() returns true after registration", () => {
    const reg = new SfxRegistry();
    reg.register("dash", FAKE_BUFFER);
    expect(reg.has("dash")).toBe(true);
  });

  it("overwriting a registration replaces the buffer", () => {
    const reg = new SfxRegistry();
    reg.register("hit", FAKE_BUFFER);
    reg.register("hit", FAKE_BUFFER_2);
    expect(reg.get("hit")).toBe(FAKE_BUFFER_2);
  });

  it("multiple ids are stored independently", () => {
    const reg = new SfxRegistry();
    const buf1 = {} as AudioBuffer;
    const buf2 = {} as AudioBuffer;
    reg.register("kill", buf1);
    reg.register("playerDeath", buf2);
    expect(reg.get("kill")).toBe(buf1);
    expect(reg.get("playerDeath")).toBe(buf2);
  });

  it("clear() removes all registrations", () => {
    const reg = new SfxRegistry();
    reg.register("jump", FAKE_BUFFER);
    reg.register("land", FAKE_BUFFER);
    reg.clear();
    expect(reg.has("jump")).toBe(false);
    expect(reg.has("land")).toBe(false);
  });

  it("all defined SfxIds are accepted", () => {
    const reg = new SfxRegistry();
    const ids: SfxId[] = [
      "jump",
      "land",
      "dash",
      "attack",
      "hit",
      "kill",
      "patchApplied",
      "pickup",
      "segmentCross",
      "playerDeath",
    ];
    for (const id of ids) {
      reg.register(id, FAKE_BUFFER);
      expect(reg.has(id)).toBe(true);
    }
  });
});
