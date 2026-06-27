import * as THREE from 'three';
import type { FaceKey } from '../../core/state';
import { Cubelet } from './cubelets';

// Standard Rubik's color scheme.
export const FACE_COLORS: Record<FaceKey, number> = {
  U: 0xffffff, // white
  D: 0xffd500, // yellow
  L: 0xff8c00, // orange
  R: 0xc41e3a, // red
  F: 0x009e60, // green
  B: 0x0051ba  // blue
};

export const CUBIE_SIZE = 1;
export const CUBIE_GAP = 0.02;

const STICKER_INSET = 0.06;
const STICKER_DEPTH = 0.51;

export type Axis = 'x' | 'y' | 'z';

export interface Cubie {
  mesh: THREE.Object3D;
  // Logical lattice coordinates in {-1,0,1}^3 (updated after each move).
  coord: THREE.Vector3;
  // Logical sticker/orientation model, kept in sync with `coord` after each move.
  cubelet: Cubelet;
}

export class CubeMesh {
  readonly root: THREE.Group;
  readonly cubies: Cubie[] = [];

  constructor() {
    this.root = new THREE.Group();
    const step = CUBIE_SIZE + CUBIE_GAP;

    const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const geom = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new THREE.Group();
          const body = new THREE.Mesh(geom, blackMat);
          cubie.add(body);

          if (x === 1) addSticker(cubie, 'R', 'x', 1);
          if (x === -1) addSticker(cubie, 'L', 'x', -1);
          if (y === 1) addSticker(cubie, 'U', 'y', 1);
          if (y === -1) addSticker(cubie, 'D', 'y', -1);
          if (z === 1) addSticker(cubie, 'F', 'z', 1);
          if (z === -1) addSticker(cubie, 'B', 'z', -1);

          cubie.position.set(x * step, y * step, z * step);
          this.root.add(cubie);
          this.cubies.push({
            mesh: cubie,
            coord: new THREE.Vector3(x, y, z),
            cubelet: makeCubelet(x, y, z)
          });
        }
      }
    }
  }

  cubiesOnLayer(axis: Axis, slice: number): Cubie[] {
    return this.cubies.filter(c => Math.round(c.coord[axis]) === slice);
  }
}

// Build the logical Cubelet for a cubie at lattice coords (x, y, z), each in {-1,0,1}.
// Sticker colors are placed in slot order [front, up, right, down, left, back],
// matching the visual stickers added in the constructor. The id encodes the solved
// address so the cubelet's addressX/Y/Z line up with `coord`.
function makeCubelet(x: number, y: number, z: number): Cubelet {
  const colors: (FaceKey | null)[] = [
    z === 1 ? 'F' : null,  // front
    y === 1 ? 'U' : null,  // up
    x === 1 ? 'R' : null,  // right
    y === -1 ? 'D' : null, // down
    x === -1 ? 'L' : null, // left
    z === -1 ? 'B' : null  // back
  ];
  const id = (x + 1) + (1 - y) * 3 + (1 - z) * 9;
  return new Cubelet(id, colors);
}

function addSticker(parent: THREE.Object3D, face: FaceKey, axis: Axis, sign: 1 | -1) {
  const size = CUBIE_SIZE - STICKER_INSET * 2;
  const plane = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: FACE_COLORS[face], side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(plane, mat);
  mesh.userData.face = face;
  mesh.userData.isSticker = true;
  if (axis === 'x') {
    mesh.rotation.y = sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    mesh.position.x = sign * STICKER_DEPTH;
  } else if (axis === 'y') {
    mesh.rotation.x = sign === 1 ? -Math.PI / 2 : Math.PI / 2;
    mesh.position.y = sign * STICKER_DEPTH;
  } else {
    if (sign === -1) mesh.rotation.y = Math.PI;
    mesh.position.z = sign * STICKER_DEPTH;
  }
  parent.add(mesh);
}
