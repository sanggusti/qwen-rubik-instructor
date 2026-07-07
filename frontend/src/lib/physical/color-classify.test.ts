import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import type { FaceKey } from '../cube/state';
import { ciede2000, classify, rgbToLab } from './color-classify';
import { centeredGrid, sampleGrid } from './sampler';
import type { Lab, RGBAImage } from './types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

interface LabelEntry {
  file: string;
  source: string;
  set: string;
  condition: string;
  face: FaceKey;
  cells: string;
}

const LABELS: LabelEntry[] = JSON.parse(readFileSync(join(FIXTURES, 'labels.json'), 'utf8'));

function loadImage(file: string): RGBAImage {
  const png = PNG.sync.read(readFileSync(join(FIXTURES, file)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}

// Group labels into full-cube capture sets (one entry per face).
function captureSets(): Map<string, LabelEntry[]> {
  const sets = new Map<string, LabelEntry[]>();
  for (const l of LABELS) {
    const key = `${l.set}:${l.condition}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key)!.push(l);
  }
  return sets;
}

function classifySet(entries: LabelEntry[]) {
  const samples = {} as Record<FaceKey, Lab[]>;
  for (const entry of entries) {
    const img = loadImage(entry.file);
    samples[entry.face] = sampleGrid(img, centeredGrid(img.width, img.height));
  }
  return classify(samples);
}

describe('color math', () => {
  it('rgbToLab hits reference points', () => {
    const white = rgbToLab(255, 255, 255);
    expect(white.L).toBeCloseTo(100, 0);
    expect(Math.abs(white.a)).toBeLessThan(0.5);
    expect(Math.abs(white.b)).toBeLessThan(0.5);
    const black = rgbToLab(0, 0, 0);
    expect(black.L).toBeCloseTo(0, 1);
  });

  it('ciede2000 is zero for identical colors and symmetric', () => {
    const a = rgbToLab(200, 30, 40);
    const b = rgbToLab(255, 120, 30);
    expect(ciede2000(a, a)).toBeCloseTo(0, 6);
    expect(ciede2000(a, b)).toBeCloseTo(ciede2000(b, a), 6);
    expect(ciede2000(a, b)).toBeGreaterThan(5);
  });

  it('ciede2000 matches a published Sharma test pair', () => {
    // Pair #1 from Sharma, Wu & Dalal (2005) supplementary data.
    const d = ciede2000({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 });
    expect(d).toBeCloseTo(2.0425, 3);
  });
});

describe('classify on the fixture corpus', () => {
  const sets = captureSets();

  it('has full capture sets (6 faces each)', () => {
    expect(sets.size).toBeGreaterThan(0);
    for (const [key, entries] of sets) expect(entries.length, key).toBe(6);
  });

  for (const [key, entries] of captureSets()) {
    const condition = entries[0].condition;
    const isStress = condition !== 'normal';

    it(`${key}: accuracy ${isStress ? '>=48' : '>=52'}/54${isStress ? ' with low-confidence flags' : ''}`, () => {
      const result = classifySet(entries);
      let correct = 0;
      let wrongButFlagged = 0;
      let wrong = 0;
      for (const entry of entries) {
        const scan = result.faces.find((f) => f.face === entry.face)!;
        for (let i = 0; i < 9; i++) {
          if (scan.cells[i] === entry.cells[i]) correct++;
          else if (scan.confidence[i] < 0.5) wrongButFlagged++;
          else wrong++;
        }
      }
      expect(correct, `correct cells for ${key}`).toBeGreaterThanOrEqual(isStress ? 48 : 52);
      // Confidently-wrong cells are the dangerous ones; a handful of
      // flagged-uncertain misreads are recoverable in the adjust step.
      expect(wrong, `confidently wrong cells for ${key}`).toBeLessThanOrEqual(isStress ? 2 : 0);
    });
  }
});
