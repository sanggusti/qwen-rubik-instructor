import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageLike } from './lesson_progress';
import {
  loadProfile,
  saveProfile,
  setLevel,
  appendHistory,
  deriveMethod,
  nextLevel
} from './profile';

// In-memory StorageLike so the profile is testable without a DOM.
function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
}

let store: StorageLike;
beforeEach(() => { store = fakeStorage(); });

describe('profile', () => {
  it('defaults to a newbie/lbl profile with a session id', () => {
    const p = loadProfile(store);
    expect(p.level).toBe('newbie');
    expect(p.method).toBe('lbl');
    expect(p.sessionId).toBeTruthy();
    expect(p.history).toEqual([]);
  });

  it('derives method from level', () => {
    expect(deriveMethod('newbie')).toBe('lbl');
    expect(deriveMethod('intermediate')).toBe('cfop');
    expect(deriveMethod('advanced')).toBe('cfop');
  });

  it('setLevel persists level and updates method', () => {
    setLevel('intermediate', store);
    const p = loadProfile(store);
    expect(p.level).toBe('intermediate');
    expect(p.method).toBe('cfop');
  });

  it('keeps a stable session id across loads', () => {
    const a = loadProfile(store);
    const b = loadProfile(store);
    expect(b.sessionId).toBe(a.sessionId);
  });

  it('appends history capped at 10 entries', () => {
    for (let i = 0; i < 13; i++) {
      appendHistory({ kind: 'walkthrough', method: 'lbl', stages: i, at: 'now' }, store);
    }
    const p = loadProfile(store);
    expect(p.history).toHaveLength(10);
    expect(p.history[p.history.length - 1].stages).toBe(12);
  });

  it('cycles levels', () => {
    expect(nextLevel('newbie')).toBe('intermediate');
    expect(nextLevel('intermediate')).toBe('advanced');
    expect(nextLevel('advanced')).toBe('newbie');
  });

  it('recovers from corrupt storage', () => {
    saveProfile({ level: 'advanced', method: 'cfop', sessionId: 's', history: [] }, store);
    store.setItem('rubik-profile', '{not json');
    const p = loadProfile(store);
    expect(p.level).toBe('newbie'); // falls back cleanly
  });
});
