import { describe, it, expect, beforeEach } from 'vitest';
import { ScreenManager } from '../../src/ui/ScreenManager.js';

describe('ScreenManager', () => {
  let sm;
  let entered;
  let exited;

  beforeEach(() => {
    entered = [];
    exited = [];
    sm = new ScreenManager();

    sm.register('menu', {
      enter: () => entered.push('menu'),
      exit: () => exited.push('menu'),
    });
    sm.register('editor', {
      enter: () => entered.push('editor'),
      exit: () => exited.push('editor'),
    });
    sm.register('play', {
      enter: () => entered.push('play'),
      exit: () => exited.push('play'),
    });
  });

  it('starts with no active screen', () => {
    expect(sm.active).toBe(null);
  });

  it('switches to a registered screen', () => {
    sm.switchTo('menu');
    expect(sm.active).toBe('menu');
    expect(entered).toEqual(['menu']);
  });

  it('exits current screen when switching', () => {
    sm.switchTo('menu');
    sm.switchTo('editor');
    expect(exited).toEqual(['menu']);
    expect(entered).toEqual(['menu', 'editor']);
    expect(sm.active).toBe('editor');
  });

  it('does nothing when switching to the same screen', () => {
    sm.switchTo('menu');
    sm.switchTo('menu');
    expect(entered).toEqual(['menu']);
    expect(exited).toEqual([]);
  });

  it('throws for unknown screen', () => {
    expect(() => sm.switchTo('nonexistent')).toThrow();
  });

  it('passes data to enter callback', () => {
    const received = [];
    sm.register('levelSelect', {
      enter: (data) => received.push(data),
      exit: () => {},
    });
    sm.switchTo('levelSelect', { foo: 'bar' });
    expect(received).toEqual([{ foo: 'bar' }]);
  });

  it('tracks history for back navigation', () => {
    sm.switchTo('menu');
    sm.switchTo('editor');
    sm.switchTo('play');
    sm.back();
    expect(sm.active).toBe('editor');
    sm.back();
    expect(sm.active).toBe('menu');
  });

  it('back does nothing at root', () => {
    sm.switchTo('menu');
    sm.back();
    expect(sm.active).toBe('menu');
  });
});
