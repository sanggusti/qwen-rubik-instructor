import { describe, expect, it } from 'vitest';

import { SCRAMBLE, SOLUTION } from '../landing/solve-sequence';
import type { Beat } from '../education/walkthrough';
import { compileReview } from './compile';

// Stage lengths documented in landing/solve-sequence.ts for its captured solve.
const STAGES: { stage: string; len: number }[] = [
    { stage: 'cross', len: 21 },
    { stage: 'first-layer-corners', len: 24 },
    { stage: 'middle-layer', len: 37 },
    { stage: 'last-layer-cross', len: 5 },
    { stage: 'll-corner-position', len: 11 },
    { stage: 'll-corner-orientation', len: 15 },
    { stage: 'last-layer-edges', len: 53 }
];

function solveBeats(): Beat[] {
    const beats: Beat[] = [
        { text: 'Here is the scramble.', moves: [...SCRAMBLE], pace: 'fast' }
    ];
    let offset = 0;
    for (const { stage, len } of STAGES) {
        beats.push({
            text: `Narration for ${stage}.`,
            moves: SOLUTION.slice(offset, offset + len),
            stage
        });
        offset += len;
    }
    expect(offset).toBe(SOLUTION.length);
    return beats;
}

describe('compileReview', () => {
    it('compiles a real captured solve into scramble → checkpoints → solved', () => {
        const compiled = compileReview(solveBeats());
        expect(compiled).not.toBeNull();
        expect(compiled!.fullSequence).toEqual([...SCRAMBLE, ...SOLUTION]);
        expect(compiled!.solvedAtEnd).toBe(true);

        const kinds = compiled!.sections.map((s) => s.kind);
        expect(kinds).toEqual([
            'scramble',
            ...STAGES.map(() => 'checkpoint' as const),
            'solved'
        ]);
        expect(compiled!.sections[1].title).toBe('First-layer cross');
        expect(compiled!.sections[1].narration).toBe('Narration for cross.');
    });

    it('keeps section move ranges contiguous over the full sequence', () => {
        const compiled = compileReview(solveBeats())!;
        let cursor = 0;
        for (const section of compiled.sections) {
            expect(section.startIndex).toBe(cursor);
            expect(section.endIndex - section.startIndex).toBe(section.moves.length);
            expect(compiled.fullSequence.slice(section.startIndex, section.endIndex)).toEqual(
                section.moves
            );
            cursor = section.endIndex;
        }
        expect(cursor).toBe(compiled.fullSequence.length);
        const solved = compiled.sections[compiled.sections.length - 1];
        expect(solved.startIndex).toBe(solved.endIndex);
    });

    it('folds zero-move narration beats into the next checkpoint', () => {
        const beats = solveBeats();
        beats.splice(1, 0, { text: 'A word before we start.', moves: [] });
        const compiled = compileReview(beats)!;
        expect(compiled.sections[1].narration).toBe(
            'A word before we start. Narration for cross.'
        );
        expect(compiled.fullSequence).toEqual([...SCRAMBLE, ...SOLUTION]);
    });

    it('carries trailing narration onto the solved section', () => {
        const beats = solveBeats();
        beats.push({ text: 'You did it!', moves: [] });
        const compiled = compileReview(beats)!;
        expect(compiled.sections[compiled.sections.length - 1].narration).toBe('You did it!');
    });

    it('falls back to Checkpoint N titles without stage ids', () => {
        const beats = solveBeats().map((b) => ({ ...b, stage: undefined }));
        const compiled = compileReview(beats)!;
        expect(compiled.sections[1].title).toBe('Checkpoint 1');
        expect(compiled.sections[2].title).toBe('Checkpoint 2');
    });

    it('reports an unsolved end honestly', () => {
        const beats = solveBeats();
        beats[beats.length - 1] = {
            ...beats[beats.length - 1],
            moves: beats[beats.length - 1].moves!.slice(0, -1)
        };
        expect(compileReview(beats)).toBeNull();
    });

    it('rejects invalid input shapes', () => {
        expect(compileReview([])).toBeNull();
        expect(compileReview([{ text: 'only one beat', moves: ['R'] }])).toBeNull();
        // No scramble moves on beat 0.
        expect(
            compileReview([
                { text: 'no scramble', moves: [] },
                { text: 'stage', moves: ['R'] }
            ])
        ).toBeNull();
        // Doubles are not in the live cube's move alphabet.
        expect(
            compileReview([
                { text: 'scramble', moves: ['R2'] },
                { text: 'stage', moves: ['R'] }
            ])
        ).toBeNull();
        // Narration-only stages with no moves anywhere.
        expect(
            compileReview([
                { text: 'scramble', moves: ['R'] },
                { text: 'nothing to do', moves: [] }
            ])
        ).toBeNull();
    });
});
