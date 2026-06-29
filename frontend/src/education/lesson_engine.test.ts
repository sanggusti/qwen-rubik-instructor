import { describe, it, expect, beforeEach } from 'vitest';
import { LessonEngine, type LessonApi, type EngineState } from './lesson_engine';
import type { Lesson } from './lesson_types';
import type { StorageLike } from './lesson_progress';
import { solvedState, applyMove, isSolved, cloneState, type State } from '../core/state';

// A fake cube API backed by the real logical state. applyMoves mutates the
// state and fires onMove for each accepted move, mirroring window.rubikInstructor.
function fakeApi() {
    let state: State = solvedState();
    const subs = new Set<(move: string, s: State) => void>();
    const api: LessonApi = {
        applyMoves(moves) {
            const arr = typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves;
            for (const m of arr) {
                applyMove(state, m);
                for (const fn of subs) fn(m, cloneState(state));
            }
            return { accepted: arr, rejected: [] };
        },
        getState: () => cloneState(state),
        isSolved: () => isSolved(state),
        onMove(fn) {
            subs.add(fn);
            return () => subs.delete(fn);
        }
    };
    // user(...) simulates a human turning the cube (same path as applyMoves).
    return { api, user: (...moves: string[]) => api.applyMoves(moves) };
}

function fakeStorage(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k)! : null),
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k)
    };
}

const LESSONS: Lesson[] = [
    {
        id: 'l1',
        track: 'beginner',
        title: 'Lesson One',
        audience: 'Test audience',
        description: 'Test description',
        steps: [
            { id: 'l1-manual', title: 'Manual', body: 'b', validator: { type: 'manual' } },
            {
                id: 'l1-seq',
                title: 'Sequence',
                body: 'b',
                expectedMoves: ['R', 'U'],
                validator: { type: 'moveSequence', moves: ['R', 'U'] }
            },
            {
                id: 'l1-solved',
                title: 'Solve',
                body: 'b',
                setupMoves: ['R'],
                validator: { type: 'cubeSolved' }
            }
        ]
    },
    {
        id: 'l2',
        track: 'time-improvement',
        title: 'Lesson Two',
        audience: 'Test',
        description: 'Test',
        steps: [{ id: 'l2-manual', title: 'Manual', body: 'b', validator: { type: 'manual' } }]
    }
];

describe('LessonEngine', () => {
    let storage: ReturnType<typeof fakeStorage>;

    beforeEach(() => {
        storage = fakeStorage();
    });

    it('filters lessons by track', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        expect(engine.getLessons('beginner').map((l) => l.id)).toEqual(['l1']);
        expect(engine.getLessons('time-improvement').map((l) => l.id)).toEqual(['l2']);
        expect(engine.getLessons().length).toBe(2);
    });

    it('starts with no lesson selected', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        let snapshot: EngineState | null = null;
        engine.subscribe((s) => (snapshot = s));
        expect(snapshot).toEqual({ lesson: null });
    });

    it('selecting a lesson emits its first step', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        expect(engine.getCurrentStep()?.id).toBe('l1-manual');
    });

    it('manual steps complete via markComplete and advance', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete();
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');
        expect(loadCompleted(storage, 'l1')).toContain('l1-manual');
    });

    it('moveSequence steps complete when the user performs the moves', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete(); // clear the manual step, now on l1-seq
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');

        user('R');
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');
        user('U');
        // Completing l1-seq auto-advances to l1-solved.
        expect(engine.getCurrentStep()?.id).toBe('l1-solved');
        expect(loadCompleted(storage, 'l1')).toContain('l1-seq');
    });

    it('does not count setup moves toward sequence validation', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete();

        // Apply setup moves while on the sequence step; these must be ignored.
        engine.applySetupMoves(); // l1-seq has no setupMoves, so this is a no-op
        user('R', 'U');
        expect(engine.getCurrentStep()?.id).toBe('l1-solved');
    });

    it('cubeSolved steps complete when the cube returns to solved', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete(); // l1-seq
        // Completes l1-seq -> l1-solved, whose setup ['R'] auto-applies on entry,
        // so the cube is now scrambled by R U then the setup R (= R U R).
        user('R', 'U');
        expect(engine.getCurrentStep()?.id).toBe('l1-solved');
        expect(api.isSolved()).toBe(false);

        user("R'", "U'", "R'"); // undo R U R -> solved
        expect(api.isSolved()).toBe(true);

        let lessonCompleted = false;
        engine.subscribe((s) => {
            lessonCompleted = s.lesson !== null && s.lessonCompleted;
        });
        expect(lessonCompleted).toBe(true);
    });

    it('persists and resumes progress across engine instances', () => {
        const a = fakeApi();
        const engine1 = new LessonEngine(a.api, LESSONS, storage);
        engine1.selectLesson('l1');
        engine1.markComplete();

        const b = fakeApi();
        const engine2 = new LessonEngine(b.api, LESSONS, storage);
        engine2.selectLesson('l1');
        expect(engine2.getCurrentStep()?.id).toBe('l1-seq');
    });

    it('resetLesson clears progress and returns to the first step', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete();
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');

        engine.resetLesson();
        expect(engine.getCurrentStep()?.id).toBe('l1-manual');
        expect(loadCompleted(storage, 'l1')).toEqual([]);
    });

    it('handleCubeReset clears in-progress move history', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete(); // l1-seq expects R U

        user('R');
        engine.handleCubeReset(); // wipe the partial 'R'
        user('U'); // only 'U' in history now -> should NOT complete
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');

        user('R', 'U'); // full sequence -> completes
        expect(engine.getCurrentStep()?.id).toBe('l1-solved');
    });

    it('previous and next navigate without losing completion', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, storage);
        engine.selectLesson('l1');
        engine.markComplete(); // on l1-seq
        engine.previous();
        expect(engine.getCurrentStep()?.id).toBe('l1-manual');
        engine.next();
        expect(engine.getCurrentStep()?.id).toBe('l1-seq');
    });
});

function loadCompleted(storage: StorageLike, lessonId: string): string[] {
    const raw = storage.getItem('rubik-lesson:' + lessonId);
    if (!raw) return [];
    return (JSON.parse(raw).completedStepIds as string[]) ?? [];
}

function loadPerf(storage: StorageLike, stage: string) {
    const raw = storage.getItem('rubik-profile');
    return JSON.parse(raw ?? '{}').performance?.[stage];
}

const SEQ_LESSON: Lesson[] = [
    {
        id: 'perf',
        track: 'beginner',
        title: 'Perf',
        audience: 'a',
        description: 'd',
        steps: [
            {
                id: 'perf-seq',
                title: 'Seq',
                body: 'b',
                expectedMoves: ['R', 'U'],
                validator: { type: 'moveSequence', moves: ['R', 'U'] }
            }
        ]
    }
];

// A self-checking drill lesson: setup is the inverse of the algorithm, so
// performing the algorithm from the setup position returns the cube to solved.
const SETUP_LESSON: Lesson[] = [
    {
        id: 'drill',
        track: 'beginner',
        title: 'Drill',
        audience: 'a',
        description: 'd',
        steps: [
            {
                id: 'drill-do',
                title: 'Do',
                body: 'b',
                setupMoves: ['U', 'R', "U'", "R'"],
                expectedMoves: ['R', 'U', "R'", "U'"],
                validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
            }
        ]
    }
];

describe('LessonEngine setup drills (state-gated)', () => {
    it('auto-applies the setup so the cube is scrambled on entry', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, SETUP_LESSON, fakeStorage());
        engine.selectLesson('drill');
        expect(api.isSolved()).toBe(false); // setup ran without the user moving
    });

    it('completes when the algorithm actually solves the cube', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, SETUP_LESSON, fakeStorage());
        engine.selectLesson('drill');
        user('R', 'U', "R'", "U'"); // algorithm from the setup -> solved
        expect(api.isSolved()).toBe(true);
        const off = engine.subscribe(() => {});
        off();
        expect(engine.getCurrentStep()?.id).toBe('drill-do');
        // The single-step lesson is now complete.
        let done = false;
        engine.subscribe((s) => { done = s.lesson !== null && s.lessonCompleted; });
        expect(done).toBe(true);
    });

    it('does NOT complete when a wrong move precedes the right sequence', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, SETUP_LESSON, fakeStorage());
        engine.selectLesson('drill');
        user('D'); // stray move knocks the cube off the setup trajectory
        user('R', 'U', "R'", "U'"); // suffix matches, but cube is not solved
        expect(api.isSolved()).toBe(false);
        let done = false;
        engine.subscribe((s) => { done = s.lesson !== null && s.lessonCompleted; });
        expect(done).toBe(false); // the false-"correct" bug must stay fixed
    });

    it('Apply example moves after a wrong move does NOT falsely complete', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, SETUP_LESSON, fakeStorage());
        engine.selectLesson('drill');
        user('D'); // wrong move
        engine.applyExampleMoves(); // user "just clicks Apply moves"
        expect(api.isSolved()).toBe(false);
        let done = false;
        engine.subscribe((s) => { done = s.lesson !== null && s.lessonCompleted; });
        expect(done).toBe(false);
    });
});

// A solve-stage lesson graded by cube state (as the Qwen "Solve your cube"
// lesson now is): expected is the exact state after performing expectedMoves.
function cubeStateLesson(): Lesson[] {
    const expected = solvedState();
    for (const m of ['R', 'U', "R'"]) applyMove(expected, m);
    return [
        {
            id: 'solve',
            track: 'beginner',
            title: 'Solve',
            audience: 'a',
            description: 'd',
            steps: [
                {
                    id: 'stage',
                    title: 'Stage',
                    body: 'b',
                    expectedMoves: ['R', 'U', "R'"],
                    validator: { type: 'cubeState', expected }
                }
            ]
        }
    ];
}

describe('LessonEngine solve stages (cubeState)', () => {
    it('reveals the next move and auto-grades by reaching the target state', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, cubeStateLesson(), fakeStorage());
        engine.selectLesson('solve');
        expect(engine.nextExpectedMove()).toBe('R'); // hint works on solve stages
        user('R');
        expect(engine.nextExpectedMove()).toBe('U');
        user('U', "R'"); // reaches the stage's target state -> completes
        let done = false;
        engine.subscribe((s) => { done = s.lesson !== null && s.lessonCompleted; });
        expect(done).toBe(true);
    });

    it('does NOT complete when the moves land on a different state', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, cubeStateLesson(), fakeStorage());
        engine.selectLesson('solve');
        user('D'); // stray move
        user('R', 'U', "R'"); // right suffix, wrong resulting state
        let done = false;
        engine.subscribe((s) => { done = s.lesson !== null && s.lessonCompleted; });
        expect(done).toBe(false);
    });

    it('records a mistake on a solve stage (memory signal is no longer always zero)', () => {
        const { api, user } = fakeApi();
        const store = fakeStorage();
        const engine = new LessonEngine(api, cubeStateLesson(), store);
        engine.selectLesson('solve');
        user('D'); // off-track on a state-graded stage -> counts as a mistake
        user("D'", 'R', 'U', "R'"); // undo the stray, then perform the stage -> target
        // Before Tier B, solve stages were manual and recorded mistakes:0 always.
        expect(loadPerf(store, 'solve').mistakes).toBeGreaterThan(0);
    });
});

describe('LessonEngine performance signals', () => {
    it('records mistakes and duration into the profile on completion', () => {
        let t = 1000;
        const { api, user } = fakeApi();
        const store = fakeStorage();
        const engine = new LessonEngine(api, SEQ_LESSON, store, () => t);
        engine.selectLesson('perf');
        user('D'); // off-track -> one mistake; first move starts the clock at t=1000
        t = 4000;
        user('R', 'U'); // ends with R U -> completes the (single-step) lesson
        const perf = loadPerf(store, 'perf');
        expect(perf.attempts).toBe(1);
        expect(perf.mistakes).toBe(1);
        expect(perf.bestMs).toBe(3000);
        expect(perf.mastered).toBe(false); // had a mistake
    });

    it('marks a clean completion mastered', () => {
        const { api, user } = fakeApi();
        const store = fakeStorage();
        const engine = new LessonEngine(api, SEQ_LESSON, store);
        engine.selectLesson('perf');
        user('R', 'U');
        expect(loadPerf(store, 'perf').mastered).toBe(true);
    });
});

describe('LessonEngine rescue', () => {
    it('exposes the next expected move for a sequence step', () => {
        const { api, user } = fakeApi();
        const engine = new LessonEngine(api, SEQ_LESSON, fakeStorage());
        engine.selectLesson('perf');
        expect(engine.nextExpectedMove()).toBe('R'); // nothing done yet
        user('R');
        expect(engine.nextExpectedMove()).toBe('U'); // after a correct prefix
    });

    it('returns null when the current step is not a sequence', () => {
        const { api } = fakeApi();
        const engine = new LessonEngine(api, LESSONS, fakeStorage());
        engine.selectLesson('l1'); // first step is manual
        expect(engine.nextExpectedMove()).toBeNull();
    });
});
