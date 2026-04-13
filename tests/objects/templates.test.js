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
});
