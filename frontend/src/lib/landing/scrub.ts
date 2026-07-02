// Scroll-scrubbed move playback ("Apple product page" technique).
// Maps a fractional move index t ∈ [0, moves.length] onto the cube mesh:
// floor(t) moves are baked analytically (exact lattice positions, no tween),
// and the move at floor(t) is shown mid-turn at frac(t) · 90°.
// Fully bidirectional: scrolling up un-turns the cube move by move.

import * as THREE from 'three';
import { CubeMesh, CUBIE_SIZE, CUBIE_GAP, type Cubie } from '../scene/cube';
import { parseMove } from '../cube/moves';
import { _internal } from '../scene/animator';

const QUARTER = Math.PI / 2;
const STEP = CUBIE_SIZE + CUBIE_GAP;

const AXIS_VEC = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
} as const;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

interface Partial {
  index: number;
  affected: { cubie: Cubie; position: THREE.Vector3; quaternion: THREE.Quaternion }[];
}

export class SequenceScrubber {
  private applied = 0;
  private partial: Partial | null = null;
  private lastT = -1;

  constructor(
    private cube: CubeMesh,
    private moves: string[]
  ) {}

  get length(): number {
    return this.moves.length;
  }

  // t ∈ [0, moves.length]; values outside are clamped.
  setProgress(t: number): void {
    const clamped = Math.max(0, Math.min(t, this.moves.length));
    if (clamped === this.lastT) return;
    this.lastT = clamped;

    const target = Math.floor(clamped);
    const frac = clamped - target;

    this.clearPartial();
    while (this.applied < target) {
      this.applyInstant(this.moves[this.applied], 1);
      this.applied++;
    }
    while (this.applied > target) {
      this.applied--;
      this.applyInstant(this.moves[this.applied], -1);
    }
    if (frac > 0 && target < this.moves.length) this.setPartial(target, frac);
  }

  // Bake one full quarter turn (or its inverse when sign = -1) into positions,
  // orientations, and the logical lattice/cubelet model — same analytic math
  // as MoveAnimator.finishCurrent, so scrubbing can't drift from the tweened path.
  private applyInstant(name: string, sign: 1 | -1): void {
    const spec = parseMove(name);
    if (!spec) return;
    const dir = (spec.dir * sign) as 1 | -1;
    const turn = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[spec.axis], dir * QUARTER);
    for (const slice of spec.slices) {
      for (const cubie of this.cube.cubiesOnLayer(spec.axis, slice)) {
        cubie.mesh.position.applyQuaternion(turn);
        // Positions are exact lattice points; snap to kill float drift from
        // the thousands of applies a long scrub session can accumulate.
        cubie.mesh.position.set(
          Math.round(cubie.mesh.position.x / STEP) * STEP,
          Math.round(cubie.mesh.position.y / STEP) * STEP,
          Math.round(cubie.mesh.position.z / STEP) * STEP
        );
        cubie.mesh.quaternion.premultiply(turn).normalize();
        _internal.rotateCoord(cubie.coord, spec.axis, dir);
        cubie.cubelet.rotate(spec.axis, dir);
      }
    }
  }

  // Show move `index` mid-turn without baking it. Base transforms are cached so
  // the rotation is recomputed from clean state every frame (no accumulation).
  private setPartial(index: number, frac: number): void {
    const spec = parseMove(this.moves[index]);
    if (!spec) return;
    const angle = spec.dir * QUARTER * easeInOut(frac);
    const turn = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[spec.axis], angle);
    const affected: Partial['affected'] = [];
    for (const slice of spec.slices) {
      for (const cubie of this.cube.cubiesOnLayer(spec.axis, slice)) {
        affected.push({
          cubie,
          position: cubie.mesh.position.clone(),
          quaternion: cubie.mesh.quaternion.clone()
        });
        cubie.mesh.position.applyQuaternion(turn);
        cubie.mesh.quaternion.premultiply(turn);
      }
    }
    this.partial = { index, affected };
  }

  private clearPartial(): void {
    if (!this.partial) return;
    for (const { cubie, position, quaternion } of this.partial.affected) {
      cubie.mesh.position.copy(position);
      cubie.mesh.quaternion.copy(quaternion);
    }
    this.partial = null;
  }
}
