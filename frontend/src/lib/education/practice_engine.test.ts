import { describe, it, expect } from 'vitest';
import { PracticeEngine, type PracticeApi, type PracticeState, type PracticeView } from './practice_engine';
import type { Drill } from './practice_types';
import type { StorageLike } from './lesson_progress';
import { solvedState, applyMove, isSolved, cloneState, type State } from '../cube/state';

function fakeStorage(): StorageLike {
    const map = new Map<string, string>();
    return {
        getItem: (k) => (map.has(k) ? map.get(k)! : null),
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k)
    };
}

function loadPerf(storage: StorageLike, stage: string) {
    return JSON.parse(storage.getItem('rubik-profile') ?? '{}').performance?.[stage];
}

// A fake cube API backed by the real logical state. applyMoves mutates the
// state and fires onMove for each accepted move, mirroring window.rubikInstructor.
function fakeApi() {
    let state: State = solvedState();
    const subs = new Set<(move: string, s: State) => void>();
    const api: PracticeApi = {
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
    return { api, user: (...moves: string[]) => api.applyMoves(moves) };
}

const DRILLS: Drill[] = [
    {
        id: 'sexy',
        title: 'Sexy',
        category: 'trigger',
        difficulty: 'easy',
        prompt: 'p',
        expectedMoves: ['R', 'U', "R'", "U'"],
        rounds: 2,
        validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
    },
    {
        id: 'solve',
        title: 'Solve',
        category: 'solve',
        difficulty: 'easy',
        prompt: 'p',
        setupMoves: ['R'],
        expectedMoves: ["R'"],
        rounds: 1,
        validator: { type: 'cubeSolved' }
    }
];

function latest(engine: PracticeEngine): PracticeState {
    let state!: PracticeState;
    const off = engine.subscribe((s) => { state = s; });
    off();
    return state;
}

// Narrowing helper: asserts a drill is selected and returns the active view.
function active(engine: PracticeEngine): PracticeView {
    const state = latest(engine);
    if (state.drill === null) throw new Error('expected an active drill');
    return state;
}

describe('PracticeEngine', () => {
    it('starts with no drill selected', () => {
        const { api } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        expect(latest(engine).drill).toBeNull();
    });

    it('selects a drill and exposes its round count', () => {
        const { api } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');
        const state = active(engine);
        expect(state.drill.id).toBe('sexy');
        expect(state.roundCount).toBe(2);
        expect(state.completed).toBe(false);
    });

    it('completes a single-round sequence and scores it', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, [{ ...DRILLS[0], rounds: 1 }]);
        engine.selectDrill('sexy');
        user('R', 'U', "R'", "U'");
        const state = active(engine);
        expect(state.completed).toBe(true);
        expect(state.score).toBe(1);
    });

    it('advances rounds and completes after all rounds', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');

        user('R', 'U', "R'", "U'");
        let state = active(engine);
        expect(state.completed).toBe(false);
        expect(state.round).toBe(1);
        expect(state.score).toBe(1);

        user('R', 'U', "R'", "U'");
        state = active(engine);
        expect(state.completed).toBe(true);
        expect(state.score).toBe(2);
    });

    it('gives deterministic feedback on a wrong move', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');
        user('R', 'D');
        const state = active(engine);
        expect(state.evaluation.status).toBe('wrong');
        expect(state.evaluation.message).toContain('U');
        expect(state.evaluation.message).toContain('D');
    });

    it('clears the wrong feedback when the user restarts the sequence', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');
        user('R', 'D', 'R', 'U');
        const state = active(engine);
        expect(state.evaluation.status).not.toBe('wrong');
    });

    it('does not count setup moves as attempts', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        // Selecting the solve drill applies setup move R (scramble). The user
        // solves with R'; only that move should count toward completion.
        engine.selectDrill('solve');
        user("R'");
        const state = active(engine);
        expect(state.completed).toBe(true);
        expect(state.score).toBe(1);
    });

    it('resets a drill back to round zero', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');
        user('R', 'U', "R'", "U'");
        expect(active(engine).round).toBe(1);

        engine.resetDrill();
        const state = active(engine);
        expect(state.round).toBe(0);
        expect(state.score).toBe(0);
        expect(state.completed).toBe(false);
    });

    it('stops processing cube moves after dispose', () => {
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS);
        engine.selectDrill('sexy');
        engine.dispose();
        // Moves after dispose are ignored; the drill stays at round zero.
        user('R', 'U', "R'", "U'");
        const state = active(engine);
        expect(state.completed).toBe(false);
        expect(state.round).toBe(0);
    });
});

describe('PracticeEngine timing', () => {
    it('times across rounds from the first move to final completion', () => {
        let t = 1000;
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS, () => t);
        engine.selectDrill('sexy'); // rounds: 2, no setup
        user('R', 'U', "R'", "U'"); // round 1 — first move starts the clock at t=1000
        t = 5000;
        user('R', 'U', "R'", "U'"); // round 2 completes at t=5000
        const s = latest(engine);
        if (s.drill === null) throw new Error('expected a drill');
        expect(s.completed).toBe(true);
        expect(s.startedAt).toBe(1000);
        expect(s.solveMs).toBe(4000);
    });

    it('resets the clock when the drill is reset', () => {
        let t = 1000;
        const { api, user } = fakeApi();
        const engine = new PracticeEngine(api, DRILLS, () => t);
        engine.selectDrill('sexy');
        user('R'); // starts clock
        engine.resetDrill();
        const s = latest(engine);
        if (s.drill === null) throw new Error('expected a drill');
        expect(s.startedAt).toBeNull();
        expect(s.solveMs).toBeNull();
    });
});

describe('PracticeEngine performance signals', () => {
    it('records a clean completion as mastered', () => {
        const { api, user } = fakeApi();
        const store = fakeStorage();
        const engine = new PracticeEngine(api, [{ ...DRILLS[0], rounds: 1 }], () => 2000, store);
        engine.selectDrill('sexy');
        user('R', 'U', "R'", "U'");
        const perf = loadPerf(store, 'sexy');
        expect(perf.attempts).toBe(1);
        expect(perf.mastered).toBe(true);
    });

    it('counts wrong moves as mistakes', () => {
        const { api, user } = fakeApi();
        const store = fakeStorage();
        const engine = new PracticeEngine(api, [{ ...DRILLS[0], rounds: 1 }], () => 2000, store);
        engine.selectDrill('sexy');
        user('D', 'D'); // two off-track moves
        user('R', 'U', "R'", "U'"); // restart and complete
        const perf = loadPerf(store, 'sexy');
        expect(perf.mistakes).toBeGreaterThanOrEqual(2);
        expect(perf.mastered).toBe(false);
    });
});
