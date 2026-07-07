import { describe, expect, it } from 'vitest';
import { rgbToLab } from './color-classify';
import { centeredGrid, sampleCell, sampleGrid } from './sampler';
import type { RGBAImage } from './types';

function solidImage(width: number, height: number, rgb: [number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function setPixel(img: RGBAImage, x: number, y: number, rgb: [number, number, number]): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
}

describe('sampleCell', () => {
  it('reads the color of a solid cell', () => {
    const img = solidImage(60, 60, [200, 30, 40]);
    const lab = sampleCell(img, { x: 0, y: 0, width: 60, height: 60 });
    const expected = rgbToLab(200, 30, 40);
    expect(lab.L).toBeCloseTo(expected.L, 1);
    expect(lab.a).toBeCloseTo(expected.a, 1);
    expect(lab.b).toBeCloseTo(expected.b, 1);
  });

  it('is robust to specular highlights (median, not mean)', () => {
    const img = solidImage(60, 60, [30, 160, 70]);
    // Blow out a quarter of the inner ROI with white glare.
    for (let y = 15; y < 30; y++) for (let x = 15; x < 30; x++) setPixel(img, x, y, [255, 255, 255]);
    const lab = sampleCell(img, { x: 0, y: 0, width: 60, height: 60 });
    const green = rgbToLab(30, 160, 70);
    expect(Math.abs(lab.L - green.L)).toBeLessThan(3);
    expect(Math.abs(lab.a - green.a)).toBeLessThan(5);
  });

  it('ignores pixels outside the inner ROI (sticker gaps, borders)', () => {
    const img = solidImage(60, 60, [0, 0, 0]);
    // Only the inner 50% painted; the border stays black.
    for (let y = 16; y < 44; y++) for (let x = 16; x < 44; x++) setPixel(img, x, y, [240, 210, 40]);
    const lab = sampleCell(img, { x: 0, y: 0, width: 60, height: 60 });
    const yellow = rgbToLab(240, 210, 40);
    expect(Math.abs(lab.L - yellow.L)).toBeLessThan(3);
  });

  it('handles rects that fall outside the image without crashing', () => {
    const img = solidImage(10, 10, [10, 10, 10]);
    const lab = sampleCell(img, { x: 100, y: 100, width: 20, height: 20 });
    expect(lab.L).toBeCloseTo(0, 0);
  });
});

describe('centeredGrid + sampleGrid', () => {
  it('produces 9 cells in facelet order', () => {
    const grid = centeredGrid(120, 120);
    expect(grid).toHaveLength(9);
    // Row-major: cell 1 is right of cell 0, cell 3 is below cell 0.
    expect(grid[1].x).toBeGreaterThan(grid[0].x);
    expect(grid[3].y).toBeGreaterThan(grid[0].y);
    expect(grid[1].y).toBeCloseTo(grid[0].y, 5);
  });

  it('samples a painted 3x3 image into the right cells', () => {
    const img = solidImage(120, 120, [0, 0, 0]);
    // Paint the top-left cell red, the rest green-ish.
    for (let y = 0; y < 120; y++)
      for (let x = 0; x < 120; x++) setPixel(img, x, y, x < 40 && y < 40 ? [200, 30, 40] : [30, 160, 70]);
    const labs = sampleGrid(img, centeredGrid(120, 120));
    expect(labs[0].a).toBeGreaterThan(30); // red has strongly positive a*
    expect(labs[8].a).toBeLessThan(0); // green has negative a*
  });
});
