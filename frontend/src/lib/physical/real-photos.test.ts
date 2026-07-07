// Real-photo smoke tests. A single face photo cannot form a full 6-face
// classify() set (no anchors), so these test the sampler + color distance
// directly: every cell's sampled Lab must be nearest to its ground-truth
// color among the six NOMINAL sticker colors. Weaker than the anchored
// classifier, so passing here is a strong signal for real camera frames.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import type { FaceKey } from '../cube/state';
import { ciede2000, rgbToLab } from './color-classify';
import { centeredGrid, sampleGrid } from './sampler';
import type { Lab, RGBAImage } from './types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

interface RealLabel {
  file: string;
  source: string;
  face: FaceKey;
  cells: string;
  notes?: string;
}

const LABELS: RealLabel[] = JSON.parse(readFileSync(join(FIXTURES, 'labels-real.json'), 'utf8'));

// Nominal sticker colors (same palette as the synthetic generator).
const NOMINAL: Record<FaceKey, Lab> = {
  U: rgbToLab(245, 245, 245),
  D: rgbToLab(240, 210, 40),
  L: rgbToLab(255, 120, 30),
  R: rgbToLab(200, 30, 40),
  F: rgbToLab(30, 160, 70),
  B: rgbToLab(30, 90, 200)
};

function loadImage(file: string): RGBAImage {
  const png = PNG.sync.read(readFileSync(join(FIXTURES, file)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

function nearestNominal(sample: Lab): FaceKey {
  let best: FaceKey = 'U';
  let bestD = Infinity;
  for (const f of Object.keys(NOMINAL) as FaceKey[]) {
    const d = ciede2000(sample, NOMINAL[f]);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

describe('real photos (internet corpus)', () => {
  for (const label of LABELS) {
    it(`${label.file}: >=8/9 cells match against nominal colors`, () => {
      const img = loadImage(label.file);
      const labs = sampleGrid(img, centeredGrid(img.width, img.height));
      let correct = 0;
      const got: string[] = [];
      for (let i = 0; i < 9; i++) {
        const guess = nearestNominal(labs[i]);
        got.push(guess);
        if (guess === label.cells[i]) correct++;
      }
      expect(correct, `expected ${label.cells}, got ${got.join('')}`).toBeGreaterThanOrEqual(8);
    });
  }
});
