import { describe, it, expect } from "vitest";
import { Player } from "../../src/entities/Player.js";
import { DEFAULT_PLAYER_STATS } from "../../src/entities/components/Stats.js";
import type { InputSnapshot } from "../../src/input/InputSnapshot.js";
import type { Action } from "../../src/input/Actions.js";
import { EMPTY_SNAPSHOT } from "../../src/input/InputSnapshot.js";
import { step } from "../../src/physics/Resolver.js";
import { TileWorld } from "../../src/physics/TileWorld.js";

const DT = 1 / 120;

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Build a synthetic InputSnapshot without needing a real Input instance. */
function makeSnap(opts: {
  axes?: { moveX?: number };
  down?: Action[];
  pressed?: Action[];
  released?: Action[];
} = {}): InputSnapshot {
  return {
    axes: {
      moveX: opts.axes?.moveX ?? 0,
    },
    buttonsDown: new Set<Action>(opts.down ?? []),
    buttonsPressed: new Set<Action>(opts.pressed ?? []),
    buttonsReleased: new Set<Action>(opts.released ?? []),
    timestamp: 0,
  };
}

/** Floor at tile row `floorRow`; tiles span the full width. */
function makeFloorWorld(floorRow = 10): TileWorld {
  const w = new TileWorld(20, 20);
  w.fillRect(0, floorRow, 20, 1, true);
  return w;
}

/** World with a floor AND a left wall (tile column 0). */
function makeFloorAndWallWorld(floorRow = 10): TileWorld {
  const w = makeFloorWorld(floorRow);
  w.fillRect(0, 0, 1, 20, true); // left wall
  return w;
}

/** Run N steps: player.update → physics.step. */
function runSteps(
  n: number,
  player: Player,
  world: TileWorld,
  snapFn: (i: number) => InputSnapshot = () => EMPTY_SNAPSHOT,
): void {
  for (let i = 0; i < n; i++) {
    player.update(DT, snapFn(i));
    step(player.body, world, DT);
  }
}

/** Advance until grounded (max 2 000 steps). Returns true if landed. */
function runUntilGrounded(player: Player, world: TileWorld): boolean {
  for (let i = 0; i < 2000; i++) {
    player.update(DT, EMPTY_SNAPSHOT);
    step(player.body, world, DT);
    if (player.body.flags.onGround) {
      // One extra update so locomotion reflects the new onGround flag.
      player.update(DT, EMPTY_SNAPSHOT);
      return true;
    }
  }
  return false;
}

// ─── Locomotion state ─────────────────────────────────────────────────────────

describe("Player — locomotion state", () => {
  it("locomotion is Grounded when body.flags.onGround is true", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.locomotion).toBe("Grounded");
  });

  it("locomotion is Airborne when neither grounded nor on a wall", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.locomotion).toBe("Airborne");
  });

  it("locomotion is WallSliding when on a wall with downward velocity", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallR = true;
    player.body.velocity.y = 3; // moving downward
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.locomotion).toBe("WallSliding");
  });

  it("landing resets air-jump counter", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirJumps: 2 });
    player.body.flags.onGround = false;
    // Use two air jumps
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.airJumpsUsed).toBe(2);

    // Land
    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.airJumpsUsed).toBe(0);
  });
});

// ─── Jump ─────────────────────────────────────────────────────────────────────

describe("Player — jump", () => {
  it("grounded jump sets velocity.y to jumpVelocity", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);
  });

  it("jump buffer: jump pressed while airborne fires on the first grounded frame", () => {
    const player = new Player({ x: 5, y: 5 });

    // Airborne — press Jump, buffer starts.
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.jumpBufferTimer).toBeGreaterThan(0);
    // No jump yet (nothing to land on).
    expect(player.body.velocity.y).toBe(0);

    // A few more airborne frames (buffer still live).
    for (let i = 0; i < 3; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.jumpBufferTimer).toBeGreaterThan(0);

    // Player lands.
    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);

    // Jump must have fired.
    expect(player.body.velocity.y).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);
    expect(player.jumpBufferTimer).toBe(0);
  });

  it("jump buffer expires: no jump after buffer window passes", () => {
    const bufferTime = DEFAULT_PLAYER_STATS.jumpBufferTime;
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;

    // Press Jump — starts buffer.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));

    // Run enough steps to exhaust the buffer without landing.
    const steps = Math.ceil(bufferTime / DT) + 2;
    for (let i = 0; i < steps; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.jumpBufferTimer).toBe(0);

    // Now land — buffer is dead, no jump.
    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.body.velocity.y).toBe(0);
  });

  it("jump buffer + physics: press jump 5 frames before landing, player jumps on landing", () => {
    const world = makeFloorWorld(10);
    // Floor top face is at y=10 (tile row 10); body center when resting = 10 - standHalfH = 9.5
    const player = new Player({ x: 5, y: 5 }, { gravity: 30 });

    // Fall toward floor; press Jump when ~5 render-frames (~10 physics steps) remain.
    let jumpPressed = false;
    let jumped = false;

    for (let i = 0; i < 2000 && !jumped; i++) {
      // Distance from body bottom to floor top face (y=10).
      const bodyBottom = player.body.position.y + player.body.halfExtents.y;
      const remainingY = 10 - bodyBottom;

      // Press jump once when < 5 render-frames worth of fall distance remain.
      const pressJump =
        !jumpPressed &&
        remainingY > 0 &&
        player.body.velocity.y > 0 && // must be falling
        remainingY < player.body.velocity.y * (5 / 60);

      if (pressJump) jumpPressed = true;
      const snap = pressJump ? makeSnap({ pressed: ["Jump"] }) : EMPTY_SNAPSHOT;

      player.update(DT, snap);
      // Detect jump immediately after player.update (before physics zeroes velocity).
      if (player.body.velocity.y < -1) jumped = true;
      step(player.body, world, DT);
    }

    expect(jumpPressed).toBe(true);
    expect(jumped).toBe(true);
  });

  it("coyote time: jump within the window after walking off a ledge", () => {
    const player = new Player({ x: 5, y: 5 });

    // Simulate being grounded last frame.
    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.locomotion).toBe("Grounded");

    // Walk off the edge: onGround becomes false (no jump pressed).
    player.body.flags.onGround = false;
    player.update(DT, EMPTY_SNAPSHOT);
    // Coyote timer must start.
    expect(player.coyoteTimer).toBeGreaterThan(0);
    expect(player.locomotion).toBe("Airborne");

    // Jump within the coyote window.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);
  });

  it("coyote time expires: no jump after window passes", () => {
    const player = new Player({ x: 5, y: 5 }, { coyoteTime: 6 / 60 });

    player.body.flags.onGround = true;
    player.update(DT, EMPTY_SNAPSHOT);
    player.body.flags.onGround = false;
    player.update(DT, EMPTY_SNAPSHOT); // coyote starts

    // Drain the coyote window without pressing Jump.
    const steps = Math.ceil(DEFAULT_PLAYER_STATS.coyoteTime / DT) + 2;
    for (let i = 0; i < steps; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.coyoteTimer).toBe(0);

    // Too late — jump should not fire.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(0);
  });

  it("coyote time does not start when player actively jumped", () => {
    const player = new Player({ x: 5, y: 5 });

    // Jump while grounded.
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);

    // Next frame the body is airborne; coyote must NOT start (we intentionally jumped).
    player.body.flags.onGround = false;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.coyoteTimer).toBe(0);
  });

  it("variable jump height: releasing Jump early halves upward velocity", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    const fullVY = player.body.velocity.y;
    expect(fullVY).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);

    // Release Jump while still ascending (velocity.y < 0).
    player.update(DT, makeSnap({ released: ["Jump"] }));
    expect(player.body.velocity.y).toBeCloseTo(
      fullVY * DEFAULT_PLAYER_STATS.jumpCutMultiplier,
      5,
    );
  });
});

// ─── Air control ──────────────────────────────────────────────────────────────

describe("Player — air control", () => {
  it("velocity reaches maxSpeed target within one physics step when airborne", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.velocity.x = 0;

    // airAccel * DT = 1000 / 120 ≈ 8.33 ≥ maxSpeed (8) → instant.
    player.update(DT, makeSnap({ axes: { moveX: 1 } }));
    expect(player.body.velocity.x).toBe(DEFAULT_PLAYER_STATS.maxSpeed);
  });

  it("horizontal authority in air is indistinguishable from ground (same accel)", () => {
    const airPlayer = new Player({ x: 5, y: 5 });
    airPlayer.body.flags.onGround = false;
    airPlayer.update(DT, makeSnap({ axes: { moveX: -1 } }));

    const groundPlayer = new Player({ x: 5, y: 5 });
    groundPlayer.body.flags.onGround = true;
    groundPlayer.update(DT, makeSnap({ axes: { moveX: -1 } }));

    expect(airPlayer.body.velocity.x).toBe(groundPlayer.body.velocity.x);
  });
});

// ─── Wall kick ────────────────────────────────────────────────────────────────

describe("Player — wall kick", () => {
  it("kick away from right wall: velocity X is negative, Y matches wallKickVY", () => {
    const stats = { wallKickVX: 8, wallKickVY: -12, wallKickLockDuration: 6 / 60 };
    const player = new Player({ x: 5, y: 5 }, stats);

    // Set up wall-sliding state on the right wall.
    player.body.flags.onGround = false;
    player.body.flags.onWallR = true;
    player.body.velocity.y = 3; // falling
    player.update(DT, EMPTY_SNAPSHOT); // stabilise locomotion = WallSliding

    // Press Jump → wall kick.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));

    expect(player.body.velocity.x).toBeCloseTo(-stats.wallKickVX, 5);
    expect(player.body.velocity.y).toBeCloseTo(stats.wallKickVY, 5);
    expect(player.locomotion).toBe("Airborne");
  });

  it("kick away from left wall: velocity X is positive", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallL = true;
    player.body.velocity.y = 3;
    player.update(DT, EMPTY_SNAPSHOT);

    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(DEFAULT_PLAYER_STATS.wallKickVX, 5);
  });

  it("horizontal input is locked briefly after the kick to enforce momentum", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallR = true;
    player.body.velocity.y = 3;
    player.update(DT, EMPTY_SNAPSHOT);
    player.update(DT, makeSnap({ pressed: ["Jump"] }));

    const kickVX = player.body.velocity.x;
    // Normal wall kick gets a 1× lock duration.
    expect(player.wallKickLockTimer).toBeCloseTo(DEFAULT_PLAYER_STATS.wallKickLockDuration, 5);

    // Player has now kicked off the wall — simulate physics moving them
    // away by clearing the wall flag.
    player.body.flags.onWallR = false;

    // During the lock, opposing horizontal input is ignored — kick velocity
    // is preserved verbatim.
    player.update(DT, makeSnap({ axes: { moveX: 1 } }));
    expect(player.body.velocity.x).toBeCloseTo(kickVX, 5);

    // Tick past the lock window, then opposing input flips direction while
    // preserving the kick's speed magnitude (wall-kick momentum).
    const ticks = Math.ceil(DEFAULT_PLAYER_STATS.wallKickLockDuration / DT) + 1;
    for (let i = 0; i < ticks; i++) {
      player.update(DT, makeSnap());
    }
    player.update(DT, makeSnap({ axes: { moveX: 1 } }));
    expect(player.body.velocity.x).toBeCloseTo(Math.abs(kickVX), 5);
  });

  it("wall kick + physics integration: player bounces off wall", () => {
    const world = new TileWorld(20, 20);
    world.fillRect(0, 0, 1, 20, true); // left wall
    world.fillRect(0, 19, 20, 1, true); // floor at bottom

    // Start player next to left wall, no floor under them.
    const player = new Player({ x: 1.5, y: 5 });
    // Fall and press against left wall.
    let touchedWall = false;
    for (let i = 0; i < 200; i++) {
      player.update(DT, makeSnap({ axes: { moveX: -1 } }));
      step(player.body, world, DT);
      if (player.body.flags.onWallL && player.body.velocity.y > 0) {
        touchedWall = true;
        break;
      }
    }
    expect(touchedWall).toBe(true);

    // Kick off the wall.
    player.body.flags.onWallL = true;
    player.body.velocity.y = 3;
    player.update(DT, EMPTY_SNAPSHOT); // ensure WallSliding
    player.update(DT, makeSnap({ pressed: ["Jump"] }));

    // Player should be moving right and upward.
    expect(player.body.velocity.x).toBeGreaterThan(0);
    expect(player.body.velocity.y).toBeLessThan(0);
  });
});

// ─── Spring ───────────────────────────────────────────────────────────────────

describe("Player — spring", () => {
  it("Crouch held for 0.5 s fully charges the spring", () => {
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: 2.0 });
    player.body.flags.onGround = true;
    const steps = Math.round(0.5 / DT);
    for (let i = 0; i < steps; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }
    // 2.0 charge/s × 0.5 s = 1.0 → fully charged.
    expect(player.springCharge).toBeCloseTo(1.0, 2);
    expect(player.isSpringCharging).toBe(true);
  });

  it("spring charge is clamped to 1.0", () => {
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: 10 });
    player.body.flags.onGround = true;
    for (let i = 0; i < 20; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }
    expect(player.springCharge).toBeLessThanOrEqual(1.0);
  });

  it("releasing Crouch with MoveRight held fires a diagonal up-right spring", () => {
    const maxImpulse = 20;
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: 2.0, springMaxImpulse: maxImpulse });
    player.body.flags.onGround = true;

    // Charge for 0.5 s → full charge.
    const steps = Math.round(0.5 / DT);
    for (let i = 0; i < steps; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }

    player.body.velocity.x = 0;
    player.body.velocity.y = 0;

    // Release crouch while holding MoveRight.
    player.update(
      DT,
      makeSnap({ down: ["MoveRight"], released: ["Crouch"], axes: { moveX: 1 } }),
    );

    const expected = maxImpulse / Math.SQRT2;
    expect(player.body.velocity.x).toBeCloseTo(expected, 2);
    expect(player.body.velocity.y).toBeCloseTo(-expected, 2);
    expect(player.springCharge).toBe(0);
    expect(player.isSpringCharging).toBe(false);
  });

  it("releasing Crouch with MoveLeft held fires a diagonal up-left spring", () => {
    const maxImpulse = 20;
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: 2.0, springMaxImpulse: maxImpulse });
    player.body.flags.onGround = true;

    const steps = Math.round(0.5 / DT);
    for (let i = 0; i < steps; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }

    player.body.velocity.x = 0;
    player.body.velocity.y = 0;

    player.update(
      DT,
      makeSnap({ down: ["MoveLeft"], released: ["Crouch"], axes: { moveX: -1 } }),
    );

    const expected = maxImpulse / Math.SQRT2;
    expect(player.body.velocity.x).toBeCloseTo(-expected, 2);
    expect(player.body.velocity.y).toBeCloseTo(-expected, 2);
  });

  it("releasing Crouch with no direction held does NOT fire a spring", () => {
    const maxImpulse = 20;
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: 2.0, springMaxImpulse: maxImpulse });
    player.body.flags.onGround = true;

    const steps = Math.round(0.5 / DT);
    for (let i = 0; i < steps; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }

    player.body.velocity.x = 0;
    player.body.velocity.y = 0;

    // Release crouch with no direction.
    player.update(DT, makeSnap({ released: ["Crouch"] }));

    expect(player.body.velocity.x).toBe(0);
    expect(player.body.velocity.y).toBe(0);
    expect(player.springCharge).toBe(0);
    expect(player.isSpringCharging).toBe(false);
  });

  it("partial charge releases proportional impulse", () => {
    const maxImpulse = 20;
    const chargeRate = 2.0;
    const player = new Player({ x: 5, y: 5 }, { springChargeRate: chargeRate, springMaxImpulse: maxImpulse });
    player.body.flags.onGround = true;

    // Charge for 0.25 s → charge = 2.0 × 0.25 = 0.5
    const steps = Math.round(0.25 / DT);
    for (let i = 0; i < steps; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }

    const charge = player.springCharge;
    player.body.velocity.x = 0;
    player.body.velocity.y = 0;
    player.update(
      DT,
      makeSnap({ down: ["MoveRight"], released: ["Crouch"], axes: { moveX: 1 } }),
    );

    const expected = (charge * maxImpulse) / Math.SQRT2;
    expect(player.body.velocity.x).toBeCloseTo(expected, 2);
    expect(player.body.velocity.y).toBeCloseTo(-expected, 2);
  });
});

// ─── Mid-air jump (MAJ) ───────────────────────────────────────────────────────

describe("Player — mid-air jump", () => {
  it("MAJ counter never exceeds maxAirJumps cap", () => {
    const cap = 2;
    const player = new Player({ x: 5, y: 5 }, { maxAirJumps: cap });
    player.body.flags.onGround = false;

    // Attempt 3 air jumps — only 2 should fire.
    for (let i = 0; i < cap + 1; i++) {
      player.update(DT, makeSnap({ pressed: ["Jump"] }));
    }

    expect(player.airJumpsUsed).toBe(cap);
  });

  it("air jump fires when maxAirJumps > 0", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirJumps: 1 });
    player.body.flags.onGround = false;

    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(DEFAULT_PLAYER_STATS.jumpVelocity);
    expect(player.airJumpsUsed).toBe(1);
  });

  it("air jump does not fire when maxAirJumps is 0 (base player)", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirJumps: 0 });
    player.body.flags.onGround = false;

    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.y).toBe(0);
    expect(player.airJumpsUsed).toBe(0);
  });
});

// ─── Mid-air dash ─────────────────────────────────────────────────────────────

describe("Player — dash", () => {
  it("grounded dash fires regardless of maxAirDashes", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirDashes: 0 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);
    expect(player.body.velocity.x).toBeGreaterThan(0);
  });

  it("dash velocity is dashDistance / dashDuration", () => {
    const dashDistance = 4;
    const dashDuration = 0.15;
    const player = new Player({ x: 5, y: 5 }, { dashDistance, dashDuration });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    const expected = dashDistance / dashDuration;
    expect(player.body.velocity.x).toBeCloseTo(expected, 3);
  });

  it("dash velocity is maintained for the full dashDuration", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    const dashVX = player.body.velocity.x;

    const steps = Math.floor(DEFAULT_PLAYER_STATS.dashDuration / DT);
    for (let i = 0; i < steps - 1; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
      expect(player.body.velocity.x).toBeCloseTo(dashVX, 3);
      expect(player.isDashing).toBe(true);
    }
  });

  it("dash ends after dashDuration", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));

    const steps = Math.ceil(DEFAULT_PLAYER_STATS.dashDuration / DT) + 2;
    for (let i = 0; i < steps; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.isDashing).toBe(false);
  });

  it("ground dash has no cooldown — can be chained back-to-back", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);

    // End the first dash.
    const stepsNeeded = Math.ceil(DEFAULT_PLAYER_STATS.dashDuration / DT) + 2;
    for (let i = 0; i < stepsNeeded; i++) player.update(DT, EMPTY_SNAPSHOT);
    expect(player.isDashing).toBe(false);
    expect(player.dashCooldownTimer).toBe(0);

    // Immediately re-press Dash on the next frame — should fire again.
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);
  });

  it("air dash counter never exceeds maxAirDashes", () => {
    const cap = 1;
    const player = new Player({ x: 5, y: 5 }, { maxAirDashes: cap, dashCooldown: 0 });
    player.body.flags.onGround = false;

    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.airDashesUsed).toBe(1);
    expect(player.isDashing).toBe(true);

    // End dash quickly.
    const stepsNeeded = Math.ceil(DEFAULT_PLAYER_STATS.dashDuration / DT) + 1;
    for (let i = 0; i < stepsNeeded; i++) player.update(DT, EMPTY_SNAPSHOT);

    // Second air dash attempt — capped.
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.airDashesUsed).toBe(cap); // unchanged
    expect(player.isDashing).toBe(false);
  });
});

// ─── Dash interactions: jump-cancel, dash-jump, dash-wall-kick ────────────────

describe("Player — dash interactions", () => {
  const dashSpeed = DEFAULT_PLAYER_STATS.dashDistance / DEFAULT_PLAYER_STATS.dashDuration;

  it("Jump pressed mid-dash cancels the dash and fires a jump", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    // Start dash from ground.
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);
    const vxAtDashStart = player.body.velocity.x;

    // Mid-dash, still grounded, press Jump (Dash NOT held).
    player.update(DT, makeSnap({ pressed: ["Jump"] }));

    expect(player.isDashing).toBe(false);
    expect(player.body.velocity.y).toBeCloseTo(DEFAULT_PLAYER_STATS.jumpVelocity, 3);
    // vx is not zeroed; it remains well above maxSpeed and is allowed to
    // decay naturally via air-accel after the cancel.
    expect(player.body.velocity.x).toBeGreaterThan(DEFAULT_PLAYER_STATS.maxSpeed);
    expect(player.body.velocity.x).toBeLessThanOrEqual(vxAtDashStart);
  });

  it("jump-canceling an air-dash refunds the air-dash budget", () => {
    // Need an air-jump available so the cancel can actually fire a jump.
    const player = new Player(
      { x: 5, y: 5 },
      { maxAirDashes: 1, maxAirJumps: 1, dashCooldown: 0 },
    );
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);
    expect(player.airDashesUsed).toBe(1);

    // Jump-cancel mid-dash via air-jump.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.isDashing).toBe(false);
    expect(player.airDashesUsed).toBe(0);
  });

  it("jump-cancel does NOT refund the dash cooldown", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.isDashing).toBe(false);
    // Dash cooldown is no longer applied at all (ground dash is unlimited),
    // so the timer simply stays at 0. The cancel does not introduce one.
    expect(player.dashCooldownTimer).toBe(0);
  });

  it("touching a wall refunds the air-dash budget", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirDashes: 1 });
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.airDashesUsed).toBe(1);

    // End dash.
    const stepsNeeded = Math.ceil(DEFAULT_PLAYER_STATS.dashDuration / DT) + 2;
    for (let i = 0; i < stepsNeeded; i++) player.update(DT, EMPTY_SNAPSHOT);

    // Touch a wall — should refund the air-dash count.
    player.body.flags.onWallR = true;
    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.airDashesUsed).toBe(0);

    // Leave the wall and dash again in air — should succeed.
    player.body.flags.onWallR = false;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: -1 } }));
    expect(player.isDashing).toBe(true);
    expect(player.airDashesUsed).toBe(1);
  });

  it("Dash held + Jump from ground produces a dash-jump (vx ≈ dashSpeed)", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(
      DT,
      makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"], axes: { moveX: 1 } }),
    );
    expect(player.body.velocity.y).toBeCloseTo(DEFAULT_PLAYER_STATS.jumpVelocity, 3);
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);
    expect(player.isDashing).toBe(false); // jump-only, no dash entered
  });

  it("dash-jump direction matches current dash when canceling mid-dash", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    // Dash leftward.
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: -1 } }));
    expect(player.body.velocity.x).toBeLessThan(0);

    // Mid-dash dash-jump with Dash held but moveX = 0; should keep leftward dir.
    player.update(DT, makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(-dashSpeed, 3);
  });

  it("dash-jump uses facing when no moveX and not currently dashing", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    // Establish facing right by moving right one frame (no jump).
    player.update(DT, makeSnap({ axes: { moveX: 1 } }));
    // Dash-jump with no moveX input.
    player.update(DT, makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);
  });

  it("Dash held + wall kick sends player off the wall at dash speed", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallL = true;
    player.body.velocity.y = 1; // wall-sliding (downward)
    // Establish wall-slide locomotion.
    player.update(DT, makeSnap());
    expect(player.locomotion).toBe("WallSliding");

    // Wall kick with Dash held.
    player.update(DT, makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3); // kick away from L wall
    expect(player.body.velocity.y).toBeCloseTo(DEFAULT_PLAYER_STATS.wallKickVY, 3);
    // Wall kick gets a brief input lock to enforce momentum away from the wall.
    expect(player.wallKickLockTimer).toBeCloseTo(
      DEFAULT_PLAYER_STATS.wallKickLockDuration,
      5,
    );
  });

  it("wall kick without Dash held uses the normal wallKickVX magnitude", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallL = true;
    player.body.velocity.y = 1;
    player.update(DT, makeSnap());
    expect(player.locomotion).toBe("WallSliding");

    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(DEFAULT_PLAYER_STATS.wallKickVX, 3);
  });

  it("same-frame Dash+Jump press resolves as dash-jump (no dash starts)", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(
      DT,
      makeSnap({
        pressed: ["Dash", "Jump"],
        down: ["Dash", "Jump"],
        axes: { moveX: 1 },
      }),
    );
    expect(player.isDashing).toBe(false);
    expect(player.body.velocity.y).toBeCloseTo(DEFAULT_PLAYER_STATS.jumpVelocity, 3);
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);
  });

  it("dash-jump momentum persists in the air (no air-accel decay)", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    // Dash-jump rightward.
    player.update(
      DT,
      makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"], axes: { moveX: 1 } }),
    );
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Airborne: hold opposite direction. Momentum should NOT decay because
    // dash-jump locks horizontal authority until landing/wall contact.
    player.body.flags.onGround = false;
    for (let i = 0; i < 60; i++) {
      player.update(DT, makeSnap({ axes: { moveX: -1 } }));
      expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);
    }
  });

  it("dash-wall-kick momentum is retained in the air with no horizontal input", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallL = true;
    player.body.velocity.y = 1;
    player.update(DT, makeSnap());
    expect(player.locomotion).toBe("WallSliding");

    player.update(DT, makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Leave wall, advance airborne with no horizontal input — wall-kick
    // momentum holds the dash-derived speed indefinitely until landing.
    player.body.flags.onWallL = false;
    for (let i = 0; i < 60; i++) {
      player.update(DT, makeSnap());
      expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);
    }
  });

  it("dash-wall-kick treats dash speed as a cap, not a lock, after the input lock expires", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = false;
    player.body.flags.onWallL = true;
    player.body.velocity.y = 1;
    player.update(DT, makeSnap());

    player.update(DT, makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"] }));
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Tick past the dash wall-kick lock window with no input.
    player.body.flags.onWallL = false;
    const ticks = Math.ceil(DEFAULT_PLAYER_STATS.wallKickLockDuration / DT) + 1;
    for (let i = 0; i < ticks; i++) {
      player.update(DT, makeSnap());
    }
    // Momentum carried unchanged through the no-input ticks.
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Holding into the kick direction preserves the supercharged speed —
    // standard air-accel does not bleed the player down to maxSpeed.
    for (let i = 0; i < 30; i++) {
      player.update(DT, makeSnap({ axes: { moveX: 1 } }));
    }
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Pressing the opposite direction does NOT instantly flip to -dashSpeed;
    // standard air-accel decelerates the player. After one tick the player
    // has slowed by airAccel * dt but is still moving in the original direction.
    const vxBefore = player.body.velocity.x;
    player.update(DT, makeSnap({ axes: { moveX: -1 } }));
    const expectedAfterOneTick = vxBefore - DEFAULT_PLAYER_STATS.airAccel * DT;
    expect(player.body.velocity.x).toBeCloseTo(expectedAfterOneTick, 3);

    // Continue holding opposite — eventually the player's velocity reverses
    // and settles at -maxSpeed (the standard air-control cap), not -dashSpeed.
    for (let i = 0; i < 60; i++) {
      player.update(DT, makeSnap({ axes: { moveX: -1 } }));
    }
    expect(player.body.velocity.x).toBeCloseTo(-DEFAULT_PLAYER_STATS.maxSpeed, 3);
  });

  it("plain air-dash momentum still decays after the dash ends", () => {
    const player = new Player({ x: 5, y: 5 }, { maxAirDashes: 1 });
    player.body.flags.onGround = false;
    player.update(DT, makeSnap({ pressed: ["Dash"], axes: { moveX: 1 } }));
    expect(player.isDashing).toBe(true);

    // End dash naturally (no jump).
    const stepsNeeded = Math.ceil(DEFAULT_PLAYER_STATS.dashDuration / DT) + 1;
    for (let i = 0; i < stepsNeeded; i++) player.update(DT, EMPTY_SNAPSHOT);
    expect(player.isDashing).toBe(false);
    const vxAtEnd = player.body.velocity.x;

    // With no input held, air-accel should decay vx toward 0.
    for (let i = 0; i < 30; i++) player.update(DT, EMPTY_SNAPSHOT);
    expect(player.body.velocity.x).toBeLessThan(vxAtEnd);
  });

  it("landing clears the dash-jump momentum lock (normal control resumes)", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(
      DT,
      makeSnap({ pressed: ["Jump"], down: ["Dash", "Jump"], axes: { moveX: 1 } }),
    );
    expect(player.body.velocity.x).toBeCloseTo(dashSpeed, 3);

    // Land.
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ axes: { moveX: -1 } }));
    // Now hold left for a bit — vx should decay/reverse via ground-accel.
    for (let i = 0; i < 30; i++) {
      player.update(DT, makeSnap({ axes: { moveX: -1 } }));
    }
    expect(player.body.velocity.x).toBeLessThan(0);
  });
});

// ─── Crouch ───────────────────────────────────────────────────────────────────

describe("Player — crouch", () => {
  it("Crouch held shrinks hitbox half-height to crouchHalfH", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    expect(player.body.halfExtents.y).toBe(DEFAULT_PLAYER_STATS.standHalfH);

    player.update(DT, makeSnap({ down: ["Crouch"] }));
    expect(player.isCrouching).toBe(true);
    expect(player.body.halfExtents.y).toBe(DEFAULT_PLAYER_STATS.crouchHalfH);
  });

  it("releasing Crouch restores standHalfH", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    player.update(DT, makeSnap({ down: ["Crouch"] }));
    expect(player.isCrouching).toBe(true);

    player.update(DT, EMPTY_SNAPSHOT);
    expect(player.isCrouching).toBe(false);
    expect(player.body.halfExtents.y).toBe(DEFAULT_PLAYER_STATS.standHalfH);
  });

  it("crouchHoldTimer increments while Crouch is held", () => {
    const player = new Player({ x: 5, y: 5 });
    player.body.flags.onGround = true;
    for (let i = 0; i < 10; i++) {
      player.update(DT, makeSnap({ down: ["Crouch"] }));
    }
    expect(player.crouchHoldTimer).toBeCloseTo(10 * DT, 5);
  });
});

// ─── Health / i-frames ────────────────────────────────────────────────────────

describe("Player — health and i-frames", () => {
  it("takeDamage reduces HP and starts i-frame timer", () => {
    const player = new Player({ x: 5, y: 5 }, { maxHealth: 3, iFrameDuration: 1 });
    const hit = player.takeDamage(1, 0, 0);
    expect(hit).toBe(true);
    expect(player.health.current).toBe(2);
    expect(player.iFrameTimer).toBeGreaterThan(0);
  });

  it("i-frames block subsequent hits within the window", () => {
    const player = new Player({ x: 5, y: 5 }, { iFrameDuration: 1 });
    player.takeDamage(1, 0, 0);

    const hit2 = player.takeDamage(1, 0, 0);
    expect(hit2).toBe(false);
    expect(player.health.current).toBe(2); // only one damage applied
  });

  it("i-frame timer expires via update ticks; hit is then accepted", () => {
    const iFrameDuration = 0.1;
    const player = new Player({ x: 5, y: 5 }, { iFrameDuration });
    player.takeDamage(1, 0, 0);

    // Drain i-frames.
    const stepsNeeded = Math.ceil(iFrameDuration / DT) + 2;
    for (let i = 0; i < stepsNeeded; i++) {
      player.update(DT, EMPTY_SNAPSHOT);
    }
    expect(player.iFrameTimer).toBe(0);

    const hit3 = player.takeDamage(1, 0, 0);
    expect(hit3).toBe(true);
    expect(player.health.current).toBe(1);
  });

  it("knockback applies velocity on hit", () => {
    const player = new Player({ x: 5, y: 5 });
    player.takeDamage(1, 5, -3);
    expect(player.body.velocity.x).toBe(5);
    expect(player.body.velocity.y).toBe(-3);
  });

  it("isAlive becomes false when HP reaches 0", () => {
    const player = new Player({ x: 5, y: 5 }, { maxHealth: 1, iFrameDuration: 0 });
    expect(player.isAlive).toBe(true);
    player.takeDamage(1, 0, 0);
    expect(player.isAlive).toBe(false);
  });
});

// ─── Full physics integration ─────────────────────────────────────────────────

describe("Player — physics integration", () => {
  it("player falls under gravity and lands on floor", () => {
    const world = makeFloorWorld(10);
    const player = new Player({ x: 5, y: 5 }, { gravity: 30 });

    const landed = runUntilGrounded(player, world);
    expect(landed).toBe(true);
    expect(player.locomotion).toBe("Grounded");
  });

  it("grounded jump with physics: player rises then falls back to floor", () => {
    const world = makeFloorWorld(10);
    const player = new Player({ x: 5, y: 9 }, { gravity: 30 });

    // Land first.
    const landed = runUntilGrounded(player, world);
    expect(landed).toBe(true);

    // Jump.
    player.update(DT, makeSnap({ pressed: ["Jump"] }));
    step(player.body, world, DT);
    const startY = player.body.position.y;

    // Run for 60 steps — should rise above startY.
    runSteps(60, player, world);
    const peakY = player.body.position.y;
    expect(peakY).toBeLessThan(startY); // negative Y is up

    // Eventually lands again.
    const landedAgain = runUntilGrounded(player, world);
    expect(landedAgain).toBe(true);
  });
});
