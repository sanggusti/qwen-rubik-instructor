// Canonical (axis, slice(s), direction) table for every move name in the
// cube's notation. `animator.ts` uses this to resolve a move name to the
// cubies/axis it turns; `drag-controls.ts` uses the derived `moveFromAxisSlice`
// reverse lookup to turn a drag gesture back into a move name. This keeps both
// in sync from one source instead of two hand-maintained copies of the table.
// Direction convention: +1 = clockwise looking from +axis toward the origin.

export type Axis = 'x' | 'y' | 'z';

export interface MoveSpec {
  axis: Axis;
  // Which logical slices (-1, 0, 1) this move rotates.
  slices: number[];
  // Direction multiplier: +1 = clockwise looking from +axis toward origin.
  dir: 1 | -1;
}

// Mapping for base moves (no prime). Prime is handled by parseMove (multiply dir by -1).
export const BASE_MOVES: Record<string, MoveSpec> = {
  // Face turns. CW looking from outside the named face.
  // U: top layer, viewed from +Y => CW around +Y => dir +1.
  U: { axis: 'y', slices: [1], dir: 1 },
  D: { axis: 'y', slices: [-1], dir: -1 },
  R: { axis: 'x', slices: [1], dir: 1 },
  L: { axis: 'x', slices: [-1], dir: -1 },
  F: { axis: 'z', slices: [1], dir: 1 },
  B: { axis: 'z', slices: [-1], dir: -1 },
  // Slice turns: middle layer. M follows L (dir matches L), E follows D, S follows F.
  M: { axis: 'x', slices: [0], dir: -1 },
  E: { axis: 'y', slices: [0], dir: -1 },
  S: { axis: 'z', slices: [0], dir: 1 },
  // Whole-cube rotations.
  x: { axis: 'x', slices: [-1, 0, 1], dir: 1 },
  y: { axis: 'y', slices: [-1, 0, 1], dir: 1 },
  z: { axis: 'z', slices: [-1, 0, 1], dir: 1 }
};

export function parseMove(move: string): MoveSpec | null {
  const prime = move.endsWith("'");
  const base = prime ? move.slice(0, -1) : move;
  const spec = BASE_MOVES[base];
  if (!spec) return null;
  return { axis: spec.axis, slices: spec.slices, dir: (prime ? -spec.dir : spec.dir) as 1 | -1 };
}

// Reverse lookup for single-slice moves (face turns + M/E/S), derived from
// BASE_MOVES so it can't drift out of sync with the animator's canonical table.
const SLICE_TO_MOVE: Record<Axis, Record<number, { name: string; baseDir: 1 | -1 }>> = {
  x: {}, y: {}, z: {}
};
for (const [name, spec] of Object.entries(BASE_MOVES)) {
  if (spec.slices.length !== 1) continue;
  SLICE_TO_MOVE[spec.axis][spec.slices[0]] = { name, baseDir: spec.dir };
}

// Map (axis, slice, dir) -> move name. dir convention matches MoveAnimator (CW from +axis).
export function moveFromAxisSlice(axis: Axis, slice: number, dir: 1 | -1): string | null {
  const entry = SLICE_TO_MOVE[axis][slice];
  if (!entry) return null;
  return dir === entry.baseDir ? entry.name : entry.name + "'";
}
