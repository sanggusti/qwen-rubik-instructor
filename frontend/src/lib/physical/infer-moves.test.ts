import { describe, expect, it } from 'vitest';
import { applyMove, cloneState, solvedState } from '../cube/state';
import type { FaceKey, State } from '../cube/state';
import { explainDiff, subsetDiff, verifySubset } from './infer-moves';
import { canonicalizeCenters } from './legality';
import type { FaceScan } from './types';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACE_MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
function scrambled(seed: number): State {
  const rnd = mulberry32(seed);
  const s = solvedState();
  for (let i = 0; i < 25; i++) applyMove(s, FACE_MOVES[Math.floor(rnd() * FACE_MOVES.length)]);
  return s;
}

/** Fake a perfect observation of `faces` from a state. */
function observe(state: State, faces: FaceKey[]): FaceScan[] {
  return faces.map((face) => ({
    face,
    cells: [...state[face]],
    confidence: Array(9).fill(1)
  }));
}

describe('verifySubset', () => {
  it('passes when the observed faces match', () => {
    const s = scrambled(1);
    expect(verifySubset(observe(s, ['F', 'U']), s)).toBe(true);
  });

  it('fails when a move was made', () => {
    const s = scrambled(2);
    const moved = cloneState(s);
    applyMove(moved, 'R');
    // R changes F and U stickers, so observing F+U catches it.
    expect(verifySubset(observe(moved, ['F', 'U']), s)).toBe(false);
    expect(subsetDiff(observe(moved, ['F', 'U']), s).length).toBeGreaterThan(0);
  });

  it('is blind to whole-cube reorientation (by design)', () => {
    const s = scrambled(3);
    const rotated = cloneState(s);
    applyMove(rotated, 'y');
    // Canonicalization makes the rotated prediction equal the original frame.
    expect(verifySubset(observe(s, ['F', 'U']), rotated)).toBe(true);
  });
});

describe('explainDiff', () => {
  it('returns empty moves when nothing deviates', () => {
    const s = scrambled(4);
    const res = explainDiff(observe(s, ['F', 'U']), s);
    expect(res).toEqual({ moves: [], undo: [] });
  });

  it('explains an inverted next move and ranks it first', () => {
    const s = scrambled(5);
    const real = cloneState(s);
    applyMove(real, "R'"); // the learner did R' where R was expected
    const res = explainDiff(observe(real, ['F', 'U', 'R']), s, ['R', 'U']);
    expect(res).not.toBeNull();
    expect(res!.moves).toEqual(["R'"]);
    expect(res!.undo).toEqual(['R']);
  });

  it('explains a stray extra U turn', () => {
    const s = scrambled(6);
    const real = cloneState(s);
    applyMove(real, 'U');
    const res = explainDiff(observe(real, ['F', 'U', 'L']), s, ['F']);
    expect(res).not.toBeNull();
    // Applying the explanation to the prediction must match the observation.
    const check = cloneState(s);
    for (const m of res!.moves) applyMove(check, m);
    expect(verifySubset(observe(real, ['F', 'U', 'L']), check)).toBe(true);
  });

  it('explains a two-move deviation', () => {
    const s = scrambled(7);
    const real = cloneState(s);
    applyMove(real, 'R');
    applyMove(real, 'U');
    const res = explainDiff(observe(real, ['F', 'U', 'R', 'B']), s, []);
    expect(res).not.toBeNull();
    expect(res!.moves.length).toBeLessThanOrEqual(2);
    const check = cloneState(s);
    for (const m of res!.moves) applyMove(check, m);
    expect(verifySubset(observe(real, ['F', 'U', 'R', 'B']), check)).toBe(true);
  });

  it('explains a slice-move deviation', () => {
    const s = scrambled(8);
    const real = cloneState(s);
    applyMove(real, 'M');
    // A slice displaces centers; a real scan is center-canonical because the
    // camera identifies faces by their centers — model that here.
    const observedState = canonicalizeCenters(real)!;
    const res = explainDiff(observe(observedState, ['F', 'U']), s, []);
    expect(res).not.toBeNull();
    const check = cloneState(s);
    for (const m of res!.moves) applyMove(check, m);
    expect(verifySubset(observe(observedState, ['F', 'U']), check)).toBe(true);
  });

  it('gives up beyond depth 2 (repair ladder takes over)', () => {
    const s = scrambled(9);
    const real = cloneState(s);
    for (const m of ['R', 'U', 'F']) applyMove(real, m);
    // Observing many faces makes a shallow coincidental match unlikely.
    const res = explainDiff(observe(real, ['F', 'U', 'R', 'B', 'L', 'D']), s, []);
    expect(res).toBeNull();
  });
});
