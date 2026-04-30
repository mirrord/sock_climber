import { describe, it, expect, beforeEach } from "vitest";
import { SoftenerBuff } from "../../../src/entities/buffs/SoftenerBuff.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

describe("SoftenerBuff", () => {
  it("uses Softener as its modKey", () => {
    const buff = new SoftenerBuff({ x: 0, y: 0 });
    expect(buff.modKey).toBe("Softener");
  });

  it("applies the Softener stat-mod when collected", () => {
    const buff = new SoftenerBuff({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    expect(player.hasStatMod("Softener")).toBe(false);
    buff.tryCollect(player);
    expect(player.hasStatMod("Softener")).toBe(true);
  });

  it("expires after DURATION seconds and removes the mod", () => {
    const buff = new SoftenerBuff({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    buff.tryCollect(player);
    const steps = Math.ceil(SoftenerBuff.DURATION / DT) + 2;
    for (let i = 0; i < steps; i++) buff.update(DT);
    expect(player.hasStatMod("Softener")).toBe(false);
  });

  it("does not apply when the player is not overlapping", () => {
    const buff = new SoftenerBuff({ x: 0, y: 0 });
    const player = new Player({ x: 50, y: 50 });
    const ok = buff.tryCollect(player);
    expect(ok).toBe(false);
    expect(player.hasStatMod("Softener")).toBe(false);
  });
});
