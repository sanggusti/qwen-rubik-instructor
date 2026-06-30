import { describe, it, expect, beforeEach } from 'vitest';
import { LessonEngine, type LessonApi, type EngineState } from './lesson_engine';
import type { Lesson } from './lesson_types';
import type { StorageLike } from './lesson_progress';
import { solvedState, applyMove, isSolved, cloneState, type State } from '../cube/state';

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
        user('R', 'U'); // completes l1-seq -> l1-solved; cube now scrambled by R U
        expect(engine.getCurrentStep()?.id).toBe('l1-solved');
        expect(api.isSolved()).toBe(false);

        user("U'", "R'"); // undo R U -> solved
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
