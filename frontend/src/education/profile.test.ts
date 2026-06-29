import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageLike } from './lesson_progress';
import {
  loadProfile,
  saveProfile,
  setLevel,
  appendHistory,
  deriveMethod,
  nextLevel,
  recordStageResult,
  buildMemoryDigest
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
    saveProfile(
      { level: 'advanced', method: 'cfop', sessionId: 's', history: [], performance: {} },
      store
    );
    store.setItem('rubik-profile', '{not json');
    const p = loadProfile(store);
    expect(p.level).toBe('newbie'); // falls back cleanly
  });

  it('defaults to an empty performance map', () => {
    expect(loadProfile(store).performance).toEqual({});
  });
});

describe('performance', () => {
  it('accumulates attempts, mistakes, and best time per stage', () => {
    recordStageResult({ stage: 'cross', label: 'Cross', mistakes: 3, durationMs: 8000 }, store);
    recordStageResult({ stage: 'cross', label: 'Cross', mistakes: 1, durationMs: 5000 }, store);
    const stat = loadProfile(store).performance['cross'];
    expect(stat.attempts).toBe(2);
    expect(stat.mistakes).toBe(4); // cumulative
    expect(stat.bestMs).toBe(5000); // fastest
    expect(stat.label).toBe('Cross');
  });

  it('marks a stage mastered only when completed cleanly', () => {
    recordStageResult({ stage: 'sune', mistakes: 4 }, store);
    expect(loadProfile(store).performance['sune'].mastered).toBe(false);
    recordStageResult({ stage: 'sune', mistakes: 0 }, store);
    expect(loadProfile(store).performance['sune'].mastered).toBe(true);
    // Stays mastered even after a later sloppy attempt.
    recordStageResult({ stage: 'sune', mistakes: 9 }, store);
    expect(loadProfile(store).performance['sune'].mastered).toBe(true);
  });

  it('survives a reload', () => {
    recordStageResult({ stage: 'middle', mistakes: 2, durationMs: 1000 }, store);
    const reloaded = loadProfile(store);
    expect(reloaded.performance['middle'].mistakes).toBe(2);
    expect(reloaded.performance['middle'].bestMs).toBe(1000);
  });
});

describe('buildMemoryDigest', () => {
  it('surfaces top struggles and mastered stages compactly', () => {
    recordStageResult({ stage: 'cross', label: 'Cross', mistakes: 0 }, store); // mastered
    recordStageResult({ stage: 'middle', label: 'Middle layer', mistakes: 6 }, store);
    recordStageResult({ stage: 'll-cross', label: 'Yellow cross', mistakes: 2 }, store);
    appendHistory({ kind: 'lesson', method: 'lbl', stages: 5, at: 'now' }, store);

    const digest = buildMemoryDigest(loadProfile(store));
    expect(digest.level).toBe('newbie');
    expect(digest.sessions).toBe(1);
    expect(digest.lastKind).toBe('lesson');
    expect(digest.mastered).toContain('Cross');
    // Struggles sorted by mistakes desc, mastered stages excluded.
    expect(digest.struggles.map((s) => s.label)).toEqual(['Middle layer', 'Yellow cross']);
  });
});
