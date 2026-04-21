import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerController } from '../../src/player/PlayerController.js';
import { STATE } from '../../src/player/PlayerState.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** One fixed-physics timestep. */
const DT = 1 / 120;

/** Tile function: empty everywhere. */
const EMPTY = () => false;

/** Tile function: solid floor row at gy=0. */
const FLOOR_ONLY = (_gx, gy) => gy === 0;

/** Tile function: floor at gy=0, left wall column at gx=0. */
const FLOOR_LEFT_WALL = (gx, gy) => gy === 0 || gx === 0;

/** Tile function: floor at gy=0, right wall column at gx=5. */
const FLOOR_RIGHT_WALL = (gx, gy) => gy === 0 || gx === 5;

const NO_INPUT = { left: false, right: false, jump: false, dash: false, crouch: false };

/**
 * Make a controller standing on the floor.
 * With default playerH=0.8, hh=0.4, the standing y when on gy=0 tile is 1.4.
 */
function makeGrounded(cfg = {}, getTile = FLOOR_ONLY) {
  const ctrl = new PlayerController(cfg, getTile);
  ctrl.x = 0.5;
  ctrl.y = 1.4;
  ctrl.vy = 0;
  ctrl.grounded = true;
  return ctrl;
}

/**
 * Make a controller airborne and falling, well above any floor.
 */
function makeAirborne(cfg = {}, getTile = FLOOR_ONLY) {
  const ctrl = new PlayerController(cfg, getTile);
  ctrl.x = 0.5;
  ctrl.y = 5.0;
  ctrl.vx = 0;
  ctrl.vy = -5;
  ctrl.grounded = false;
  return ctrl;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlayerController', () => {
  it('starts in idle state', () => {
    const ctrl = makeGrounded();
    expect(ctrl.state).toBe(STATE.IDLE);
  });

  it('transitions to jumping on jump input from ground', () => {
    const ctrl = makeGrounded();
    ctrl.step({ ...NO_INPUT, jump: true }, DT);
    expect(ctrl.vy).toBeGreaterThan(0);
    expect(ctrl.grounded).toBe(false);
  });

  it.todo('applies coyote time after leaving edge');
  it.todo('buffers jump input before landing');

  // ── Crouch ─────────────────────────────────────────────────────────────────

  describe('crouch', () => {
    it('shrinks hitbox height to half when grounded and holding crouch', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.crouching).toBe(true);
      expect(ctrl.hitboxH).toBeCloseTo(0.8 * 0.5);
    });

    it('restores full hitbox height when crouch is released', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);

      // re-ground after hitbox shrink may have caused a slight drop
      ctrl.grounded = true;
      ctrl.vy = 0;

      ctrl.step({ ...NO_INPUT, crouch: false }, DT);
      expect(ctrl.crouching).toBe(false);
      expect(ctrl.hitboxH).toBeCloseTo(0.8);
    });

    it('does not crouch when airborne', () => {
      const ctrl = makeAirborne();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.crouching).toBe(false);
      expect(ctrl.hitboxH).toBeCloseTo(0.8);
    });

    it('hitbox width is unchanged while crouching', () => {
      const ctrl = makeGrounded();
      const wBefore = ctrl.hitboxW;
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.hitboxW).toBeCloseTo(wBefore);
    });

    it('can be disabled via config', () => {
      const ctrl = makeGrounded({ enableCrouch: false });
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.crouching).toBe(false);
      expect(ctrl.hitboxH).toBeCloseTo(0.8);
    });
  });

  // ── Wall slide ──────────────────────────────────────────────────────────────

  describe('wall slide', () => {
    it('reduces fall gravity while airborne and adjacent to a wall', () => {
      const ctrl = makeAirborne({}, FLOOR_LEFT_WALL);
      ctrl.x = 1.4; // right edge at 1.8, left edge exactly at 1.0 (touching gx=0 wall)
      ctrl.touchingWallLeft = true; // flag from previous frame

      const vyBefore = ctrl.vy; // -5
      ctrl.step({ ...NO_INPUT, left: true }, DT);

      // Reduced gravity: g_eff = gravity * wallSlideGravityScale = -30 * 0.5 = -15
      expect(ctrl.vy).toBeCloseTo(vyBefore + -30 * 0.5 * DT);
    });

    it('applies full gravity when not touching a wall', () => {
      const ctrl = makeAirborne();
      const vyBefore = ctrl.vy;
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBeCloseTo(vyBefore + -30 * DT);
    });

    it('does not reduce gravity when the player is grounded', () => {
      // onWall = !grounded && touching → false when grounded
      const ctrl = makeGrounded({}, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.touchingWallLeft = true; // touching wall, but grounded

      // Jump so we can measure vy change (avoid instant floor-resolution)
      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      // After jump: grounded=false, but this was the jump frame — just verify
      // we are airborne with normal jump velocity (not wall-kicked)
      expect(ctrl.vy).toBeGreaterThan(0);
      expect(ctrl.vx).toBe(0); // no wall kick (was grounded)
    });

    it('can be disabled via config', () => {
      const ctrl = makeAirborne({ enableWallSlide: false }, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.touchingWallLeft = true;

      const vyBefore = ctrl.vy;
      ctrl.step({ ...NO_INPUT, left: true }, DT);
      // Full gravity, no reduction
      expect(ctrl.vy).toBeCloseTo(vyBefore + -30 * DT);
    });
  });

  // ── Wall kick ───────────────────────────────────────────────────────────────

  describe('wall kick', () => {
    it('kicks rightward and upward when jumping off a left wall', () => {
      const ctrl = makeAirborne({}, FLOOR_LEFT_WALL);
      ctrl.x = 1.4; // adjacent to gx=0 wall
      ctrl.vy = -5;
      ctrl.touchingWallLeft = true;

      ctrl.step({ ...NO_INPUT, jump: true }, DT);

      expect(ctrl.vx).toBeGreaterThan(0); // pushed away (right) from left wall
      expect(ctrl.vy).toBeGreaterThan(0); // kicked upward
    });

    it('kick horizontal speed equals wallKickVX config', () => {
      const ctrl = makeAirborne({ wallKickVX: 8 }, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.vy = -3;
      ctrl.touchingWallLeft = true;

      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      expect(ctrl.vx).toBeCloseTo(8);
    });

    it('kicks leftward and upward when jumping off a right wall', () => {
      const ctrl = makeAirborne({}, FLOOR_RIGHT_WALL);
      ctrl.x = 4.6; // right edge at 5.0, adjacent to gx=5 wall
      ctrl.vy = -5;
      ctrl.touchingWallRight = true;

      ctrl.step({ ...NO_INPUT, jump: true }, DT);

      expect(ctrl.vx).toBeLessThan(0); // pushed away (left) from right wall
      expect(ctrl.vy).toBeGreaterThan(0);
    });

    it('performs a normal jump when grounded, even near a wall', () => {
      const ctrl = makeGrounded({}, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.touchingWallLeft = false; // grounded → wall contact cleared

      ctrl.step({ ...NO_INPUT, jump: true }, DT);

      expect(ctrl.vx).toBe(0); // no horizontal kick
      expect(ctrl.vy).toBeGreaterThan(0);
    });

    it('does not fire a second kick while jump is held', () => {
      const ctrl = makeAirborne({}, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.vy = -5;
      ctrl.touchingWallLeft = true;

      ctrl.step({ ...NO_INPUT, jump: true }, DT); // kick fires
      const vxAfterKick = ctrl.vx;

      // keep holding jump — should not kick again
      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      expect(ctrl.vx).not.toBeCloseTo(vxAfterKick + 6); // no second kick added
    });

    it('can be disabled via config', () => {
      const ctrl = makeAirborne({ enableWallKick: false }, FLOOR_LEFT_WALL);
      ctrl.x = 1.4;
      ctrl.vy = -5;
      ctrl.touchingWallLeft = true;

      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      expect(ctrl.vx).toBe(0); // no kick, no horizontal movement
      expect(ctrl.vy).toBeLessThan(0); // still falling (jump not consumed as ground jump either)
    });
  });

  // ── Dash jump ───────────────────────────────────────────────────────────────

  describe('dash jump', () => {
    it('doubles horizontal move speed in air when dash held at jump moment', () => {
      const ctrl = makeGrounded();

      // Initiate dash jump
      ctrl.step({ ...NO_INPUT, right: true, jump: true, dash: true }, DT);
      expect(ctrl._dashJumping).toBe(true);

      // Next frame in air: speed should be doubled
      ctrl.step({ ...NO_INPUT, right: true, jump: false, dash: true }, DT);
      expect(ctrl.vx).toBeCloseTo(7 * 2.0); // moveSpeed * dashJumpSpeedScale
    });

    it('applies to both left and right horizontal movement', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, left: true, jump: true, dash: true }, DT);
      ctrl.step({ ...NO_INPUT, left: true, jump: false, dash: true }, DT);
      expect(ctrl.vx).toBeCloseTo(-(7 * 2.0));
    });

    it('does not boost speed when dash is not held at jump moment', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, right: true, jump: true, dash: false }, DT);
      expect(ctrl._dashJumping).toBe(false);

      ctrl.step({ ...NO_INPUT, right: true, jump: false, dash: false }, DT);
      expect(ctrl.vx).toBeCloseTo(7); // normal air speed
    });

    it('speed returns to normal after landing', () => {
      const ctrl = new PlayerController({}, FLOOR_ONLY);
      // Bootstrap _dashJumping active, player just above floor about to land
      ctrl.x = 0.5;
      ctrl.y = 1.4001; // tiny bit above standing height
      ctrl.vy = -0.1;
      ctrl.grounded = false;
      ctrl._dashJumping = true;

      // Land
      ctrl.step({ ...NO_INPUT, right: true }, DT);
      expect(ctrl.grounded).toBe(true);
      expect(ctrl._dashJumping).toBe(false);

      // Next step: normal speed
      ctrl.step({ ...NO_INPUT, right: true }, DT);
      expect(ctrl.vx).toBeCloseTo(7);
    });

    it('can be disabled via config', () => {
      const ctrl = makeGrounded({ enableDashJump: false });
      ctrl.step({ ...NO_INPUT, right: true, jump: true, dash: true }, DT);
      expect(ctrl._dashJumping).toBe(false);

      ctrl.step({ ...NO_INPUT, right: true, jump: false, dash: true }, DT);
      expect(ctrl.vx).toBeCloseTo(7); // no boost
    });
  });

  // ── Facing ─────────────────────────────────────────────────────────────────

  describe('facing', () => {
    it('defaults to facing right', () => {
      const ctrl = makeGrounded();
      expect(ctrl.facing).toBe('right');
    });

    it('remains right when moving right', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, right: true }, DT);
      expect(ctrl.facing).toBe('right');
    });

    it('becomes left when moving left', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, left: true }, DT);
      expect(ctrl.facing).toBe('left');
    });

    it('retains last facing direction when idle (vx = 0)', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, left: true }, DT);
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.facing).toBe('left');
    });

    it('switches from left back to right', () => {
      const ctrl = makeGrounded();
      ctrl.step({ ...NO_INPUT, left: true }, DT);
      ctrl.step({ ...NO_INPUT, right: true }, DT);
      expect(ctrl.facing).toBe('right');
    });
  });

  // ── Enable Gravity: false — free vertical movement ────────────────────────

  describe('enableGravity: false — free vertical movement', () => {
    function makeFloating(cfg = {}) {
      const ctrl = new PlayerController({ enableGravity: false, ...cfg }, EMPTY);
      ctrl.x = 2.5;
      ctrl.y = 5.0;
      ctrl.vx = 0;
      ctrl.vy = 0;
      return ctrl;
    }

    it('does not apply gravity when enableGravity is false', () => {
      const ctrl = makeFloating();
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBe(0);
    });

    it('sets vy to +moveSpeed when jump is held', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      expect(ctrl.vy).toBe(ctrl._cfg.moveSpeed);
    });

    it('sets vy to -moveSpeed when crouch is held', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.vy).toBe(-ctrl._cfg.moveSpeed);
    });

    it('sets vy to 0 when neither jump nor crouch is held', () => {
      const ctrl = makeFloating();
      ctrl.vy = 5; // was moving up
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBe(0);
    });

    it('returns MOVE_UP state when vy > 0', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      expect(ctrl.state).toBe(STATE.MOVE_UP);
    });

    it('returns MOVE_DOWN state when vy < 0', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.state).toBe(STATE.MOVE_DOWN);
    });

    it('returns IDLE state when vy is 0 and vx is 0', () => {
      const ctrl = makeFloating();
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.state).toBe(STATE.IDLE);
    });

    it('returns RUNNING state when vy is 0 and moving horizontally', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, right: true }, DT);
      expect(ctrl.state).toBe(STATE.RUNNING);
    });

    it('does not set crouching when enableGravity is false', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, crouch: true }, DT);
      expect(ctrl.crouching).toBe(false);
    });

    it('allows continuous upward movement while jump is held (not just on press edge)', () => {
      const ctrl = makeFloating();
      ctrl.step({ ...NO_INPUT, jump: true }, DT);
      const y1 = ctrl.y;
      ctrl.step({ ...NO_INPUT, jump: true }, DT); // second step — still held
      expect(ctrl.y).toBeGreaterThan(y1);
    });
  });

  // ── Falling ─────────────────────────────────────────────────────────────────

  describe('falling', () => {
    it('state is FALLING when airborne with vy < 0 (default)', () => {
      const ctrl = makeAirborne();
      ctrl.vy = -5;
      expect(ctrl.state).toBe(STATE.FALLING);
    });

    it('state is JUMPING when enableFalling is false and vy < 0', () => {
      const ctrl = makeAirborne({ enableFalling: false });
      ctrl.vy = -5;
      expect(ctrl.state).toBe(STATE.JUMPING);
    });

    it('clamps vy to maxFallSpeed when enableFalling is true', () => {
      const ctrl = makeAirborne({ maxFallSpeed: -10 });
      ctrl.vy = -50; // already well past terminal velocity
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBeGreaterThanOrEqual(-10);
    });

    it('does not clamp vy when enableFalling is false', () => {
      const ctrl = makeAirborne({ enableFalling: false, maxFallSpeed: -10 });
      ctrl.vy = -50;
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBeLessThan(-10); // still past the limit — no cap applied
    });

    it('respects a custom maxFallSpeed', () => {
      const ctrl = makeAirborne({ maxFallSpeed: -25 });
      ctrl.vy = -100;
      ctrl.step(NO_INPUT, DT);
      expect(ctrl.vy).toBeCloseTo(-25);
    });

    it('does not clamp vy when it has not yet reached maxFallSpeed', () => {
      const ctrl = makeAirborne({ maxFallSpeed: -20 });
      ctrl.vy = -5; // well above terminal velocity
      ctrl.step(NO_INPUT, DT);
      // After one gravity step vy = -5 + (-30 * DT) ≈ -5.25 which is > -20
      expect(ctrl.vy).toBeGreaterThan(-20);
    });
  });
});
