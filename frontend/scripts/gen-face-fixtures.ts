// Generates the synthetic half of the scanner fixture corpus:
// PNG images of single cube faces under controlled lighting conditions, with
// exact ground-truth labels. Run with:  npx vite-node scripts/gen-face-fixtures.ts
// Output: src/lib/physical/fixtures/synthetic/*.png + labels.json
// Deterministic (seeded PRNG) so regeneration is reproducible.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { applyMove, solvedState } from '../src/lib/cube/state';
import type { FaceKey, State } from '../src/lib/cube/state';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/physical/fixtures');
const IMG_DIR = join(OUT_DIR, 'synthetic');

const SIZE = 120;
const COVERAGE = 0.9; // must match sampler.centeredGrid default
const FACES: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B'];

// Approximate real-cube sticker colors under neutral light.
const BASE_RGB: Record<FaceKey, [number, number, number]> = {
  U: [245, 245, 245],
  D: [240, 210, 40],
  L: [255, 120, 30],
  R: [200, 30, 40],
  F: [30, 160, 70],
  B: [30, 90, 200]
};

interface Condition {
  name: string;
  brightness: number;
  cast: [number, number, number]; // per-channel multiplier (white-balance error)
  noise: number; // gaussian sigma
  glareCells: number; // specular blobs on N random cells
}

const CONDITIONS: Condition[] = [
  { name: 'normal', brightness: 1.0, cast: [1, 1, 1], noise: 6, glareCells: 0 },
  { name: 'warm', brightness: 0.95, cast: [1.15, 1.0, 0.75], noise: 8, glareCells: 0 },
  { name: 'dim', brightness: 0.45, cast: [1.02, 1.0, 0.95], noise: 10, glareCells: 0 },
  { name: 'glare', brightness: 1.0, cast: [1, 1, 1], noise: 6, glareCells: 2 }
];

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

// Box-Muller gaussian.
function gaussian(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const FACE_MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];

function scrambledState(seed: number): State {
  const rnd = mulberry32(seed);
  const s = solvedState();
  for (let i = 0; i < 25; i++) applyMove(s, FACE_MOVES[Math.floor(rnd() * FACE_MOVES.length)]);
  return s;
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function gridRects(): CellRect[] {
  const side = SIZE * COVERAGE;
  const cell = side / 3;
  const o = (SIZE - side) / 2;
  const rects: CellRect[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      rects.push({ x: o + col * cell, y: o + row * cell, w: cell, h: cell });
    }
  }
  return rects;
}

function renderFace(cells: FaceKey[], cond: Condition, rnd: () => number): PNG {
  const png = new PNG({ width: SIZE, height: SIZE });
  // Dark plastic background.
  for (let i = 0; i < SIZE * SIZE; i++) {
    png.data[i * 4] = 18;
    png.data[i * 4 + 1] = 18;
    png.data[i * 4 + 2] = 20;
    png.data[i * 4 + 3] = 255;
  }

  const rects = gridRects();
  const glareTargets = new Set<number>();
  while (glareTargets.size < cond.glareCells) glareTargets.add(Math.floor(rnd() * 9));

  rects.forEach((rect, cellIdx) => {
    const base = BASE_RGB[cells[cellIdx]];
    const gap = rect.w * 0.06; // sticker gap
    const x0 = Math.round(rect.x + gap);
    const y0 = Math.round(rect.y + gap);
    const x1 = Math.round(rect.x + rect.w - gap);
    const y1 = Math.round(rect.y + rect.h - gap);

    // Optional specular blob center for this cell.
    const glare = glareTargets.has(cellIdx)
      ? {
          cx: rect.x + rect.w * (0.3 + rnd() * 0.4),
          cy: rect.y + rect.h * (0.3 + rnd() * 0.4),
          r: rect.w * 0.22
        }
      : null;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let r = base[0] * cond.brightness * cond.cast[0] + gaussian(rnd) * cond.noise;
        let g = base[1] * cond.brightness * cond.cast[1] + gaussian(rnd) * cond.noise;
        let b = base[2] * cond.brightness * cond.cast[2] + gaussian(rnd) * cond.noise;
        if (glare) {
          const d = Math.hypot(x - glare.cx, y - glare.cy);
          if (d < glare.r) {
            const t = 1 - d / glare.r;
            r += (255 - r) * t;
            g += (255 - g) * t;
            b += (255 - b) * t;
          }
        }
        const i = (y * SIZE + x) * 4;
        png.data[i] = Math.max(0, Math.min(255, Math.round(r)));
        png.data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
        png.data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
        png.data[i + 3] = 255;
      }
    }
  });
  return png;
}

interface LabelEntry {
  file: string;
  source: 'synthetic';
  set: string;
  condition: string;
  face: FaceKey;
  cells: string; // 9 letters, facelet order
}

function main(): void {
  mkdirSync(IMG_DIR, { recursive: true });
  const labels: LabelEntry[] = [];
  const SETS = 3; // 3 scrambles x 4 conditions x 6 faces = 72 images

  for (let set = 0; set < SETS; set++) {
    const state = scrambledState(100 + set);
    for (const cond of CONDITIONS) {
      const rnd = mulberry32(set * 1000 + cond.name.length * 77 + 5);
      for (const face of FACES) {
        const cells = state[face] as FaceKey[];
        const png = renderFace(cells, cond, rnd);
        const file = `synthetic/set${set}-${cond.name}-${face}.png`;
        writeFileSync(join(OUT_DIR, file), PNG.sync.write(png));
        labels.push({ file, source: 'synthetic', set: `set${set}`, condition: cond.name, face, cells: cells.join('') });
      }
    }
  }

  writeFileSync(join(OUT_DIR, 'labels.json'), JSON.stringify(labels, null, 2) + '\n');
  console.log(`wrote ${labels.length} synthetic fixtures to ${IMG_DIR}`);
}

main();
