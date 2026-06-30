import { describe, it, expect } from 'vitest';
import { CubeMesh } from './cube';
import { MoveAnimator } from './animator';

// Drive the animator's frame loop until its queue drains. Each move needs two
// update() ticks (one to begin, one past durationMs to finish), so we advance
// the clock well beyond durationMs each step.
function runToIdle(animator: MoveAnimator): void {
    let now = 0;
    for (let i = 0; i < 100000 && animator.isBusy(); i++) {
        now += 10000;
        animator.update(now);
    }
    if (animator.isBusy()) throw new Error('animator did not reach idle');
}

// A path-independent fingerprint of the cube: each cubelet's identity mapped to
// its current lattice position and face-color string. Equal snapshots => same
// physical configuration.
function snapshot(cube: CubeMesh): Map<number, string> {
    const m = new Map<number, string>();
    for (const c of cube.cubies) {
        const { addressX, addressY, addressZ } = c.cubelet;
        m.set(c.cubelet.id, `${addressX},${addressY},${addressZ}|${c.cubelet.colors}`);
    }
    return m;
}

function invert(move: string): string {
    return move.endsWith("'") ? move.slice(0, -1) : move + "'";
}

function setup(): { cube: CubeMesh; animator: MoveAnimator } {
    const cube = new CubeMesh();
    const animator = new MoveAnimator(cube, cube.root, 1);
    return { cube, animator };
}

describe('MoveAnimator — batched sequences resolve cubies at execution time', () => {
    it('a multi-axis sequence followed by its inverse returns to solved (batched enqueue)', () => {
        const { cube, animator } = setup();
        const solved = snapshot(cube);

        const seq = ['R', 'U', 'F', 'L', 'D', 'B'];
        const inverse = [...seq].reverse().map(invert);

        // Enqueue everything up front — this is exactly what scramble does, and what
        // used to corrupt the cube when cubies were snapshotted at enqueue time.
        for (const m of [...seq, ...inverse]) animator.enqueue(m);
        runToIdle(animator);

        expect(snapshot(cube)).toEqual(solved);
    });

    it('four identical quarter turns of a face return to solved (batched)', () => {
        const { cube, animator } = setup();
        const solved = snapshot(cube);

        for (const m of ['R', 'R', 'R', 'R']) animator.enqueue(m);
        runToIdle(animator);

        expect(snapshot(cube)).toEqual(solved);
    });

    it('the second move in a batch acts on the post-first-move layer, not the stale one', () => {
        const { cube, animator } = setup();

        // R then U enqueued together. After R, the cubie that started at (1,1,1)
        // moves to (1,1,-1)... the point is U must rotate whatever is actually in the
        // top layer now. We verify by comparing the batched result against running the
        // same two moves one-at-a-time (which was never affected by the bug).
        for (const m of ['R', 'U']) animator.enqueue(m);
        runToIdle(animator);
        const batched = snapshot(cube);

        const ref = setup();
        ref.animator.enqueue('R');
        runToIdle(ref.animator);
        ref.animator.enqueue('U');
        runToIdle(ref.animator);
        const sequential = snapshot(ref.cube);

        expect(batched).toEqual(sequential);
    });

    it('rejects invalid move names at enqueue time', () => {
        const { animator } = setup();
        expect(animator.enqueue('Q')).toBe(false);
        expect(animator.enqueue('R')).toBe(true);
    });
});
