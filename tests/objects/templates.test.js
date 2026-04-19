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
});
