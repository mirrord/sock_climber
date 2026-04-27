import { describe, it, expect } from "vitest";
import {
  ENEMY_REGISTRY,
  spawnEnemy,
  type EnemyTag,
} from "../../../src/entities/enemies/EnemyRegistry.js";

const ALL_TAGS: EnemyTag[] = ["Keys", "Wallet", "Phone", "Lipstick", "Headphones"];

describe("EnemyRegistry", () => {
  it("contains an entry for every enemy tag", () => {
    for (const tag of ALL_TAGS) {
      expect(ENEMY_REGISTRY[tag]).toBeDefined();
    }
  });

  it("factory returns a new enemy instance each call", () => {
    const a = spawnEnemy("Keys", { x: 0, y: 0 });
    const b = spawnEnemy("Keys", { x: 0, y: 0 });
    expect(a).not.toBe(b);
  });

  it("spawned enemy is placed at the requested position", () => {
    const e = spawnEnemy("Wallet", { x: 5, y: -3 });
    expect(e.body.position.x).toBe(5);
    expect(e.body.position.y).toBe(-3);
  });

  it("gaugeReward in registry matches spawned enemy gaugeReward", () => {
    for (const tag of ALL_TAGS) {
      const e = spawnEnemy(tag, { x: 0, y: 0 });
      expect(e.gaugeReward).toBe(ENEMY_REGISTRY[tag].gaugeReward);
    }
  });

  it("Wallet has higher gaugeReward than other enemies", () => {
    expect(ENEMY_REGISTRY.Wallet.gaugeReward).toBeGreaterThan(
      ENEMY_REGISTRY.Keys.gaugeReward,
    );
  });
});
