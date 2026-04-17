import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsStore, SETTINGS_DEFAULTS } from '../../src/settings/SettingsStore.js';

class MockStorage {
  constructor() { this._map = new Map(); }
  getItem(k) { return this._map.get(k) ?? null; }
  setItem(k, v) { this._map.set(k, v); }
  removeItem(k) { this._map.delete(k); }
  clear() { this._map.clear(); }
}

describe('SettingsStore', () => {
  let storage;
  let store;

  beforeEach(() => {
    storage = new MockStorage();
    store = new SettingsStore(storage);
  });

  it('returns default sfxVolume when storage is empty', () => {
    expect(store.get('sfxVolume')).toBe(SETTINGS_DEFAULTS.sfxVolume);
  });

  it('returns default musicVolume when storage is empty', () => {
    expect(store.get('musicVolume')).toBe(SETTINGS_DEFAULTS.musicVolume);
  });

  it('returns default keyBindings when storage is empty', () => {
    const kb = store.get('keyBindings');
    expect(kb.jump).toBe(SETTINGS_DEFAULTS.keyBindings.jump);
    expect(kb.moveLeft).toBe(SETTINGS_DEFAULTS.keyBindings.moveLeft);
  });

  it('returns default gamepadBindings when storage is empty', () => {
    const gb = store.get('gamepadBindings');
    expect(gb.jump).toEqual(SETTINGS_DEFAULTS.gamepadBindings.jump);
    expect(gb.moveLeft).toEqual(SETTINGS_DEFAULTS.gamepadBindings.moveLeft);
  });

  it('set() persists a scalar value across instances', () => {
    store.set('sfxVolume', 0.3);
    const store2 = new SettingsStore(storage);
    expect(store2.get('sfxVolume')).toBeCloseTo(0.3);
  });

  it('set() updates value immediately on the same instance', () => {
    store.set('musicVolume', 0.25);
    expect(store.get('musicVolume')).toBeCloseTo(0.25);
  });

  it('getAll() returns a deep clone', () => {
    const all = store.getAll();
    all.sfxVolume = 999;
    expect(store.get('sfxVolume')).toBe(SETTINGS_DEFAULTS.sfxVolume);
  });

  it('reset() restores defaults', () => {
    store.set('sfxVolume', 0.0);
    store.set('musicVolume', 0.0);
    store.reset();
    expect(store.get('sfxVolume')).toBe(SETTINGS_DEFAULTS.sfxVolume);
    expect(store.get('musicVolume')).toBe(SETTINGS_DEFAULTS.musicVolume);
  });

  it('merges saved data with defaults on construction', () => {
    storage.setItem('sock_climber_settings', JSON.stringify({ sfxVolume: 0.1 }));
    const store2 = new SettingsStore(storage);
    // saved value overriding
    expect(store2.get('sfxVolume')).toBeCloseTo(0.1);
    // default still present for unset key
    expect(store2.get('musicVolume')).toBe(SETTINGS_DEFAULTS.musicVolume);
  });

  it('falls back to defaults when storage contains invalid JSON', () => {
    storage.setItem('sock_climber_settings', 'NOT_JSON');
    const store2 = new SettingsStore(storage);
    expect(store2.get('sfxVolume')).toBe(SETTINGS_DEFAULTS.sfxVolume);
  });

  it('works with null storage (no persistence)', () => {
    const s = new SettingsStore(null);
    s.set('sfxVolume', 0.5);
    expect(s.get('sfxVolume')).toBeCloseTo(0.5);
  });
});
