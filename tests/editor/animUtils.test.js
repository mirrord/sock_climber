import { describe, it, expect } from 'vitest';
import { resolveIdleAnimDef, resolveBehaviorAnimDef, advanceAnimFrame } from '../../src/editor/animUtils.js';
import { GameObject } from '../../src/objects/GameObject.js';
import { Behavior } from '../../src/objects/Behavior.js';

// ---- resolveIdleAnimDef -----------------------------------------------

describe('resolveIdleAnimDef', () => {
  it('returns null when no animations are defined on the object', () => {
    const obj = new GameObject({ type: 'enemy', name: 'Enemy' });
    expect(resolveIdleAnimDef(obj)).toBe(null);
  });

  it('returns null when idle behavior has no animation name set', () => {
    const obj = new GameObject({
      type: 'enemy',
      name: 'Enemy',
      behaviors: [new Behavior({ id: 'idle', name: 'Idle', animation: null })],
    });
    expect(resolveIdleAnimDef(obj)).toBe(null);
  });

  it('returns null when idle animation name does not match any animation def', () => {
    const obj = new GameObject({
      type: 'enemy',
      name: 'Enemy',
      animations: [{ id: 'a1', name: 'run', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true }],
    });
    // auto-added idle behavior has animation: 'idle', but we only have 'run'
    expect(resolveIdleAnimDef(obj)).toBe(null);
  });

  it('returns the animation def whose name matches the idle behavior animation', () => {
    const animDef = {
      id: 'a1', name: 'idle', spriteSheetId: 'sheet1',
      frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true,
    };
    const obj = new GameObject({ type: 'enemy', name: 'Enemy', animations: [animDef] });
    // The auto-added idle behavior has animation: 'idle', matching animDef.name
    const result = resolveIdleAnimDef(obj);
    expect(result).not.toBe(null);
    expect(result.name).toBe('idle');
    expect(result.spriteSheetId).toBe('sheet1');
    expect(result.frameCount).toBe(4);
  });

  it('matches by the behavior animation name, even if it differs from "idle"', () => {
    const animDef = {
      id: 'a2', name: 'stand', spriteSheetId: null,
      frameWidth: 16, frameHeight: 16, frameStart: 0, frameCount: 2, fps: 4, loop: true,
    };
    const obj = new GameObject({
      type: 'player',
      name: 'Hero',
      behaviors: [new Behavior({ id: 'idle', name: 'Idle', animation: 'stand' })],
      animations: [animDef],
    });
    const result = resolveIdleAnimDef(obj);
    expect(result).not.toBe(null);
    expect(result.name).toBe('stand');
  });
});

// ---- advanceAnimFrame -----------------------------------------------

describe('advanceAnimFrame', () => {
  const loopDef = { fps: 4, frameCount: 4, frameStart: 0, loop: true };

  it('does not advance frame when less than one interval has passed', () => {
    const state = { frame: 0, timeAcc: 0, animDef: loopDef };
    const result = advanceAnimFrame(state, 0.1); // < 0.25s per frame
    expect(result.frame).toBe(0);
    expect(result.timeAcc).toBeCloseTo(0.1);
  });

  it('advances one frame when exactly one interval elapses', () => {
    const state = { frame: 0, timeAcc: 0, animDef: loopDef };
    const result = advanceAnimFrame(state, 0.25); // 1/4 fps
    expect(result.frame).toBe(1);
    expect(result.timeAcc).toBeCloseTo(0);
  });

  it('advances multiple frames when multiple intervals pass', () => {
    const state = { frame: 0, timeAcc: 0, animDef: loopDef };
    const result = advanceAnimFrame(state, 0.75);
    expect(result.frame).toBe(3);
  });

  it('wraps frame index when looping', () => {
    const state = { frame: 3, timeAcc: 0, animDef: loopDef };
    const result = advanceAnimFrame(state, 0.25); // frame 3 → 0 (wrap)
    expect(result.frame).toBe(0);
  });

  it('clamps to last frame when loop is false', () => {
    const noLoopDef = { fps: 4, frameCount: 4, frameStart: 0, loop: false };
    const state = { frame: 3, timeAcc: 0, animDef: noLoopDef };
    const result = advanceAnimFrame(state, 10);
    expect(result.frame).toBe(3);
  });

  it('does not advance if frameCount is 1', () => {
    const singleDef = { fps: 8, frameCount: 1, frameStart: 0, loop: true };
    const state = { frame: 0, timeAcc: 0, animDef: singleDef };
    const result = advanceAnimFrame(state, 1.0);
    expect(result.frame).toBe(0);
  });

  it('does not advance if fps is 0', () => {
    const staticDef = { fps: 0, frameCount: 4, frameStart: 0, loop: true };
    const state = { frame: 0, timeAcc: 0, animDef: staticDef };
    const result = advanceAnimFrame(state, 1.0);
    expect(result.frame).toBe(0);
  });

  it('accumulates sub-frame time correctly across multiple calls', () => {
    const def = { fps: 4, frameCount: 4, frameStart: 0, loop: true };
    let state = { frame: 0, timeAcc: 0, animDef: def };
    // Three calls of 0.1s each = 0.3s total; need 0.25s → should advance 1 frame
    for (let i = 0; i < 3; i++) {
      const next = advanceAnimFrame(state, 0.1);
      state = { ...state, frame: next.frame, timeAcc: next.timeAcc };
    }
    expect(state.frame).toBe(1);
  });

  it('does not mutate the input state', () => {
    const state = { frame: 0, timeAcc: 0, animDef: loopDef };
    advanceAnimFrame(state, 1.0);
    expect(state.frame).toBe(0);
    expect(state.timeAcc).toBe(0);
  });
});

// ---- resolveBehaviorAnimDef -----------------------------------------------

describe('resolveBehaviorAnimDef', () => {
  const animIdle = { id: 'a1', name: 'idle', spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true };
  const animRun  = { id: 'a2', name: 'run',  spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 4, frameCount: 6, fps: 12, loop: true };
  const animJump = { id: 'a3', name: 'jump', spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 10, frameCount: 3, fps: 8, loop: false };

  function makeObj(behaviorId, behaviorAnimation, animations = []) {
    return {
      behaviors: [{ id: behaviorId, name: behaviorId, animation: behaviorAnimation }],
      animations,
    };
  }

  it('returns null when the behavior does not exist on the object', () => {
    const obj = makeObj('idle', 'idle', [animIdle]);
    expect(resolveBehaviorAnimDef(obj, 'jump')).toBe(null);
  });

  it('returns null when the behavior has no animation name set', () => {
    const obj = makeObj('jump', null, [animJump]);
    expect(resolveBehaviorAnimDef(obj, 'jump')).toBe(null);
  });

  it('returns null when the behavior animation name matches no animation def', () => {
    const obj = makeObj('jump', 'jump', [animIdle]);
    expect(resolveBehaviorAnimDef(obj, 'jump')).toBe(null);
  });

  it('returns the animation def whose name matches the behavior animation', () => {
    const obj = makeObj('jump', 'jump', [animIdle, animRun, animJump]);
    const result = resolveBehaviorAnimDef(obj, 'jump');
    expect(result).not.toBe(null);
    expect(result.name).toBe('jump');
    expect(result.frameCount).toBe(3);
  });

  it('resolves independently for different behavior IDs on the same object', () => {
    const obj = {
      behaviors: [
        { id: 'idle', name: 'Idle', animation: 'idle' },
        { id: 'move_right', name: 'Move Right', animation: 'run' },
      ],
      animations: [animIdle, animRun, animJump],
    };
    expect(resolveBehaviorAnimDef(obj, 'idle').name).toBe('idle');
    expect(resolveBehaviorAnimDef(obj, 'move_right').name).toBe('run');
  });
});
