// Shared types for the physical-cube scanning pipeline.
// Every function in this module family is pure and browser-free: images are
// plain RGBA buffers so the same code runs in the camera path (ImageData) and
// in node unit tests (pngjs-decoded fixtures).

import type { Color, FaceKey } from '../cube/state';

// Matches the shape of a browser ImageData without depending on the DOM lib.
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// CIE L*a*b* (D65), the space all color comparisons happen in.
export interface Lab {
  L: number;
  a: number;
  b: number;
}

// Where the 9 sticker cells sit inside an image, in pixels.
export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Cells ordered like the facelet indices: 0 1 2 / 3 4 5 / 6 7 8.
export type GridSpec = CellRect[];

// One captured face after classification. `face` is the identity established
// by the scan protocol (the center sticker's anchor color).
export interface FaceScan {
  face: FaceKey;
  cells: Color[];
  confidence: number[];
}

export interface ClassifyResult {
  faces: FaceScan[];
}
