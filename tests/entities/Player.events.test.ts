import { describe, it, expect, vi } from "vitest";
import { Player } from "../../src/entities/Player.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";

/**
 * Phase 2 wiring tests — Player must emit HUD/death events through the event
 * bus when its HP changes or reaches zero.  These hooks were previously
 * declared on the bus but had no producer, so the HUD never updated.
 */

describe("Player — onHpChanged emissions", () => {
  it("emits onHpChanged with the post-mutation snapshot after takeDamage", () => {
    const bus = createEventBus<GameEvents>();
    const handler = vi.fn();
    bus.on("onHpChanged", handler);
    const player = new Player({ x: 0, y: 0 }, {}, bus);
    const startHp = player.health.current;

    const taken = player.takeDamage(1, 0, 0);

    expect(taken).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      current: startHp - 1,
      max: player.health.containers,
      empty: 1,
    });
  });

  it("emits onHpChanged after gainContainer", () => {
    const bus = createEventBus<GameEvents>();
    const handler = vi.fn();
    bus.on("onHpChanged", handler);
    const player = new Player({ x: 0, y: 0 }, {}, bus);
    const start = player.health.containers;

    player.gainContainer();

    expect(handler).toHaveBeenCalledWith({
      current: start + 1,
      max: start + 1,
      empty: 0,
    });
  });

  it("emits onHpChanged after consumeEmptyContainer", () => {
    const bus = createEventBus<GameEvents>();
    const player = new Player({ x: 0, y: 0 }, {}, bus);
    // Open up an empty slot first.
    player.takeDamage(1, 0, 0);
    const handler = vi.fn();
    bus.on("onHpChanged", handler);

    const consumed = player.consumeEmptyContainer();

    expect(consumed).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not emit on a damage hit blocked by i-frames", () => {
    const bus = createEventBus<GameEvents>();
    const player = new Player({ x: 0, y: 0 }, {}, bus);
    player.takeDamage(1, 0, 0); // grants i-frames
    const handler = vi.fn();
    bus.on("onHpChanged", handler);

    const taken = player.takeDamage(1, 0, 0);

    expect(taken).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Player — onPlayerDeath emissions", () => {
  it("emits onPlayerDeath with reason 'hp' when HP reaches zero", () => {
    const bus = createEventBus<GameEvents>();
    const handler = vi.fn();
    bus.on("onPlayerDeath", handler);
    const player = new Player({ x: 0, y: 0 }, { maxHealth: 1 }, bus);

    player.takeDamage(1, 0, 0);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ reason: "hp" });
  });

  it("does not double-fire onPlayerDeath if takeDamage runs again at 0 HP", () => {
    const bus = createEventBus<GameEvents>();
    const handler = vi.fn();
    bus.on("onPlayerDeath", handler);
    // maxHealth 2 + iFrameDuration 0 so a second hit can land while at 0.
    const player = new Player(
      { x: 0, y: 0 },
      { maxHealth: 2, iFrameDuration: 0 },
      bus,
    );

    player.takeDamage(2, 0, 0); // -> HP 0, fires
    player.takeDamage(1, 0, 0); // already dead, must NOT fire

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respawn re-arms the death emission so the next death fires again", () => {
    const bus = createEventBus<GameEvents>();
    const handler = vi.fn();
    bus.on("onPlayerDeath", handler);
    const player = new Player({ x: 0, y: 0 }, { maxHealth: 1 }, bus);

    player.takeDamage(1, 0, 0);
    player.spawn();
    player.takeDamage(1, 0, 0);

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
