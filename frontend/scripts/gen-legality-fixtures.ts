// Generates the shared TS<->Python legality fixture, following the
// cube_fixtures.json convention: a frozen JSON file both test suites load and
// must agree on. Run with:  npx vite-node scripts/gen-legality-fixtures.ts
// Output: backend/tests/fixtures/legality_fixtures.json

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMove, cloneState, solvedState } from '../src/lib/cube/state';
import type { Color, State } from '../src/lib/cube/state';
import { checkLegality } from '../src/lib/physical/legality';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../backend/tests/fixtures/legality_fixtures.json'
);

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
const ALL_MOVES = [...FACE_MOVES, 'M', "M'", 'E', "E'", 'S', "S'"];

function randomState(seed: number, moves: string[]): State {
  const rnd = mulberry32(seed);
  const s = solvedState();
  for (let i = 0; i < 25; i++) applyMove(s, moves[Math.floor(rnd() * moves.length)]);
  return s;
}

function twistCorner(state: State): State {
  const s = cloneState(state);
  const tmp = s.U[8];
  s.U[8] = s.F[2];
  s.F[2] = s.R[0];
  s.R[0] = tmp;
  return s;
}

function flipEdge(state: State): State {
  const s = cloneState(state);
  const tmp = s.U[7];
  s.U[7] = s.F[1];
  s.F[1] = tmp;
  return s;
}

function swapEdges(state: State): State {
  const s = cloneState(state);
  const a = [s.U[7], s.F[1]];
  s.U[7] = s.U[5];
  s.F[1] = s.R[1];
  s.U[5] = a[0] as Color;
  s.R[1] = a[1] as Color;
  return s;
}

function breakStructure(state: State): State {
  const s = cloneState(state);
  // Copy one corner over another: duplicates a cubie, destroys another.
  s.U[8] = s.U[0];
  s.R[0] = s.L[0];
  s.F[2] = s.B[2];
  return s;
}

interface FixtureCase {
  name: string;
  state: State;
  legal: boolean;
  code?: string;
}

function main(): void {
  const cases: FixtureCase[] = [];

  cases.push({ name: 'solved', state: solvedState(), legal: true });
  for (let seed = 0; seed < 12; seed++) {
    cases.push({ name: `scramble-${seed}`, state: randomState(seed, FACE_MOVES), legal: true });
  }
  for (let seed = 12; seed < 20; seed++) {
    cases.push({ name: `scramble-slices-${seed}`, state: randomState(seed, ALL_MOVES), legal: true });
  }
  for (let seed = 0; seed < 8; seed++) {
    cases.push({ name: `twist-${seed}`, state: twistCorner(randomState(100 + seed, FACE_MOVES)), legal: false, code: 'twist' });
    cases.push({ name: `flip-${seed}`, state: flipEdge(randomState(200 + seed, FACE_MOVES)), legal: false, code: 'flip' });
    cases.push({ name: `parity-${seed}`, state: swapEdges(randomState(300 + seed, FACE_MOVES)), legal: false, code: 'parity' });
    cases.push({ name: `structure-${seed}`, state: breakStructure(randomState(400 + seed, FACE_MOVES)), legal: false, code: 'structure' });
  }

  // Self-check against the TS implementation before freezing.
  for (const c of cases) {
    const res = checkLegality(c.state);
    if (res.ok !== c.legal || (!res.ok && res.code !== c.code)) {
      throw new Error(`fixture ${c.name} disagrees with checkLegality: ${JSON.stringify(res)}`);
    }
  }

  writeFileSync(OUT, JSON.stringify(cases, null, 1) + '\n');
  console.log(`wrote ${cases.length} legality cases to ${OUT}`);
}

main();
