import { describe, expect, it } from 'vitest';
import { applyMove, cloneState, solvedState } from '../cube/state';
import type { Color, FaceKey, State } from '../cube/state';
import { autoFixRotations, canonicalizeCenters, checkLegality } from './legality';

// Deterministic PRNG so failures reproduce.
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
const ALL_MOVES = [...FACE_MOVES, 'M', "M'", 'E', "E'", 'S', "S'", 'x', "x'", 'y', "y'", 'z', "z'"];

function randomState(seed: number, length: number, moves: string[] = FACE_MOVES): State {
  const rnd = mulberry32(seed);
  const s = solvedState();
  for (let i = 0; i < length; i++) applyMove(s, moves[Math.floor(rnd() * moves.length)]);
  return s;
}

// Cyclically rotate the three stickers of one corner slot (a physical twist).
function twistCorner(state: State): State {
  const s = cloneState(state);
  // URF corner: U8 -> R0 -> F2 -> U8
  const tmp = s.U[8];
  s.U[8] = s.F[2];
  s.F[2] = s.R[0];
  s.R[0] = tmp;
  return s;
}

// Flip one edge in place (swap its two stickers).
function flipEdge(state: State): State {
  const s = cloneState(state);
  // UF edge: U7 <-> F1
  const tmp = s.U[7];
  s.U[7] = s.F[1];
  s.F[1] = tmp;
  return s;
}

// Swap two edge cubies without flipping (pure two-cycle => parity violation).
function swapEdges(state: State): State {
  const s = cloneState(state);
  // UF (U7,F1) <-> UR (U5,R1), primary with primary.
  const a = [s.U[7], s.F[1]];
  s.U[7] = s.U[5];
  s.F[1] = s.R[1];
  s.U[5] = a[0];
  s.R[1] = a[1];
  return s;
}

describe('checkLegality', () => {
  it('accepts the solved state', () => {
    expect(checkLegality(solvedState())).toEqual({ ok: true });
  });

  it('accepts 200 random face-turn scrambles', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = randomState(seed, 25);
      expect(checkLegality(s), `seed ${seed}`).toEqual({ ok: true });
    }
  });

  it('accepts scrambles that include slices and whole-cube rotations', () => {
    for (let seed = 0; seed < 100; seed++) {
      const s = randomState(1000 + seed, 30, ALL_MOVES);
      expect(checkLegality(s), `seed ${seed}`).toEqual({ ok: true });
    }
  });

  it('rejects a single twisted corner as twist', () => {
    for (let seed = 0; seed < 20; seed++) {
      const res = checkLegality(twistCorner(randomState(seed, 25)));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('twist');
    }
  });

  it('rejects a single flipped edge as flip', () => {
    for (let seed = 0; seed < 20; seed++) {
      const res = checkLegality(flipEdge(randomState(seed, 25)));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('flip');
    }
  });

  it('rejects a two-edge swap as parity', () => {
    const res = checkLegality(swapEdges(solvedState()));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('parity');
  });

  it('rejects an impossible cubie with suspect stickers', () => {
    const s = solvedState();
    // Paint the UF edge as U/D — an edge cubie that cannot exist.
    s.F[1] = 'D' as Color;
    const res = checkLegality(s);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('structure');
      expect(res.suspects).toContainEqual({ face: 'U', index: 7 });
      expect(res.suspects).toContainEqual({ face: 'F', index: 1 });
    }
  });

  it('rejects a duplicated cubie as structure', () => {
    const s = randomState(7, 25);
    // Copy one corner's stickers over another corner (duplicates the cubie).
    // URF (U8,R0,F2) <- ULB (U0,L0,B2)
    s.U[8] = s.U[0];
    s.R[0] = s.L[0];
    s.F[2] = s.B[2];
    const res = checkLegality(s);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('structure');
  });
});

describe('canonicalizeCenters', () => {
  it('is identity for identity-center states', () => {
    const s = randomState(3, 25);
    expect(canonicalizeCenters(s)).toEqual(s);
  });

  it('restores centers displaced by rotations and slices', () => {
    for (const prefix of ['x', "y'", 'z', 'M', "E'", 'S']) {
      const s = randomState(11, 25);
      const rotated = cloneState(s);
      applyMove(rotated, prefix);
      const canon = canonicalizeCenters(rotated);
      expect(canon).not.toBeNull();
      (['U', 'D', 'L', 'R', 'F', 'B'] as FaceKey[]).forEach((f) =>
        expect(canon![f][4]).toBe(f)
      );
      expect(checkLegality(canon!)).toEqual({ ok: true });
    }
  });

  it('returns null for impossible center arrangements', () => {
    const s = solvedState();
    s.U[4] = 'D' as Color; // two D centers, no U center
    expect(canonicalizeCenters(s)).toBeNull();
  });
});

describe('autoFixRotations', () => {
  it('returns the state unchanged when already legal', () => {
    const s = randomState(5, 25);
    expect(autoFixRotations(s)).toEqual(s);
  });

  it('recovers a single mis-rotated face reading', () => {
    for (let seed = 0; seed < 10; seed++) {
      const s = randomState(seed, 25);
      const broken = cloneState(s);
      // Simulate reading F rotated 90deg clockwise.
      const f = broken.F;
      broken.F = [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
      if (checkLegality(broken).ok) continue; // rotation happened to be legal
      const fixed = autoFixRotations(broken);
      expect(fixed, `seed ${seed}`).not.toBeNull();
      expect(checkLegality(fixed!)).toEqual({ ok: true });
    }
  });
});
