import type { FaceKey } from '../cube/state';

// Standard Rubik's color scheme.
export const FACE_COLORS: Record<FaceKey, number> = {
  U: 0xffffff, // white
  D: 0xffd500, // yellow
  L: 0xff8c00, // orange
  R: 0xc41e3a, // red
  F: 0x009e60, // green
  B: 0x0051ba  // blue
};
