import { describe, it, expect, beforeEach } from "vitest";
import { Lighter } from "../../../src/entities/obstacles/Lighter.js";
import { Player } from "../../../src/entities/Player.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

function advanceSeconds(lighter: Lighter, seconds: number): void {
  const n = Math.ceil(seconds / DT);
  for (let i = 0; i < n; i++) lighter.update(DT);
}

describe("Lighter — cycle phases", () => {
  it("starts in safe phase with hitbox inactive", () => {
    const l = new Lighter({ x: 0, y: 0 });
    expect(l.phase).toBe("safe");
    expect(l.hitbox.active).toBe(false);
    expect(l.flameActive).toBe(false);
  });

  it("transitions to active phase after SAFE_TIME", () => {
    const l = new Lighter({ x: 0, y: 0 });
    advanceSeconds(l, Lighter.SAFE_TIME + DT);
    expect(l.phase).toBe("active");
    expect(l.hitbox.active).toBe(true);
    expect(l.flameActive).toBe(true);
  });

  it("returns to safe phase after ACTIVE_TIME", () => {
    const l = new Lighter({ x: 0, y: 0 });
    advanceSeconds(l, Lighter.SAFE_TIME + Lighter.ACTIVE_TIME + DT * 2);
    expect(l.phase).toBe("safe");
    expect(l.hitbox.active).toBe(false);
  });
});

describe("Lighter — contact damage", () => {
  it("does not deal damage during safe phase", () => {
    const l = new Lighter({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    const before = player.health.current;
    // Safe phase — hitbox inactive
    l.applyContactDamage(player);
    expect(player.health.current).toBe(before);
  });

  it("deals damage to overlapping player during active flame window", () => {
    const l = new Lighter({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    advanceSeconds(l, Lighter.SAFE_TIME + DT); // enter active phase
    const before = player.health.current;
    l.applyContactDamage(player);
    expect(player.health.current).toBeLessThan(before);
  });

  it("does not deal damage after returning to safe phase", () => {
    const l = new Lighter({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    advanceSeconds(l, Lighter.SAFE_TIME + Lighter.ACTIVE_TIME + DT * 2);
    expect(l.phase).toBe("safe");
    // Expire player i-frames.
    for (let i = 0; i < Math.ceil(1.1 / DT); i++) l.update(DT);
    const before = player.health.current;
    l.applyContactDamage(player);
    expect(player.health.current).toBe(before);
  });

  it("respects player i-frames during active window", () => {
    const l = new Lighter({ x: 0, y: 0 });
    const player = new Player({ x: 0, y: 0 });
    advanceSeconds(l, Lighter.SAFE_TIME + DT);
    l.applyContactDamage(player); // first hit, triggers i-frames
    const hp = player.health.current;
    l.applyContactDamage(player); // blocked by i-frames
    expect(player.health.current).toBe(hp);
  });
});
