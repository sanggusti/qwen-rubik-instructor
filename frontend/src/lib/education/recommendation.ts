// What the memory is *for*: turning the learner's accumulated stats into a single
// next-step decision. Pure and framework-free so it's testable without a DOM.
//
// Policy: MASTERY IS THE PRIORITY, not a hard wall. `recommendNext` always points
// the learner at the *first* unmastered lesson on the path (walk it in order);
// only once everything attempted is mastered does it refresh a stale skill (spaced
// repetition) and then move forward to the next new lesson. The learner can still
// choose a small win and skip ahead — `masteryBlocker` (below) lets the UI ask
// "finish this first?" before they do. Uses the same due-for-review signal as the
// memory digest (profile.ts).

import type { Lesson } from './lesson_types';
import { loadProfile, isDueForReview, type UserProfile, type StageStat } from './profile';
import { LESSON_CATALOG } from './lesson_catalog';

export type RecommendReason = 'practice' | 'review' | 'continue';

export interface Recommendation {
    lesson: Lesson;
    reason: RecommendReason;
}

// Performance is keyed by solver stage when a lesson maps onto one, else its id
// (matches lesson_engine.recordCompletion and the lessons_panel gating).
function stageKey(lesson: Lesson): string {
    return lesson.stage ?? lesson.id;
}

function ageMs(stat: StageStat, now: number): number {
    const t = Date.parse(stat.lastAt);
    return Number.isNaN(t) ? 0 : Math.max(0, now - t);
}

// Walks the gated beginner path (first lesson open; each next opens once the
// previous has been attempted) and returns the single most useful next lesson.
export function recommendNext(
    profile: UserProfile = loadProfile(),
    lessons: Lesson[] = LESSON_CATALOG,
    now: number = Date.now()
): Recommendation | null {
    const beginner = lessons.filter((l) => l.track === 'beginner' && !l.generated);
    const perf = profile.performance;

    let prevDone = true; // the first lesson is always unlocked
    let firstUnmastered: Lesson | null = null; // earliest attempted-but-unmastered lesson
    let review: { lesson: Lesson; age: number } | null = null;
    let nextNew: Lesson | null = null;

    for (const lesson of beginner) {
        const unlocked = prevDone;
        const stat = perf[stageKey(lesson)];
        const attempted = (stat?.attempts ?? 0) > 0;

        if (unlocked && stat) {
            if (!stat.mastered) {
                // First (earliest) unmastered lesson on the path wins — master in order.
                if (!firstUnmastered) firstUnmastered = lesson;
            } else if (isDueForReview(stat, now)) {
                const age = ageMs(stat, now);
                if (!review || age > review.age) review = { lesson, age };
            }
        }
        if (unlocked && !attempted && !nextNew) nextNew = lesson;

        prevDone = attempted;
    }

    if (firstUnmastered) return { lesson: firstUnmastered, reason: 'practice' };
    if (review) return { lesson: review.lesson, reason: 'review' };
    if (nextNew) return { lesson: nextNew, reason: 'continue' };
    return null;
}

// Mastery is the *priority*, not a hard wall: the learner can always choose a
// small win and move on. If selecting `lessonId` would skip past an earlier
// unmastered lesson on the path, return that earlier lesson so the UI can ask
// "finish this first?" before letting them continue. Null when nothing's being
// skipped (the pick is the recommended one, an earlier lesson, or off the path).
export function masteryBlocker(
    profile: UserProfile,
    lessons: Lesson[],
    lessonId: string
): Lesson | null {
    const beginner = lessons.filter((l) => l.track === 'beginner' && !l.generated);
    const targetIndex = beginner.findIndex((l) => l.id === lessonId);
    if (targetIndex < 0) return null; // not on the gated path (generated / time-improvement)
    for (let i = 0; i < targetIndex; i++) {
        const stat = profile.performance[stageKey(beginner[i])];
        if (stat && !stat.mastered) return beginner[i];
    }
    return null;
}

// Short, human label for the recommendation's reason — used in the UI.
export function reasonText(reason: RecommendReason): string {
    switch (reason) {
        case 'practice':
            return 'revisit — you stumbled here before';
        case 'review':
            return 'due for a refresh';
        case 'continue':
            return 'continue your path';
    }
}
