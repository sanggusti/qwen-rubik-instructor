import { describe, it, expect } from 'vitest';
import { recommendNext, reasonText, masteryBlocker } from './recommendation';
import { LESSON_CATALOG } from './lesson_catalog';
import type { StageStat, UserProfile } from './profile';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

function stat(over: Partial<StageStat> & { stage: string }): StageStat {
  return {
    label: over.stage,
    attempts: 1,
    mistakes: 0,
    lastAt: daysAgo(0),
    mastered: false,
    ...over
  };
}

function profileWith(perf: Record<string, StageStat>): UserProfile {
  return { level: 'newbie', method: 'lbl', sessionId: 's', history: [], performance: perf };
}

// The first two beginner lessons (no solver stage → keyed by id).
const FIRST = 'beginner-notation';
const SECOND = 'beginner-first-trigger';

describe('recommendNext', () => {
  it('recommends the first lesson for a brand-new learner', () => {
    const rec = recommendNext(profileWith({}), LESSON_CATALOG, NOW);
    expect(rec?.lesson.id).toBe(FIRST);
    expect(rec?.reason).toBe('continue');
  });

  it('recommends revisiting an attempted-but-unmastered lesson', () => {
    const rec = recommendNext(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 3, mastered: false }) }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.lesson.id).toBe(FIRST);
    expect(rec?.reason).toBe('practice');
  });

  it('moves forward once the current lesson is mastered', () => {
    const rec = recommendNext(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 0, mastered: true, lastAt: daysAgo(1) }) }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.lesson.id).toBe(SECOND);
    expect(rec?.reason).toBe('continue');
  });

  it('recommends a refresh when a mastered skill goes stale', () => {
    const rec = recommendNext(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 0, mastered: true, lastAt: daysAgo(30) }) }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.lesson.id).toBe(FIRST);
    expect(rec?.reason).toBe('review');
  });

  it('does not recommend a locked lesson on the gated path', () => {
    // Nothing attempted → only the first lesson is unlocked, so that's the pick.
    const rec = recommendNext(profileWith({}), LESSON_CATALOG, NOW);
    expect(rec?.lesson.id).toBe(FIRST);
  });

  // --- mastery before progression ---

  it('prefers the earliest unmastered lesson over a later, higher-mistake one', () => {
    const rec = recommendNext(
      profileWith({
        [FIRST]: stat({ stage: FIRST, mistakes: 2, mastered: false }),
        [SECOND]: stat({ stage: SECOND, mistakes: 9, mastered: false })
      }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.lesson.id).toBe(FIRST); // master in path order, not by biggest struggle
    expect(rec?.reason).toBe('practice');
  });

  it('never advances to a new lesson while an earlier one is unmastered', () => {
    // FIRST attempted-but-unmastered unlocks SECOND, but SECOND must not be
    // recommended as "continue" while FIRST is still unmastered.
    const rec = recommendNext(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 3, mastered: false }) }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.lesson.id).toBe(FIRST);
    expect(rec?.reason).toBe('practice');
  });

  it('only progresses or reviews once everything attempted is mastered', () => {
    // FIRST mastered & stale → review wins over progressing to SECOND.
    const rec = recommendNext(
      profileWith({
        [FIRST]: stat({ stage: FIRST, mistakes: 0, mastered: true, lastAt: daysAgo(30) })
      }),
      LESSON_CATALOG,
      NOW
    );
    expect(rec?.reason).toBe('review');
  });
});

describe('masteryBlocker', () => {
  it('flags the earlier unmastered lesson when skipping ahead', () => {
    const blocker = masteryBlocker(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 2, mastered: false }) }),
      LESSON_CATALOG,
      SECOND
    );
    expect(blocker?.id).toBe(FIRST);
  });

  it('does not block selecting the earliest unmastered lesson itself', () => {
    const blocker = masteryBlocker(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 2, mastered: false }) }),
      LESSON_CATALOG,
      FIRST
    );
    expect(blocker).toBeNull();
  });

  it('does not block when earlier lessons are mastered', () => {
    const blocker = masteryBlocker(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 0, mastered: true }) }),
      LESSON_CATALOG,
      SECOND
    );
    expect(blocker).toBeNull();
  });

  it('never blocks lessons off the gated path', () => {
    const blocker = masteryBlocker(
      profileWith({ [FIRST]: stat({ stage: FIRST, mistakes: 2, mastered: false }) }),
      LESSON_CATALOG,
      'time-right-hand-trigger'
    );
    expect(blocker).toBeNull();
  });
});

describe('reasonText', () => {
  it('maps each reason to a short human label', () => {
    expect(reasonText('practice')).toMatch(/revisit/i);
    expect(reasonText('review')).toMatch(/refresh/i);
    expect(reasonText('continue')).toMatch(/continue/i);
  });
});
