import { describe, it, expect, beforeEach } from "vitest";
import { CombatSystem } from "../../src/systems/CombatSystem.js";
import type { Damageable } from "../../src/systems/CombatSystem.js";
import { ATTACK_TABLE, attackDuration } from "../../src/systems/AttackTable.js";
import { Player } from "../../src/entities/Player.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import type { InputSnapshot } from "../../src/input/InputSnapshot.js";
import type { Action } from "../../src/input/Actions.js";
import { EMPTY_SNAPSHOT } from "../../src/input/InputSnapshot.js";

const DT = 1 / 120;

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSnap(opts: {
  axes?: { moveX?: number };
  down?: Action[];
  pressed?: Action[];
  released?: Action[];
} = {}): InputSnapshot {
  return {
    axes: { moveX: opts.axes?.moveX ?? 0 },
    buttonsDown: new Set<Action>(opts.down ?? []),
    buttonsPressed: new Set<Action>(opts.pressed ?? []),
    buttonsReleased: new Set<Action>(opts.released ?? []),
    timestamp: 0,
  };
}

/** A simple damageable target for testing. */
function makeDamageable(
  id: number,
  x: number,
  y: number,
  halfW = 0.5,
  halfH = 0.5,
): Damageable & { hitCount: number; blocked: boolean } {
  let hitCount = 0;
  let _hp = 10;
  let blocked = false;
  return {
    id,
    position: { x, y },
    halfExtents: { x: halfW, y: halfH },
    get hp() {
      return _hp;
    },
    set hp(v) {
      _hp = v;
    },
    takeDamage(damage) {
      hitCount++;
      _hp -= damage;
      return true;
    },
    get hitCount() {
      return hitCount;
    },
    get blocked() {
      return blocked;
    },
  };
}

/** Step the system N times with an optional snap function. */
function runSteps(
  n: number,
  system: CombatSystem,
  player: Player,
  targets: Damageable[],
  snapFn: (i: number) => InputSnapshot = () => EMPTY_SNAPSHOT,
): void {
  for (let i = 0; i < n; i++) {
    system.update(DT, snapFn(i), player, targets);
  }
}

// ─── Attack lifecycle ─────────────────────────────────────────────────────────

describe("CombatSystem — attack lifecycle", () => {
  it("isAttacking is false when idle", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    system.update(DT, EMPTY_SNAPSHOT, player, []);
    expect(system.isAttacking).toBe(false);
  });

  it("Attack button starts an attack", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    expect(system.isAttacking).toBe(true);
    expect(system.currentAttackId).toBe("Normal");
  });

  it("attack ends after startup + active + recovery", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    const data = ATTACK_TABLE["Normal"]!;
    const totalSteps = Math.ceil(attackDuration(data) / DT) + 2;

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    runSteps(totalSteps, system, player, []);
    expect(system.isAttacking).toBe(false);
  });

  it("cannot start a second attack while one is in progress", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    expect(system.currentAttackId).toBe("Normal");

    // Try to start another attack on the next step.
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    // Still the original attack, not reset.
    expect(system.isAttacking).toBe(true);
    expect(system.attackElapsed).toBeGreaterThan(0);
  });
});

// ─── Normal attack hit window ─────────────────────────────────────────────────

describe("CombatSystem — Normal attack hit window", () => {
  /**
   * Normal.startup  = 1/60 s = 2 physics steps
   * Normal.active   = 5/60 s = 10 physics steps  (steps 2–11, elapsed 2/120–11/120)
   * Normal.recovery = 6/60 s = 12 physics steps
   */
  const data = ATTACK_TABLE["Normal"]!;

  it("no hit occurs during the startup phase", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    // Target placed directly in the Normal hitbox.
    const target = makeDamageable(1, data.offsetX, 0);

    // Step 1: press Attack — elapsed = 1 × DT < startup.
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [target]);
    expect(target.hitCount).toBe(0);
  });

  it("exactly one hit occurs across all active frames", () => {
    const bus = createEventBus<GameEvents>();
    let hitCount = 0;
    bus.on("onHit", () => hitCount++);
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    const target = makeDamageable(1, data.offsetX, 0);

    // Start attack, then drive through the entire active + recovery window.
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [target]);
    const totalSteps = Math.ceil(attackDuration(data) / DT) + 2;
    runSteps(totalSteps, system, player, [target]);

    expect(hitCount).toBe(1);
    expect(target.hitCount).toBe(1);
  });

  it("no hit occurs during the recovery phase", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    const target = makeDamageable(1, data.offsetX, 0);

    // Start attack.
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [target]);
    // Drive through startup + active (so the hit fires).
    const startupActiveSteps = Math.ceil((data.startup + data.active) / DT);
    runSteps(startupActiveSteps, system, player, [target]);
    const hitsAfterActive = target.hitCount;

    // Drive through recovery.
    const recoverySteps = Math.ceil(data.recovery / DT) + 2;
    runSteps(recoverySteps, system, player, [target]);
    // No additional hits in recovery.
    expect(target.hitCount).toBe(hitsAfterActive);
  });

  it("target out of hitbox range is not hit", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    // Place target far away to the left (player faces right).
    const outOfRange = makeDamageable(1, -10, 0);

    const totalSteps = Math.ceil(attackDuration(data) / DT) + 2;
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [outOfRange]);
    runSteps(totalSteps, system, player, [outOfRange]);

    expect(outOfRange.hitCount).toBe(0);
  });

  it("onHit event is emitted exactly once per attack", () => {
    const bus = createEventBus<GameEvents>();
    const hits: Array<{ entityId: number; damage: number }> = [];
    bus.on("onHit", (p) => hits.push(p));

    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    const target = makeDamageable(42, data.offsetX, 0);

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [target]);
    const totalSteps = Math.ceil(attackDuration(data) / DT) + 2;
    runSteps(totalSteps, system, player, [target]);

    expect(hits.length).toBe(1);
    expect(hits[0]!.entityId).toBe(42);
    expect(hits[0]!.damage).toBe(data.damage);
  });

  it("onKill event is emitted when target HP reaches 0", () => {
    const bus = createEventBus<GameEvents>();
    const kills: number[] = [];
    bus.on("onKill", (p) => kills.push(p.entityId));

    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;

    const target = makeDamageable(7, data.offsetX, 0);
    target.hp = 1; // one hit kills it

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, [target]);
    const totalSteps = Math.ceil(attackDuration(data) / DT) + 2;
    runSteps(totalSteps, system, player, [target]);

    expect(kills.length).toBe(1);
    expect(kills[0]).toBe(7);
  });
});

// ─── Aerial-crouch attack ─────────────────────────────────────────────────────

describe("CombatSystem — AerialCrouch attack", () => {
  it("attack type is AerialCrouch when player is crouching and airborne", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });

    // Crouch while airborne.
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ down: ["Crouch"] }));
    expect(player.isCrouching).toBe(true);
    expect(player.locomotion).not.toBe("Grounded");

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    expect(system.currentAttackId).toBe("AerialCrouch");
  });

  it("attack type is Normal when player is crouching on the ground", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ down: ["Crouch"] }));
    expect(player.isCrouching).toBe(true);

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    expect(system.currentAttackId).toBe("Normal");
  });

  it("descent velocity is dampened during AerialCrouch active frames", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ down: ["Crouch"] }));

    const data = ATTACK_TABLE["AerialCrouch"]!;

    // Set a known downward velocity before the active window.
    player.body.velocity.y = 10;

    // Start attack (step 1: elapsed = DT, in startup).
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    // Velocity unchanged during startup.
    expect(player.body.velocity.y).toBe(10);

    // Drive to the active window start (elapsed = startup = 2 × DT after step 2).
    system.update(DT, EMPTY_SNAPSHOT, player, []);
    // Now in active window — velocity must be dampened.
    expect(player.body.velocity.y).toBeCloseTo(10 * data.aerialCrouchDamp!, 3);
  });

  it("descent velocity is NOT dampened during startup", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ down: ["Crouch"] }));

    player.body.velocity.y = 10;

    // Only step 1: elapsed = DT < startup — no damp.
    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    expect(player.body.velocity.y).toBe(10);
  });

  it("ascending velocity (negative Y) is not dampened during aerial crouch", () => {
    const bus = createEventBus<GameEvents>();
    const system = new CombatSystem(bus);
    const player = new Player({ x: 0, y: 0 });
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ down: ["Crouch"] }));

    // Moving upward.
    player.body.velocity.y = -5;

    system.update(DT, makeSnap({ pressed: ["Attack"] }), player, []);
    system.update(DT, EMPTY_SNAPSHOT, player, []); // active window starts
    // Upward velocity untouched (damp only applies when velocity.y > 0).
    expect(player.body.velocity.y).toBe(-5);
  });
});

// ─── Player i-frames (via Player.takeDamage) ──────────────────────────────────

describe("Player — i-frames prevent re-hit", () => {
  it("second takeDamage call within i-frame window returns false", () => {
    const player = new Player({ x: 0, y: 0 }, { iFrameDuration: 1 });
    const hit1 = player.takeDamage(1, 0, 0);
    expect(hit1).toBe(true);

    const hit2 = player.takeDamage(1, 0, 0);
    expect(hit2).toBe(false);
    expect(player.health.current).toBe(2); // only one damage applied
  });

  it("hit is accepted again after i-frames expire", () => {
    const iFrameDuration = 0.05;
    const player = new Player({ x: 0, y: 0 }, { iFrameDuration });
    player.takeDamage(1, 0, 0);

    const stepsToExpire = Math.ceil(iFrameDuration / DT) + 1;
    for (let i = 0; i < stepsToExpire; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.iFrameTimer).toBe(0);

    const hit3 = player.takeDamage(1, 0, 0);
    expect(hit3).toBe(true);
    expect(player.health.current).toBe(1);
  });
});
