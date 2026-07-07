// Sticker sampling: reduce each grid cell to one Lab value.
// Median over an inner ROI (not a single pixel, not a mean) so specular
// highlights and edge bleed from the cube's black plastic don't skew the read.

import { rgbToLab } from './color-classify';
import type { CellRect, GridSpec, Lab, RGBAImage } from './types';

// Fraction of the cell kept when sampling; 0.5 means the middle 50% in each
// dimension, which stays clear of rounded sticker corners and gaps.
const INNER_FRACTION = 0.5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function sampleCell(img: RGBAImage, rect: CellRect): Lab {
  const insetX = (rect.width * (1 - INNER_FRACTION)) / 2;
  const insetY = (rect.height * (1 - INNER_FRACTION)) / 2;
  const x0 = Math.max(0, Math.round(rect.x + insetX));
  const y0 = Math.max(0, Math.round(rect.y + insetY));
  const x1 = Math.min(img.width, Math.round(rect.x + rect.width - insetX));
  const y1 = Math.min(img.height, Math.round(rect.y + rect.height - insetY));

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]);
      gs.push(img.data[i + 1]);
      bs.push(img.data[i + 2]);
    }
  }
  if (rs.length === 0) return rgbToLab(0, 0, 0);
  return rgbToLab(median(rs), median(gs), median(bs));
}

export function sampleGrid(img: RGBAImage, grid: GridSpec): Lab[] {
  return grid.map((rect) => sampleCell(img, rect));
}

// Convenience for the common case: a square face image with the 3x3 grid
// centered and spanning `coverage` of the shorter side.
export function centeredGrid(width: number, height: number, coverage = 0.9): GridSpec {
  const side = Math.min(width, height) * coverage;
  const cell = side / 3;
  const ox = (width - side) / 2;
  const oy = (height - side) / 2;
  const grid: GridSpec = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      grid.push({ x: ox + col * cell, y: oy + row * cell, width: cell, height: cell });
    }
  }
  return grid;
}
