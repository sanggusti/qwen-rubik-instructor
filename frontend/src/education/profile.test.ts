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
  buildMemoryDigest,
  decayFactor,
  decayedWeight,
  isDueForReview,
  type StageStat,
  type UserProfile
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

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function stat(over: Partial<StageStat> & { stage: string }): StageStat {
  return {
    label: over.stage,
    attempts: 1,
    mistakes: 0,
    lastAt: new Date(NOW).toISOString(),
    mastered: false,
    ...over
  };
}

function saveStats(stats: StageStat[], sessions = 0): void {
  const performance: Record<string, StageStat> = {};
  for (const s of stats) performance[s.stage] = s;
  const profile: UserProfile = {
    level: 'newbie',
    method: 'lbl',
    sessionId: 's',
    history: Array.from({ length: sessions }, () => ({
      kind: 'lesson' as const,
      method: 'lbl' as const,
      stages: 1,
      at: 'now'
    })),
    performance
  };
  saveProfile(profile, store);
}

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

describe('decay & forgetting', () => {
  it('decayFactor halves every half-life and is 1 at zero age', () => {
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(14 * DAY)).toBeCloseTo(0.5, 5);
    expect(decayFactor(28 * DAY)).toBeCloseTo(0.25, 5);
  });

  it('fades a struggle weight by how long ago it was last hit', () => {
    const recent = stat({ stage: 'a', mistakes: 8, lastAt: daysAgo(0) });
    const old = stat({ stage: 'b', mistakes: 8, lastAt: daysAgo(14) });
    expect(decayedWeight(recent, NOW)).toBeCloseTo(8, 5);
    expect(decayedWeight(old, NOW)).toBeCloseTo(4, 5);
  });

  it('forgets a struggle whose faded weight drops below the threshold', () => {
    saveStats([
      stat({ stage: 'recent', label: 'Recent', mistakes: 4, lastAt: daysAgo(0) }),
      stat({ stage: 'ancient', label: 'Ancient', mistakes: 2, lastAt: daysAgo(60) })
    ]);
    const digest = buildMemoryDigest(loadProfile(store), { now: NOW });
    const stages = digest.struggles.map((s) => s.stage);
    expect(stages).toContain('recent');
    expect(stages).not.toContain('ancient'); // decayed below FORGET_THRESHOLD
  });

  it('ranks a context-matching struggle first even with lower raw weight', () => {
    saveStats([
      stat({ stage: 'big', label: 'Big', mistakes: 9, lastAt: daysAgo(0) }),
      stat({ stage: 'cross', label: 'Cross', mistakes: 3, lastAt: daysAgo(0) })
    ]);
    const digest = buildMemoryDigest(loadProfile(store), { now: NOW, context: 'cross' });
    expect(digest.struggles[0].stage).toBe('cross');
  });

  it('surfaces stale mastered skills as due for review', () => {
    saveStats([
      stat({ stage: 'fresh', label: 'Fresh', mastered: true, lastAt: daysAgo(1) }),
      stat({ stage: 'stale', label: 'Stale', mastered: true, lastAt: daysAgo(30) })
    ]);
    expect(isDueForReview(stat({ stage: 'stale', mastered: true, lastAt: daysAgo(30) }), NOW)).toBe(true);
    const digest = buildMemoryDigest(loadProfile(store), { now: NOW });
    expect(digest.dueForReview).toContain('Stale');
    expect(digest.dueForReview).not.toContain('Fresh');
  });

  it('bounds the mastered list so a long history fits the context window', () => {
    saveStats(
      Array.from({ length: 9 }, (_, i) =>
        stat({ stage: `m${i}`, label: `M${i}`, mastered: true, lastAt: daysAgo(i) })
      )
    );
    const digest = buildMemoryDigest(loadProfile(store), { now: NOW });
    expect(digest.mastered.length).toBe(6); // MAX_MASTERED
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
