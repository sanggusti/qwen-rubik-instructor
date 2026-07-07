// Compiles a captured solve walkthrough into the data the /review canvas
// scrolls through: one flat move sequence for the scrubber plus per-section
// move ranges (scramble → checkpoints → solved) with the original narration.
// Pure and defensive: every move is validated and the whole sequence is
// replayed from solved — a capture that doesn't land solved compiles to null
// so the page shows its empty state instead of a broken scrub.

import { applyMove, isSolved, solvedState } from '../cube/state';
import type { Beat } from '../education/walkthrough';

export interface ReviewSection {
    kind: 'scramble' | 'checkpoint' | 'solved';
    title: string;
    narration: string;
    moves: string[];
    /** Range into fullSequence: [startIndex, endIndex). */
    startIndex: number;
    endIndex: number;
}

export interface CompiledReview {
    fullSequence: string[];
    sections: ReviewSection[];
    solvedAtEnd: boolean;
}

// Same alphabet the live cube accepts (stores/cube.svelte.ts VALID_MOVE).
const VALID_MOVE = /^([UDLRFBMESxyz])('?)$/;

// Pretty names for the LBL solver stage ids carried on Beat.stage.
const STAGE_LABELS: Record<string, string> = {
    cross: 'First-layer cross',
    'first-layer-corners': 'First-layer corners',
    'middle-layer': 'Middle layer',
    'last-layer-cross': 'Last-layer cross',
    'll-corner-position': 'Position the last corners',
    'll-corner-orientation': 'Orient the last corners',
    'last-layer-edges': 'Last-layer edges'
};

function titleFor(beat: Beat, checkpointNumber: number): string {
    if (beat.stage && STAGE_LABELS[beat.stage]) return STAGE_LABELS[beat.stage];
    if (beat.stage) {
        const words = beat.stage.replace(/-/g, ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return `Checkpoint ${checkpointNumber}`;
}

export function compileReview(beats: Beat[]): CompiledReview | null {
    if (beats.length < 2) return null;
    const scrambleMoves = beats[0].moves ?? [];
    if (scrambleMoves.length === 0) return null;
    for (const beat of beats) {
        if ((beat.moves ?? []).some((m) => !VALID_MOVE.test(m))) return null;
    }

    const fullSequence: string[] = [];
    const sections: ReviewSection[] = [];

    const pushSection = (kind: ReviewSection['kind'], title: string, narration: string, moves: string[]) => {
        const startIndex = fullSequence.length;
        fullSequence.push(...moves);
        sections.push({ kind, title, narration, moves, startIndex, endIndex: fullSequence.length });
    };

    pushSection('scramble', 'The scramble', beats[0].text, scrambleMoves);

    // A zero-move beat is pure narration; its text rides along with the next
    // checkpoint so no move range ever sits behind an unreachable section.
    let pendingNarration = '';
    let checkpointNumber = 0;
    for (const beat of beats.slice(1)) {
        const moves = beat.moves ?? [];
        if (moves.length === 0) {
            pendingNarration = pendingNarration ? `${pendingNarration} ${beat.text}` : beat.text;
            continue;
        }
        checkpointNumber += 1;
        const narration = pendingNarration ? `${pendingNarration} ${beat.text}` : beat.text;
        pendingNarration = '';
        pushSection('checkpoint', titleFor(beat, checkpointNumber), narration, moves);
    }
    if (checkpointNumber === 0) return null;

    pushSection('solved', 'Solved', pendingNarration, []);

const state = solvedState();
for (const move of fullSequence) applyMove(state, move);

const solvedAtEnd = isSolved(state);
if (!solvedAtEnd) return null;

return { fullSequence, sections, solvedAtEnd };
}
