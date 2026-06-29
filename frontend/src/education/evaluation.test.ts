import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluation';
import { solvedState, applyMove, cloneState, type State } from '../core/state';
import type { Drill } from './practice_types';

function seqDrill(moves: string[]): Drill {
    return {
        id: 'seq',
        title: 'Seq',
        category: 'trigger',
        difficulty: 'easy',
        prompt: 'p',
        validator: { type: 'moveSequence', moves }
    };
}

const solveDrill: Drill = {
    id: 'solve',
    title: 'Solve',
    category: 'solve',
    difficulty: 'easy',
    prompt: 'p',
    validator: { type: 'cubeSolved' }
};

function scrambled(...moves: string[]): State {
    const s = solvedState();
    for (const m of moves) applyMove(s, m);
    return s;
}

describe('evaluation (moveSequence)', () => {
    const state = solvedState();

    it('is idle before any move', () => {
        const result = evaluate(seqDrill(['R', 'U']), [], state);
        expect(result.status).toBe('idle');
    });

    it('reports progress with the next move while on track', () => {
        const result = evaluate(seqDrill(['R', 'U', "R'"]), ['R'], state);
        expect(result.status).toBe('progress');
        expect(result.message).toContain('U');
    });

    it('marks correct when the history ends with the sequence', () => {
        const result = evaluate(seqDrill(['R', 'U']), ['R', 'U'], state);
        expect(result.status).toBe('correct');
    });

    it('marks correct even with leading extra moves (tail match)', () => {
        const result = evaluate(seqDrill(['R', 'U']), ['D', 'R', 'U'], state);
        expect(result.status).toBe('correct');
    });

    it('flags a wrong move with expected and actual', () => {
        const result = evaluate(seqDrill(['R', 'U']), ['R', 'D'], state);
        expect(result.status).toBe('wrong');
        expect(result.message).toContain('U');
        expect(result.message).toContain('D');
    });

    it('clears the wrong state once the user restarts correctly', () => {
        const result = evaluate(seqDrill(['R', 'U']), ['R', 'D', 'R'], state);
        expect(result.status).toBe('progress');
        expect(result.message).toContain('U');
    });
});

describe('evaluation (moveSequence with setup)', () => {
    function setupSeqDrill(setupMoves: string[], moves: string[]): Drill {
        return { ...seqDrill(moves), setupMoves };
    }

    it('marks correct only when the right moves also leave the cube solved', () => {
        const drill = setupSeqDrill(['U', 'R', "U'", "R'"], ['R', 'U', "R'", "U'"]);
        const solved = scrambled('U', 'R', "U'", "R'", 'R', 'U', "R'", "U'"); // back to solved
        expect(evaluate(drill, ['R', 'U', "R'", "U'"], solved).status).toBe('correct');
    });

    it('rejects the right move suffix on a cube knocked off-track', () => {
        const drill = setupSeqDrill(['U', 'R', "U'", "R'"], ['R', 'U', "R'", "U'"]);
        const off = scrambled('U', 'R', "U'", "R'", 'D', 'R', 'U', "R'", "U'");
        const result = evaluate(drill, ['D', 'R', 'U', "R'", "U'"], off);
        expect(result.status).toBe('wrong');
        expect(result.message).toContain('isn’t solved');
    });
});

describe('evaluation (cubeSolved)', () => {
    it('marks correct when the cube is solved', () => {
        const result = evaluate(solveDrill, ['x'], solvedState());
        expect(result.status).toBe('correct');
    });

    it('reports progress while the cube is unsolved', () => {
        const result = evaluate(solveDrill, ['R'], cloneState(scrambled('R')));
        expect(result.status).toBe('progress');
    });
});
