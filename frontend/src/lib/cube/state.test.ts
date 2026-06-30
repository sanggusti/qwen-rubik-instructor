import { describe, it, expect } from 'vitest';
import { CubeMesh } from '../scene/cube';
import type { Axis } from '../scene/cube';
import { parseMove } from './moves';
import {
    solvedState,
    applyMove,
    isSolved,
    type State,
    type FaceKey
} from './state';

// --- Geometric reference model -------------------------------------------------
// The visual cube (CubeMesh + Cubelet, driven by the animator) is independently
// verified (see cubelets.test.ts / animator.test.ts). We derive a logical State
// from it and treat it as ground truth, so any divergence localizes a bug in the
// logical state machine (state.ts) rather than the renderer.

// Lattice position (x,y,z) of sticker index 0..8 on each face, using the same
// viewer-perspective layout as state.ts:  0 1 2 / 3 4 5 / 6 7 8.
const FACE_POS: Record<FaceKey, (i: number) => [number, number, number]> = {
    F: i => [(i % 3) - 1, 1 - Math.floor(i / 3), 1],
    B: i => [1 - (i % 3), 1 - Math.floor(i / 3), -1],
    U: i => [(i % 3) - 1, 1, Math.floor(i / 3) - 1],
    D: i => [(i % 3) - 1, -1, 1 - Math.floor(i / 3)],
    R: i => [1, 1 - Math.floor(i / 3), 1 - (i % 3)],
    L: i => [-1, 1 - Math.floor(i / 3), (i % 3) - 1]
};

// Which cubelet face slot points outward for each cube face.
const FACE_DIR: Record<FaceKey, 'up' | 'down' | 'left' | 'right' | 'front' | 'back'> = {
    U: 'up', D: 'down', L: 'left', R: 'right', F: 'front', B: 'back'
};

const FACES: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B'];

function addr(cube: CubeMesh, x: number, y: number, z: number) {
    const found = cube.cubies.find(c => {
        const cl = c.cubelet;
        return cl.addressX === x && cl.addressY === y && cl.addressZ === z;
    });
    if (!found) throw new Error(`no cubie at ${x},${y},${z}`);
    return found.cubelet;
}

// Read the logical State directly from the cubelet sticker orientations.
function deriveState(cube: CubeMesh): State {
    const s = solvedState();
    for (const f of FACES) {
        for (let i = 0; i < 9; i++) {
            const [x, y, z] = FACE_POS[f](i);
            const cl = addr(cube, x, y, z);
            const color = cl[FACE_DIR[f]].color;
            s[f][i] = color ?? f; // exterior stickers always have a color
        }
    }
    return s;
}

// Apply a single move to the cubelet model using the animator's authoritative
// geometric definition (parseMove), mirroring exactly what the renderer does.
function applyMoveGeo(cube: CubeMesh, name: string): void {
    const spec = parseMove(name);
    if (!spec) throw new Error(`bad move ${name}`);
    const axisAddr: Record<Axis, (c: { addressX: number; addressY: number; addressZ: number }) => number> = {
        x: c => c.addressX,
        y: c => c.addressY,
        z: c => c.addressZ
    };
    const pick = axisAddr[spec.axis];
    const affected = cube.cubies.filter(c => spec.slices.includes(pick(c.cubelet)));
    for (const c of affected) c.cubelet.rotate(spec.axis, spec.dir);
}

const SINGLE_MOVES = [
    'U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'",
    'M', "M'", 'E', "E'", 'S', "S'",
    'x', "x'", 'y', "y'", 'z', "z'"
];

// state.ts expands compound moves (M/E/S) into face turns + whole-cube rotations.
// The geo model applies the raw move. Compare them both as single steps.
function geoExpand(name: string): string[] {
    return [name];
}

describe('logical state matches the geometric (visual) cube — per single move', () => {
    it('solved state agrees', () => {
        const cube = new CubeMesh();
        expect(deriveState(cube)).toEqual(solvedState());
    });

    for (const move of SINGLE_MOVES) {
        it(`move "${move}" produces the same state as the cube`, () => {
            const cube = new CubeMesh();
            for (const m of geoExpand(move)) applyMoveGeo(cube, m);

            const logical = solvedState();
            applyMove(logical, move);

            expect(logical).toEqual(deriveState(cube));
        });
    }
});

describe('logical state matches the geometric cube — random sequences', () => {
    function seededRandom(seed: number): () => number {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 0xffffffff;
        };
    }

    it('200 random move sequences stay in sync', () => {
        const rnd = seededRandom(12345);
        for (let trial = 0; trial < 200; trial++) {
            const cube = new CubeMesh();
            const logical = solvedState();
            const len = 1 + Math.floor(rnd() * 25);
            for (let i = 0; i < len; i++) {
                const move = SINGLE_MOVES[Math.floor(rnd() * SINGLE_MOVES.length)];
                applyMoveGeo(cube, move);
                applyMove(logical, move);
            }
            expect(logical).toEqual(deriveState(cube));
        }
    });
});

describe('logical state — solved and restored conditions (the debugger desync)', () => {
    function invert(move: string): string {
        return move.endsWith("'") ? move.slice(0, -1) : move + "'";
    }

    it('every single move followed by its inverse returns to solved', () => {
        for (const move of SINGLE_MOVES) {
            const s = solvedState();
            applyMove(s, move);
            applyMove(s, invert(move));
            expect(isSolved(s)).toBe(true);
            expect(s).toEqual(solvedState());
        }
    });

    it('four repetitions of any single move return to solved', () => {
        for (const move of SINGLE_MOVES) {
            const s = solvedState();
            for (let i = 0; i < 4; i++) applyMove(s, move);
            expect(s).toEqual(solvedState());
        }
    });

    it('a long mixed sequence (all faces + slices) followed by its exact inverse is solved', () => {
        const seq = [
            'U', 'R', "F'", 'L', "D'", 'B', 'M', "E'", 'S',
            'U', "L'", 'F', 'R', "B'", 'D', "M'", 'E', "S'"
        ];
        const s = solvedState();
        for (const m of seq) applyMove(s, m);
        expect(isSolved(s)).toBe(false); // sanity: the scramble actually scrambles
        for (const m of [...seq].reverse().map(invert)) applyMove(s, m);
        expect(s).toEqual(solvedState());
        expect(isSolved(s)).toBe(true);
    });

    it('isSolved only accepts a truly solved cube (not just matching centers)', () => {
        const s = solvedState();
        applyMove(s, 'M'); // moves edges but leaves centers on their axes
        expect(isSolved(s)).toBe(false);
    });
});
