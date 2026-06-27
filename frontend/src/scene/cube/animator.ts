import * as THREE from 'three';
import { CubeMesh, type Axis, type Cubie } from './cube';

export interface MoveSpec {
  axis: Axis;
  // Which logical slices (-1, 0, 1) this move rotates.
  slices: number[];
  // Direction multiplier: +1 = clockwise looking from +axis toward origin.
  // For face moves, signs are chosen so move name without prime matches standard CW-from-outside.
  dir: 1 | -1;
}

// Mapping for base moves (no prime). Prime is handled by the caller (multiply dir by -1).
const BASE_MOVES: Record<string, MoveSpec> = {
  // Face turns. CW looking from outside the named face.
  // U: top layer, viewed from +Y => CW around +Y => dir +1.
  U: { axis: 'y', slices: [1], dir: 1 },
  D: { axis: 'y', slices: [-1], dir: -1 },
  R: { axis: 'x', slices: [1], dir: 1 },
  L: { axis: 'x', slices: [-1], dir: -1 },
  F: { axis: 'z', slices: [1], dir: 1 },
  B: { axis: 'z', slices: [-1], dir: -1 },
  // Slice turns: middle layer. M follows L (dir matches L), E follows D, S follows F.
  M: { axis: 'x', slices: [0], dir: -1 },
  E: { axis: 'y', slices: [0], dir: -1 },
  S: { axis: 'z', slices: [0], dir: 1 },
  // Whole-cube rotations.
  x: { axis: 'x', slices: [-1, 0, 1], dir: 1 },
  y: { axis: 'y', slices: [-1, 0, 1], dir: 1 },
  z: { axis: 'z', slices: [-1, 0, 1], dir: 1 }
};

export function parseMove(move: string): MoveSpec | null {
  const prime = move.endsWith("'");
  const base = prime ? move.slice(0, -1) : move;
  const spec = BASE_MOVES[base];
  if (!spec) return null;
  return { axis: spec.axis, slices: spec.slices, dir: (prime ? -spec.dir : spec.dir) as 1 | -1 };
}

const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

// Rotate logical lattice coords by a quarter turn around `axis` with `dir`.
// Assumes coords are integer (-1,0,1).
function rotateCoord(coord: THREE.Vector3, axis: Axis, dir: 1 | -1): void {
  const c = coord;
  if (axis === 'x') {
    const y = c.y, z = c.z;
    if (dir === 1) { c.y = -z; c.z = y; }
    else { c.y = z; c.z = -y; }
  } else if (axis === 'y') {
    const x = c.x, z = c.z;
    if (dir === 1) { c.x = z; c.z = -x; }
    else { c.x = -z; c.z = x; }
  } else {
    const x = c.x, y = c.y;
    if (dir === 1) { c.x = -y; c.y = x; }
    else { c.x = y; c.y = -x; }
  }
}

export interface MoveJob {
  name: string;
  spec: MoveSpec;
  affected: Cubie[];
}

export function buildMoveJob(cube: CubeMesh, name: string): MoveJob | null {
  const spec = parseMove(name);
  if (!spec) return null;
  const affected: Cubie[] = [];
  for (const slice of spec.slices) affected.push(...cube.cubiesOnLayer(spec.axis, slice));
  return { name, spec, affected };
}

// Animator: keeps a FIFO queue of moves. Each move:
//   1. Reparents affected cubies under a temporary pivot Group (preserving world transforms).
//   2. Tweens pivot.rotation by ±π/2 around the axis.
//   3. On complete: bakes pivot transform into each cubie, reparents back to cube.root,
//      and updates each cubie's logical lattice coord.

const QUARTER = Math.PI / 2;

interface ActiveMove {
  job: MoveJob;
  pivot: THREE.Group;
  // Cached pre-tween transforms (in cube.root frame), so we can restore exactly on finish
  // and then apply the analytic quarter-turn — avoids float drift from attach()/detach().
  preState: { cubie: Cubie; position: THREE.Vector3; quaternion: THREE.Quaternion }[];
  start: number;
  to: number;
}

export class MoveAnimator {
  // Queue holds move *names* only. The set of affected cubies is resolved at
  // execution time (beginNext), because each move changes which cubies sit in a
  // given layer. Snapshotting cubies at enqueue time corrupts batched sequences
  // like scrambles, where many moves are queued before any of them animate.
  private queue: string[] = [];
  private current: ActiveMove | null = null;
  // Per-move animation time. Mutable so callers (e.g. Watch & Learn) can slow it
  // for smoother demonstrations and restore it afterwards.
  durationMs: number;
  onMoveStart?: (name: string) => void;
  onMoveComplete?: (name: string) => void;

  constructor(private cube: CubeMesh, private parent: THREE.Object3D, durationMs = 220) {
    this.durationMs = durationMs;
  }

  enqueue(name: string): boolean {
    if (!parseMove(name)) return false;
    this.queue.push(name);
    return true;
  }

  enqueueMany(moves: string[]): void {
    for (const m of moves) this.enqueue(m);
  }

  isBusy(): boolean { return this.current !== null || this.queue.length > 0; }

  update(now: number): void {
    if (!this.current && this.queue.length > 0) this.beginNext(now);
    if (!this.current) return;
    const c = this.current;
    const t = Math.min(1, (now - c.start) / this.durationMs);
    const eased = easeInOutCubic(t);
    c.pivot.rotation[c.job.spec.axis] = c.to * eased;
    if (t >= 1) this.finishCurrent();
  }

  private beginNext(now: number): void {
    const name = this.queue.shift()!;
    // Resolve affected cubies now, against the current cube state.
    const job = buildMoveJob(this.cube, name);
    if (!job) return;
    const pivot = new THREE.Group();
    this.parent.add(pivot);
    const preState = job.affected.map(cubie => ({
      cubie,
      position: cubie.mesh.position.clone(),
      quaternion: cubie.mesh.quaternion.clone()
    }));
    for (const cubie of job.affected) pivot.attach(cubie.mesh);
    this.current = { job, pivot, preState, start: now, to: job.spec.dir * QUARTER };
    this.onMoveStart?.(job.name);
  }

  private finishCurrent(): void {
    const c = this.current!;
    const axis = AXIS_VEC[c.job.spec.axis];
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, c.to);

    for (const entry of c.preState) {
      // Reparent back to root and apply analytic quarter-turn to the pre-tween transform.
      this.parent.add(entry.cubie.mesh);
      const newPos = entry.position.clone().applyQuaternion(turn);
      const newQuat = turn.clone().multiply(entry.quaternion);
      entry.cubie.mesh.position.copy(newPos);
      entry.cubie.mesh.quaternion.copy(newQuat);
      rotateCoord(entry.cubie.coord, c.job.spec.axis, c.job.spec.dir);
      entry.cubie.cubelet.rotate(c.job.spec.axis, c.job.spec.dir);
    }
    this.parent.remove(c.pivot);
    const finishedName = c.job.name;
    this.current = null;
    this.onMoveComplete?.(finishedName);
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Utility kept for tests/debug.
export const _internal = { rotateCoord };
