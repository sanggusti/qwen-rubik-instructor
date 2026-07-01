// Recolour a freshly-built (solved-geometry) cube's stickers so it mirrors an
// arbitrary facelet `State`. Used by the demo cube to show the learner's current
// position before it plays a hint sequence. Because the animator moves stickers
// geometrically, painting the visible colours is enough — the logical cubelet
// model isn't consulted for rendering, so we don't need to reconstruct it.
//
// The (coord, face) -> facelet-index mapping below is derived to match the
// viewer-perspective indexing in cube/state.ts (see its CYCLES): index 0 is the
// top-left sticker as seen looking straight at that face.

import * as THREE from 'three';
import type { CubeMesh } from './cube';
import { FACE_COLORS } from './cube';
import type { FaceKey, State } from '../cube/state';

// Index (0..8) of the sticker at lattice coord (x,y,z) on face `face`, matching
// cube/state.ts's viewer-perspective convention. Only valid for a solved-geometry
// cubie (the demo cube is rebuilt before every paint).
export function faceIndex(face: FaceKey, x: number, y: number, z: number): number {
  switch (face) {
    case 'U': return (z + 1) * 3 + (x + 1);
    case 'D': return (1 - z) * 3 + (x + 1);
    case 'F': return (1 - y) * 3 + (x + 1);
    case 'B': return (1 - y) * 3 + (1 - x);
    case 'L': return (1 - y) * 3 + (z + 1);
    case 'R': return (1 - y) * 3 + (1 - z);
  }
}

function forEachSticker(cube: CubeMesh, fn: (mat: THREE.MeshBasicMaterial, face: FaceKey, x: number, y: number, z: number) => void): void {
  for (const cubie of cube.cubies) {
    const x = Math.round(cubie.coord.x);
    const y = Math.round(cubie.coord.y);
    const z = Math.round(cubie.coord.z);
    for (const child of cubie.mesh.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.userData?.isSticker) continue;
      fn(mesh.material as THREE.MeshBasicMaterial, mesh.userData.face as FaceKey, x, y, z);
    }
  }
}

// Paint every sticker to the colour the given State shows at that position.
export function paintCubeFromState(cube: CubeMesh, state: State): void {
  forEachSticker(cube, (mat, face, x, y, z) => {
    const color = state[face][faceIndex(face, x, y, z)];
    mat.color.setHex(FACE_COLORS[color]);
  });
}

// Restore the solved colouring (each sticker back to its own face colour).
export function repaintSolved(cube: CubeMesh): void {
  forEachSticker(cube, (mat, face) => {
    mat.color.setHex(FACE_COLORS[face]);
  });
}
