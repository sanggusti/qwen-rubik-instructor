import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CubeMesh } from './cube';
import { MoveAnimator } from './animator';
import { paintCubeFromState, repaintSolved } from './paint-from-state';
import { solvedState, applyMove, cloneState, type State } from '../cube/state';

const STEP = 1.02; // CUBIE_SIZE + CUBIE_GAP, from cube.ts

function runToIdle(animator: MoveAnimator): void {
  let now = 0;
  for (let i = 0; i < 100000 && animator.isBusy(); i++) {
    now += 10000;
    animator.update(now);
  }
  if (animator.isBusy()) throw new Error('animator did not reach idle');
}

// A purely geometric fingerprint of a cube's *appearance*: for every visible
// sticker, key on (which lattice cell, which way it faces) and record its colour.
// Independent of the faceIndex mapping under test, so comparing two cubes this
// way validates painting against the animator's real geometry.
function appearance(cube: CubeMesh): Map<string, number> {
  cube.root.updateMatrixWorld(true);
  const map = new Map<string, number>();
  const normal = new THREE.Vector3();
  const center = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  for (const cubie of cube.cubies) {
    // Key on the cubie *centre* (not the sticker, whose depth offset pushes the
    // coordinate onto a .5 rounding boundary) plus the sticker's world normal.
    cubie.mesh.getWorldPosition(center);
    const cell = `${Math.round(center.x / STEP)},${Math.round(center.y / STEP)},${Math.round(center.z / STEP)}`;
    for (const child of cubie.mesh.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.userData?.isSticker) continue;
      mesh.getWorldQuaternion(quat);
      normal.set(0, 0, 1).applyQuaternion(quat).round();
      const key = `${cell}|${normal.x},${normal.y},${normal.z}`;
      map.set(key, (mesh.material as THREE.MeshBasicMaterial).color.getHex());
    }
  }
  return map;
}

function stateAfter(moves: string[]): State {
  const s = solvedState();
  for (const m of moves) applyMove(s, m);
  return s;
}

function animatedCube(moves: string[]): CubeMesh {
  const cube = new CubeMesh();
  const animator = new MoveAnimator(cube, cube.root, 1);
  for (const m of moves) animator.enqueue(m);
  runToIdle(animator);
  return cube;
}

describe('paintCubeFromState', () => {
  it('leaves a solved cube unchanged', () => {
    const cube = new CubeMesh();
    const before = appearance(cube);
    paintCubeFromState(cube, solvedState());
    expect(appearance(cube)).toEqual(before);
  });

  const sequences: Record<string, string[]> = {
    'single U': ['U'],
    'single R': ['R'],
    'single F': ['F'],
    'single L': ['L'],
    'single D': ['D'],
    'single B': ['B'],
    'prime moves': ["U'", "R'", "F'"],
    scramble: ['R', 'U', "R'", 'U', 'R', 'U', "U'", 'F', "B'", 'L', 'D', "R'", 'B']
  };

  for (const [name, moves] of Object.entries(sequences)) {
    it(`mirrors the animator's geometry for: ${name}`, () => {
      // A cube that reached the state by animating the moves = ground truth look.
      const oracle = appearance(animatedCube(moves));
      // A solved cube painted from the same facelet state should look identical.
      const painted = new CubeMesh();
      paintCubeFromState(painted, stateAfter(moves));
      expect(appearance(painted)).toEqual(oracle);
    });
  }

  it('repaintSolved restores the original colouring after a paint', () => {
    const cube = new CubeMesh();
    const solvedLook = appearance(cube);
    paintCubeFromState(cube, stateAfter(['R', 'U', 'F']));
    expect(appearance(cube)).not.toEqual(solvedLook);
    repaintSolved(cube);
    expect(appearance(cube)).toEqual(solvedLook);
  });

  it('does not mutate the passed state', () => {
    const state = stateAfter(['R', 'U']);
    const copy = cloneState(state);
    paintCubeFromState(new CubeMesh(), state);
    expect(state).toEqual(copy);
  });
});
