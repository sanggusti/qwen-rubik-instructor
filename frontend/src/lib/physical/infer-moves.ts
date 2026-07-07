// Guided-tracking comparisons (docs §6): the app always KNOWS the state the
// physical cube should be in (the mirror), so verification is subset
// equality — no inference. Inference exists only to EXPLAIN a small
// deviation ("check me / I'm lost"): a BFS of depth <= 2 from the predicted
// state, ranked by a beginner error model, over the faces actually observed.

import { applyMove, cloneState, invertMove } from '../cube/state';
import type { FaceKey, State } from '../cube/state';
import { canonicalizeCenters } from './legality';
import type { FaceScan } from './types';

// 12 face quarter-turns + 6 slice moves. Whole-cube rotations are invisible
// to center-canonical comparisons by design (a reorientation is not a
// deviation), so they are not part of the alphabet.
const ALPHABET = [
  'U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'",
  'M', "M'", 'E', "E'", 'S', "S'"
];

/** Do the observed faces match `expected` (canonicalized) exactly? */
export function verifySubset(observed: FaceScan[], expected: State): boolean {
  const canon = canonicalizeCenters(expected);
  if (!canon) return false;
  return observed.every((scan) => scan.cells.every((c, i) => canon[scan.face][i] === c));
}

/** Which stickers differ, for highlighting on the mirror/grid. */
export function subsetDiff(
  observed: FaceScan[],
  expected: State
): { face: FaceKey; index: number }[] {
  const canon = canonicalizeCenters(expected);
  if (!canon) return [];
  const out: { face: FaceKey; index: number }[] = [];
  for (const scan of observed) {
    scan.cells.forEach((c, i) => {
      if (canon[scan.face][i] !== c) out.push({ face: scan.face, index: i });
    });
  }
  return out;
}

export interface Explanation {
  /** The extra moves the learner appears to have made from the predicted state. */
  moves: string[];
  /** How to get back: the inverse sequence, ready to display. */
  undo: string[];
}

// Beginner error model: how plausible is this deviation? Lower = likelier.
function errorScore(seq: string[], expectedNext: string[]): number {
  const next = expectedNext[0];
  if (seq.length === 1) {
    const m = seq[0];
    if (next && m === invertMove(next)) return 0; // did the next move backwards
    if (next && m[0] === next[0]) return 1; // right face, wrong direction/extra
    if (m[0] === 'U') return 2; // stray U turn (most common fidget)
    return 3;
  }
  // Two-move deviations: prefer ones that start like a plausible single.
  return 4 + errorScore([seq[0]], expectedNext);
}

/**
 * Explain how the physical cube (as observed) deviates from the predicted
 * state. Returns [] moves when the observation matches (no deviation), the
 * best-ranked explanation of depth <= 2, or null when nothing within depth 2
 * fits — the caller escalates to the repair ladder.
 */
export function explainDiff(
  observed: FaceScan[],
  predicted: State,
  expectedNext: string[] = []
): Explanation | null {
  const canon = canonicalizeCenters(predicted);
  if (!canon) return null;
  if (verifySubset(observed, canon)) return { moves: [], undo: [] };

  const matches: string[][] = [];
  for (const m1 of ALPHABET) {
    const s1 = cloneState(canon);
    applyMove(s1, m1);
    if (verifySubset(observed, s1)) {
      matches.push([m1]);
      continue; // a depth-2 extension of a match is redundant
    }
    for (const m2 of ALPHABET) {
      if (m2 === invertMove(m1)) continue; // cancels out
      const s2 = cloneState(s1);
      applyMove(s2, m2);
      if (verifySubset(observed, s2)) matches.push([m1, m2]);
    }
  }
  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      a.length - b.length || errorScore(a, expectedNext) - errorScore(b, expectedNext)
  );
  const best = matches[0];
  return { moves: best, undo: [...best].reverse().map(invertMove) };
}
