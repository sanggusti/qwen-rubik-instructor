// The reference ("demo") cube shown in the hint window. It serves two masters:
//   - lesson "Show me how": seed to a state, play a sequence once, hold.
//   - walkthrough player: the walkthrough engine drives it move-by-move and sets
//     per-beat piece highlights — so all the teaching animation happens here, not
//     on the learner's own cube.
// Framework-free so a thin Svelte wrapper can render its root and pump update().

import { CubeMesh } from './cube';
import { MoveAnimator } from './animator';
import { CubeView } from './cube-view';
import { paintCubeFromState } from './paint-from-state';
import type { CubeletType } from './cubelets';
import type { State } from '../cube/state';

// A touch slower than the live cube (220ms) so demonstrated turns read clearly.
const DEMO_MOVE_MS = 320;

export class DemoCubeController {
  readonly root: CubeMesh['root'];
  private cube: CubeMesh;
  private readonly animator: MoveAnimator;
  private readonly view: CubeView;
  private played = 0;
  private readonly defaultMs: number;
  // Called with the index of each move as it finishes (lesson chip highlighting).
  onMoveApplied?: (index: number) => void;

  constructor(durationMs = DEMO_MOVE_MS) {
    this.defaultMs = durationMs;
    this.cube = new CubeMesh();
    this.root = this.cube.root;
    this.animator = new MoveAnimator(this.cube, this.cube.root, durationMs);
    this.view = new CubeView(this.cube);
    this.animator.onMoveComplete = () => {
      this.onMoveApplied?.(this.played);
      this.played += 1;
    };
  }

  // Lesson path: seed to a state, then play a sequence once and hold.
  seedAndPlay(state: State, moves: string[]): void {
    this.seedFromState(state);
    for (const m of moves) this.animator.enqueue(m);
  }

  // Paint the reference cube to mirror `state` (solved-geometry cube recoloured).
  seedFromState(state: State): void {
    this.animator.cancel();
    this.rebuild();
    paintCubeFromState(this.cube, state);
    this.played = 0;
  }

  // --- Walkthrough player API (drives the reference cube) ---
  reset(): void {
    this.animator.cancel();
    this.rebuild();
    this.played = 0;
  }

  applyMoves(moves: string[]): { accepted: string[]; rejected: string[] } {
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const m of moves) {
      if (this.animator.enqueue(m)) accepted.push(m);
      else rejected.push(m);
    }
    return { accepted, rejected };
  }

  isBusy(): boolean {
    return this.animator.isBusy();
  }

  setMoveDuration(ms?: number): void {
    this.animator.durationMs = ms ?? this.defaultMs;
  }

  highlight(type: CubeletType | null, opts?: { fadeMs?: number }): void {
    this.view.highlight(type, opts);
  }

  update(now: number): void {
    this.animator.update(now);
    this.view.update(now);
  }

  // Replace the cube's cubies with a fresh solved set, reusing the same root Group
  // so the Threlte <T is={root}> binding stays valid, and rebind the view so its
  // per-cubie material cache tracks the new meshes.
  private rebuild(): void {
    this.cube.root.clear();
    this.cube.cubies.length = 0;
    const fresh = new CubeMesh();
    for (const c of fresh.cubies) {
      this.cube.root.add(c.mesh);
      this.cube.cubies.push(c);
    }
    this.view.rebind();
  }
}
