// Logical Rubik's cube state, decoupled from Three.js.
// Faces: U(up), D(down), L(left), R(right), F(front), B(back).
// Each face is a flat array of 9 sticker colors (same letter as its solved face).
// Sticker indices, from the viewer's perspective looking at that face:
//   0 1 2
//   3 4 5
//   6 7 8

export type FaceKey = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Color = FaceKey;

export type State = Record<FaceKey, Color[]>;

export function solvedState(): State {
  const mk = (c: Color): Color[] => Array(9).fill(c);
  return { U: mk('U'), D: mk('D'), L: mk('L'), R: mk('R'), F: mk('F'), B: mk('B') };
}

function rotateFaceCW(face: Color[]): Color[] {
  const f = face;
  return [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
}
function rotateFaceCCW(face: Color[]): Color[] {
  const f = face;
  return [f[2], f[5], f[8], f[1], f[4], f[7], f[0], f[3], f[6]];
}

// A "cycle" describes which (face, indices) move where for a CW quarter turn of a face layer.
// Each entry: 4 ordered groups of stickers; each turn shifts group i -> group i+1 (mod 4).
type Cycle = Array<[FaceKey, number[]]>;

const CYCLES: Record<FaceKey, Cycle> = {
  U: [
    ['F', [0, 1, 2]],
    ['L', [0, 1, 2]],
    ['B', [0, 1, 2]],
    ['R', [0, 1, 2]]
  ],
  D: [
    ['F', [6, 7, 8]],
    ['R', [6, 7, 8]],
    ['B', [6, 7, 8]],
    ['L', [6, 7, 8]]
  ],
  R: [
    ['U', [2, 5, 8]],
    ['B', [6, 3, 0]],
    ['D', [2, 5, 8]],
    ['F', [2, 5, 8]]
  ],
  L: [
    ['U', [0, 3, 6]],
    ['F', [0, 3, 6]],
    ['D', [0, 3, 6]],
    ['B', [8, 5, 2]]
  ],
  F: [
    ['U', [6, 7, 8]],
    ['R', [0, 3, 6]],
    ['D', [2, 1, 0]],
    ['L', [8, 5, 2]]
  ],
  B: [
    ['U', [2, 1, 0]],
    ['L', [0, 3, 6]],
    ['D', [6, 7, 8]],
    ['R', [8, 5, 2]]
  ]
};

function applyFaceTurn(state: State, face: FaceKey, prime: boolean): void {
  // The turned face's own stickers rotate opposite to the array-index sense:
  // a non-prime turn maps new[6] = old[0] in viewer indexing, which is rotateFaceCCW.
  state[face] = prime ? rotateFaceCW(state[face]) : rotateFaceCCW(state[face]);
  const cycle = CYCLES[face];
  const order = prime ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const groups = order.map(i => cycle[i]);
  const tmp = groups[0][1].map(idx => state[groups[0][0]][idx]);
  for (let i = 0; i < 3; i++) {
    const [fromFace, fromIdx] = groups[i + 1];
    const [toFace, toIdx] = groups[i];
    for (let k = 0; k < 3; k++) state[toFace][toIdx[k]] = state[fromFace][fromIdx[k]];
  }
  const [lastFace, lastIdx] = groups[3];
  for (let k = 0; k < 3; k++) state[lastFace][lastIdx[k]] = tmp[k];
}

// Slice moves expressed via face turns + whole-cube rotation. All three layers of
// an axis commute (same rotation axis), so e.g. M = x' with the R and L layers
// rotated back: M = R L' x'. Each pair below is exact inverses.
const COMPOUND: Record<string, string[]> = {
  M: ["R", "L'", "x'"],   // middle layer (x=0) follows L
  "M'": ["R'", "L", "x"],
  E: ["U", "D'", "y'"],   // equatorial layer (y=0) follows D
  "E'": ["U'", "D", "y"],
  S: ["F'", "B", "z"],    // standing layer (z=0) follows F
  "S'": ["F", "B'", "z'"]
};

// Whole-cube rotation: permute face arrays + rotate each face.
// Direction convention matches the visual animator (CW looking from the +axis
// toward the origin), so the logical state stays in sync with the rendered cube.
// x: CW from +X. The up sticker moves to front: U->F->D->B->U.
function rotX(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const F = s.F, U = s.U, B = s.B, D = s.D;
    s.F = U;
    s.U = rotateFaceCW(rotateFaceCW(B));
    s.B = rotateFaceCW(rotateFaceCW(D));
    s.D = F;
    s.R = rotateFaceCCW(s.R);
    s.L = rotateFaceCW(s.L);
  } else {
    const F = s.F, U = s.U, B = s.B, D = s.D;
    s.U = F;
    s.B = rotateFaceCW(rotateFaceCW(U));
    s.D = rotateFaceCW(rotateFaceCW(B));
    s.F = D;
    s.R = rotateFaceCW(s.R);
    s.L = rotateFaceCCW(s.L);
  }
}
// y: CW from +Y. The front sticker moves to right: F->R->B->L->F.
function rotY(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const F = s.F, L = s.L, B = s.B, R = s.R;
    s.F = L; s.L = B; s.B = R; s.R = F;
    s.U = rotateFaceCCW(s.U);
    s.D = rotateFaceCW(s.D);
  } else {
    const F = s.F, L = s.L, B = s.B, R = s.R;
    s.L = F; s.B = L; s.R = B; s.F = R;
    s.U = rotateFaceCW(s.U);
    s.D = rotateFaceCCW(s.D);
  }
}
// z: CW from +Z. The up sticker moves to left: U->L->D->R->U.
function rotZ(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const U = s.U, R = s.R, D = s.D, L = s.L;
    s.L = rotateFaceCCW(U);
    s.U = rotateFaceCCW(R);
    s.R = rotateFaceCCW(D);
    s.D = rotateFaceCCW(L);
    s.F = rotateFaceCCW(s.F);
    s.B = rotateFaceCW(s.B);
  } else {
    const U = s.U, R = s.R, D = s.D, L = s.L;
    s.R = rotateFaceCW(U);
    s.D = rotateFaceCW(R);
    s.L = rotateFaceCW(D);
    s.U = rotateFaceCW(L);
    s.F = rotateFaceCW(s.F);
    s.B = rotateFaceCCW(s.B);
  }
}

export function applyMove(state: State, move: string): void {
  if (!move) return;
  if (COMPOUND[move]) {
    for (const m of COMPOUND[move]) applyMove(state, m);
    return;
  }
  const prime = move.endsWith("'");
  const base = prime ? move.slice(0, -1) : move;
  if (base === 'x') return rotX(state, prime);
  if (base === 'y') return rotY(state, prime);
  if (base === 'z') return rotZ(state, prime);
  if ('UDLRFB'.includes(base)) return applyFaceTurn(state, base as FaceKey, prime);
}

export function isSolved(state: State): boolean {
  return (Object.keys(state) as FaceKey[]).every(f =>
    state[f].every(c => c === state[f][4])
  );
}

// The single move that undoes `move`: toggle prime, except a double (…2) is its
// own inverse. Used to step a learner back through their own turns.
export function invertMove(move: string): string {
  if (move.endsWith('2')) return move;
  return move.endsWith("'") ? move.slice(0, -1) : move + "'";
}

export function cloneState(s: State): State {
  return {
    U: [...s.U], D: [...s.D], L: [...s.L], R: [...s.R], F: [...s.F], B: [...s.B]
  };
}

export function statesEqual(a: State, b: State): boolean {
  return (Object.keys(a) as FaceKey[]).every(f =>
    a[f].length === b[f].length && a[f].every((c, i) => c === b[f][i])
  );
}
