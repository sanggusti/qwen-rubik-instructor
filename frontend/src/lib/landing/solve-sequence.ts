// The landing page's protagonist sequence — captured from the REAL backend
// solver (backend/pipeline/solver, layer-by-layer) on 2026-07-02:
//   solved cube → SCRAMBLE applied → solve(state) → SOLUTION (166 moves).
// Replay was verified solved in Python at capture time and is re-verified in
// solve-sequence.test.ts against the frontend's own logical cube.
// Stage lengths, for reference: cross 21, first-layer-corners 24,
// middle-layer 37, last-layer-cross 5, ll-corner-position 11,
// ll-corner-orientation 15, last-layer-edges 53.

export const SCRAMBLE: string[] = ['R', 'F', "L'", "U'", 'B', 'D', "R'", "F'"];

export const SOLUTION: string[] = [
  'D', 'B', "D'", "L'", "L'", "B'", "B'", 'E', "R'", "E'", 'R', "B'", 'M', "D'",
  "M'", 'D', 'B', "M'", "U'", 'M', 'U', 'D', "B'", "D'", "B'", "B'", "D'", 'B',
  'D', 'B', 'B', 'L', "B'", "L'", "B'", "B'", 'D', "B'", "B'", "D'", 'B', 'B',
  "L'", 'B', 'L', "B'", "L'", 'B', 'L', 'B', 'D', "B'", "B'", "D'", "B'", "L'",
  'B', 'L', 'B', "D'", 'B', 'D', 'B', 'R', "B'", "R'", "B'", "B'", "R'", 'B',
  'R', 'B', 'U', "B'", "U'", "B'", 'L', "B'", "L'", "B'", "U'", 'B', "R'", "B'",
  'R', 'B', 'U', 'L', 'B', "L'", "U'", "B'", 'U', 'L', "B'", "L'", "B'", "B'",
  "R'", "B'", 'R', "B'", "R'", "B'", "B'", 'R', 'R', 'B', "R'", 'B', 'R', "B'",
  "B'", 'R', "B'", "U'", 'D', "R'", "R'", 'U', "D'", "B'", "R'", "R'", "D'",
  "D'", "B'", "R'", 'L', "D'", "D'", 'R', "L'", "B'", "B'", "R'", 'L', "D'",
  "D'", 'R', "L'", "B'", "D'", "D'", 'R', 'U', 'D', 'S', 'D', 'D', 'S', 'S',
  'D', 'B', 'B', "D'", "S'", "S'", 'D', 'D', "S'", "D'", 'B', 'B', "U'", "R'"
];

export const FULL_SEQUENCE: string[] = [...SCRAMBLE, ...SOLUTION];
