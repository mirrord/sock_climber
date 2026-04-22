import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplate,
  getTemplateList,
} from '../../src/objects/templates.js';
import { GameObject, COLLISION_GROUP } from '../../src/objects/GameObject.js';

describe('templates', () => {
  it('has all required template types', () => {
    const types = getTemplateList().map((t) => t.type);
    expect(types).toContain('platform');
    expect(types).toContain('wall');
    expect(types).toContain('enemy');
    expect(types).toContain('spawn_point');
    expect(types).toContain('collectible');
    expect(types).toContain('level_end');
    expect(types).toContain('event_trigger');
    expect(types).toContain('player');
  });

  it('getTemplate returns a GameObject clone', () => {
    const obj = getTemplate('platform');
    expect(obj).toBeInstanceOf(GameObject);
    expect(obj.type).toBe('platform');
  });

  it('getTemplate returns distinct instances each call', () => {
    const a = getTemplate('enemy');
    const b = getTemplate('enemy');
    expect(a).not.toBe(b);
    a.name = 'modified';
    expect(b.name).not.toBe('modified');
  });

  it('enemy template has move and die behaviors', () => {
    const enemy = getTemplate('enemy');
    const behaviorIds = enemy.behaviors.map((b) => b.id);
    expect(behaviorIds).toContain('move');
    expect(behaviorIds).toContain('die');
  });

  it('player template has an idle behavior', () => {
    const player = getTemplate('player');
    const ids = player.behaviors.map((b) => b.id);
    expect(ids).toContain('idle');
  });

  it('player template idle behavior has animation configured', () => {
    const player = getTemplate('player');
    const idle = player.behaviors.find((b) => b.id === 'idle');
    expect(idle).toBeDefined();
    expect(idle.animation).toBeTruthy();
  });

  it('player template has move_left and move_right behaviors', () => {
    const player = getTemplate('player');
    const ids = player.behaviors.map((b) => b.id);
    expect(ids).toContain('move_left');
    expect(ids).toContain('move_right');
  });

  it('platform template has ENVIRONMENT collision group', () => {
    const p = getTemplate('platform');
    expect(p.collisionGroup).toBe(COLLISION_GROUP.ENVIRONMENT);
  });

  it('event_trigger template has a trigger', () => {
    const t = getTemplate('event_trigger');
    expect(t.triggers.length).toBeGreaterThan(0);
  });

  it('returns null for unknown template', () => {
    expect(getTemplate('nonexistent')).toBe(null);
  });

  it('player template has PLAYER collision group', () => {
    const player = getTemplate('player');
    expect(player).toBeInstanceOf(GameObject);
    expect(player.collisionGroup).toBe(COLLISION_GROUP.PLAYER);
  });

  it('player template has control triggers for all actions', () => {
    const player = getTemplate('player');
    const controlTriggers = player.triggers.filter((t) => t.type === 'control');
    const actions = controlTriggers.map((t) => t.params.action);
    expect(actions).toContain('jump');
    expect(actions).toContain('moveLeft');
    expect(actions).toContain('moveRight');
    expect(actions).toContain('crouch');
    expect(actions).toContain('dash');
  });

  it('player template has movement and action behaviors', () => {
    const player = getTemplate('player');
    const behaviorIds = player.behaviors.map((b) => b.id);
    expect(behaviorIds).toContain('jump');
    expect(behaviorIds).toContain('move_left');
    expect(behaviorIds).toContain('move_right');
    expect(behaviorIds).toContain('crouch');
    expect(behaviorIds).toContain('dash');
  });

  it('every template has an idle behavior', () => {
    const list = getTemplateList();
    for (const tmpl of list) {
      const obj = getTemplate(tmpl.type);
      const ids = obj.behaviors.map((b) => b.id);
      expect(ids, `Template '${tmpl.type}' is missing idle behavior`).toContain('idle');
    }
  });

  it('player template has animation definitions for every behavior animation', () => {
    const player = getTemplate('player');
    const animNames = player.behaviors
      .map((b) => b.animation)
      .filter(Boolean);
    expect(animNames.length).toBeGreaterThan(0);
    for (const name of animNames) {
      const match = player.animations.find((a) => a.name === name);
      expect(match, `Missing animation definition for '${name}'`).toBeDefined();
    }
  });

  it('player template animations have distinct ids', () => {
    const player = getTemplate('player');
    const ids = player.animations.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size, 'animation ids must be unique').toBe(ids.length);
  });

  // ── Fall behavior ───────────────────────────────────────────────────────────

  it('player template has a fall behavior', () => {
    const player = getTemplate('player');
    const ids = player.behaviors.map((b) => b.id);
    expect(ids).toContain('fall');
  });

  it('player template fall behavior references a named animation', () => {
    const player = getTemplate('player');
    const fall = player.behaviors.find((b) => b.id === 'fall');
    expect(fall).toBeDefined();
    expect(fall.animation).toBeTruthy();
  });

  it('player template has a fall animation definition', () => {
    const player = getTemplate('player');
    const fall = player.behaviors.find((b) => b.id === 'fall');
    const animName = fall?.animation;
    const animDef = player.animations.find((a) => a.name === animName);
    expect(animDef, `Missing animation definition for '${animName}'`).toBeDefined();
  });

  it('player template fall animation defaults to the same frameStart as jump (safe no-spritesheet default)', () => {
    const player = getTemplate('player');
    const jumpAnim = player.animations.find((a) => a.name === 'jump');
    const fallBeh  = player.behaviors.find((b) => b.id === 'fall');
    const fallAnim = player.animations.find((a) => a.name === fallBeh?.animation);
    expect(fallAnim).toBeDefined();
    // Default fall must point at the same frame as jump so unconfigured spritesheets
    // never show a transparent/out-of-bounds UV region.
    expect(fallAnim.frameStart).toBe(jumpAnim.frameStart);
  });

  // ── projectile template ────────────────────────────────────────────────────

  it('has a projectile template', () => {
    const types = getTemplateList().map((t) => t.type);
    expect(types).toContain('projectile');
  });

  it('projectile has PROJECTILE collision group', () => {
    const p = getTemplate('projectile');
    expect(p.collisionGroup).toBe(COLLISION_GROUP.PROJECTILE);
  });

  it('projectile masks against ENEMY and ENVIRONMENT', () => {
    const p = getTemplate('projectile');
    expect(p.collisionMask & COLLISION_GROUP.ENEMY).toBeTruthy();
    expect(p.collisionMask & COLLISION_GROUP.ENVIRONMENT).toBeTruthy();
  });

  it('projectile has expected default properties', () => {
    const p = getTemplate('projectile');
    expect(p.properties.width).toBeDefined();
    expect(p.properties.height).toBeDefined();
    expect(p.properties.speed).toBeDefined();
    expect(p.properties.damage).toBeDefined();
    expect(p.properties.lifetime).toBeDefined();
  });

  it('projectile has an idle behavior', () => {
    const p = getTemplate('projectile');
    const ids = p.behaviors.map((b) => b.id);
    expect(ids).toContain('idle');
  });
});
