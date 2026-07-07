// Cube-state legality: proves a scanned 54-sticker state is physically
// reachable, which `is_well_formed`-style color counting cannot
// (a random color-count-valid reassembly is solvable with p = 1/12).
// Checks, in order: cubie structure (incl. mirror-image chirality),
// corner twist sum mod 3, edge flip sum mod 2, permutation parity.
//
// Sticker index tables are derived from the repo's facelet convention
// (frontend/src/lib/cube/state.ts header): each face viewed from outside,
// indices 0..8 row-major, adjacency fixed by the CYCLES tables there.
// The property tests in legality.test.ts pin these tables against
// applyMove-generated legal states.

import { applyMove, cloneState } from '../cube/state';
import type { Color, FaceKey, State } from '../cube/state';

export type LegalityCode = 'structure' | 'twist' | 'flip' | 'parity';

export interface StickerRef {
  face: FaceKey;
  index: number;
}

export type LegalityResult =
  | { ok: true }
  | { ok: false; code: LegalityCode; suspects: StickerRef[] };

type Slot = [FaceKey, number][];

// 8 corner slots. Sticker order is clockwise viewed from outside the corner,
// starting with the U/D-face facelet (standard Singmaster/Kociemba labels).
const CORNER_SLOTS: Slot[] = [
  [['U', 8], ['R', 0], ['F', 2]], // URF
  [['U', 6], ['F', 0], ['L', 2]], // UFL
  [['U', 0], ['L', 0], ['B', 2]], // ULB
  [['U', 2], ['B', 0], ['R', 2]], // UBR
  [['D', 2], ['F', 8], ['R', 6]], // DFR
  [['D', 0], ['L', 8], ['F', 6]], // DLF
  [['D', 6], ['B', 8], ['L', 6]], // DBL
  [['D', 8], ['R', 8], ['B', 6]]  // DRB
];

// The 8 legal corner cubies as clockwise color triples (U/D color first).
// A mirrored reading (e.g. U,F,R) is physically impossible.
const LEGAL_CORNERS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];

// 12 edge slots; first sticker is the orientation-primary facelet
// (U/D facelet for U/D-layer slots, F/B facelet for middle-layer slots).
const EDGE_SLOTS: Slot[] = [
  [['U', 5], ['R', 1]], // UR
  [['U', 7], ['F', 1]], // UF
  [['U', 3], ['L', 1]], // UL
  [['U', 1], ['B', 1]], // UB
  [['D', 5], ['R', 7]], // DR
  [['D', 1], ['F', 7]], // DF
  [['D', 3], ['L', 7]], // DL
  [['D', 7], ['B', 7]], // DB
  [['F', 5], ['R', 3]], // FR
  [['F', 3], ['L', 5]], // FL
  [['B', 5], ['L', 3]], // BL
  [['B', 3], ['R', 5]]  // BR
];

const LEGAL_EDGES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

function readSlot(state: State, slot: Slot): Color[] {
  return slot.map(([face, index]) => state[face][index]);
}

function slotStickers(slot: Slot): StickerRef[] {
  return slot.map(([face, index]) => ({ face, index }));
}

function permutationParity(perm: number[]): number {
  let swaps = 0;
  const seen = new Array<boolean>(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      j = perm[j];
      len++;
    }
    swaps += len - 1;
  }
  return swaps % 2;
}

// Bring a state's centers back to the identity arrangement (U center on U,
// etc.) by applying the unique whole-cube rotation that does so. Returns null
// when no rotation can (physically impossible center arrangement, e.g. from
// manual entry). Slice moves and cube rotations displace centers, so this
// runs before any cubie analysis; it is also the canonical frame used by the
// guided-tracking comparisons.
const ROTATION_MOVES = ['x', "x'", 'y', "y'", 'z', "z'"];

function centersIdentity(state: State): boolean {
  return (['U', 'D', 'L', 'R', 'F', 'B'] as FaceKey[]).every((f) => state[f][4] === f);
}

export function canonicalizeCenters(state: State): State | null {
  if (centersIdentity(state)) return cloneState(state);
  // BFS over whole-cube rotations; the rotation group has diameter <= 4 with
  // quarter-turn generators, and states are tiny, so this is instant.
  let frontier: State[] = [cloneState(state)];
  for (let depth = 0; depth < 4; depth++) {
    const next: State[] = [];
    for (const s of frontier) {
      for (const m of ROTATION_MOVES) {
        const t = cloneState(s);
        applyMove(t, m);
        if (centersIdentity(t)) return t;
        next.push(t);
      }
    }
    frontier = next;
  }
  return null;
}

export function checkLegality(input: State): LegalityResult {
  // Step 0: centers. The scan protocol yields identity centers by
  // construction, but slice moves (and manual entry) can displace or corrupt
  // them.
  const state = canonicalizeCenters(input);
  if (state === null) {
    return {
      ok: false,
      code: 'structure',
      suspects: (['U', 'D', 'L', 'R', 'F', 'B'] as FaceKey[]).map((f) => ({ face: f, index: 4 }))
    };
  }

  // --- Corners: identity, chirality, orientation, permutation -------------
  const cornerPerm: number[] = [];
  const cornerSeen = new Array<boolean>(8).fill(false);
  let twistSum = 0;
  const badCorners: StickerRef[] = [];

  for (const slot of CORNER_SLOTS) {
    const colors = readSlot(state, slot);
    const udIndex = colors.findIndex((c) => c === 'U' || c === 'D');
    const udCount = colors.filter((c) => c === 'U' || c === 'D').length;
    if (udCount !== 1) {
      badCorners.push(...slotStickers(slot));
      continue;
    }
    // Rotate so the U/D color is first; the result must be a legal CW triple.
    const canonical =
      colors[udIndex] + colors[(udIndex + 1) % 3] + colors[(udIndex + 2) % 3];
    const cubie = LEGAL_CORNERS.indexOf(canonical);
    if (cubie === -1 || cornerSeen[cubie]) {
      badCorners.push(...slotStickers(slot));
      continue;
    }
    cornerSeen[cubie] = true;
    cornerPerm.push(cubie);
    twistSum += udIndex;
  }
  if (badCorners.length > 0) return { ok: false, code: 'structure', suspects: badCorners };

  // --- Edges: identity, orientation, permutation --------------------------
  const edgePerm: number[] = [];
  const edgeSeen = new Array<boolean>(12).fill(false);
  let flipSum = 0;
  const badEdges: StickerRef[] = [];

  for (const slot of EDGE_SLOTS) {
    const colors = readSlot(state, slot);
    const key01 = colors[0] + colors[1];
    const key10 = colors[1] + colors[0];
    let cubie = LEGAL_EDGES.indexOf(key01);
    let flipped = 0;
    if (cubie === -1) {
      cubie = LEGAL_EDGES.indexOf(key10);
      flipped = 1;
    }
    if (cubie === -1 || edgeSeen[cubie]) {
      badEdges.push(...slotStickers(slot));
      continue;
    }
    edgeSeen[cubie] = true;
    edgePerm.push(cubie);
    flipSum += flipped;
  }
  if (badEdges.length > 0) return { ok: false, code: 'structure', suspects: badEdges };

  if (twistSum % 3 !== 0) return { ok: false, code: 'twist', suspects: [] };
  if (flipSum % 2 !== 0) return { ok: false, code: 'flip', suspects: [] };
  if (permutationParity(cornerPerm) !== permutationParity(edgePerm)) {
    return { ok: false, code: 'parity', suspects: [] };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rotation auto-fix: the scan protocol fixes each face's identity (center)
// but not its rotation. If the captured state is illegal, try rotating each
// face's 3x3 reading by 0/90/180/270 and accept the unique legal combination.

function rotateFaceReading(face: Color[], quarterTurns: number): Color[] {
  let f = face;
  for (let i = 0; i < quarterTurns; i++) {
    f = [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
  }
  return f;
}

const FACE_ORDER: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B'];

export function autoFixRotations(state: State): State | null {
  if (checkLegality(state).ok) return cloneState(state);

  // Coincidental extra solutions exist (e.g. a 180deg turn of some face of a
  // scrambled cube can happen to stay legal), so rank by how many faces the
  // fix rotates: one mis-rotated reading is far likelier than two independent
  // errors. Accept the unique minimal fix; ties are genuinely ambiguous.
  const solutions: { state: State; rotated: number }[] = [];
  const rot = new Array<number>(6).fill(0);

  const trial = cloneState(state);
  const search = (faceIdx: number): void => {
    if (faceIdx === 6) {
      if (checkLegality(trial).ok) {
        solutions.push({
          state: cloneState(trial),
          rotated: rot.filter((r) => r !== 0).length
        });
      }
      return;
    }
    const face = FACE_ORDER[faceIdx];
    for (let r = 0; r < 4; r++) {
      rot[faceIdx] = r;
      trial[face] = rotateFaceReading(state[face], r);
      search(faceIdx + 1);
    }
    rot[faceIdx] = 0;
    trial[face] = [...state[face]];
  };
  search(0);

  if (solutions.length === 0) return null;
  const minRotated = Math.min(...solutions.map((s) => s.rotated));
  const minimal = solutions.filter((s) => s.rotated === minRotated);
  return minimal.length === 1 ? minimal[0].state : null;
}
