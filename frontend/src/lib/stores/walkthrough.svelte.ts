// Wraps WalkthroughEngine. The engine now drives the hint window's *reference*
// cube (via demoStore) and sets its per-beat highlights there — so all the
// teaching animation happens in the window and the learner's own cube is left
// untouched. Two buttons let the learner opt in: "Solve my cube" applies the
// solution to their cube, "Reset to checkpoint" puts it back so they can try.

import { WalkthroughEngine, type WalkthroughApi, type WalkthroughState, type Walkthrough } from '../education/walkthrough';
import { WALKTHROUGHS } from '../education/walkthroughs';
import { cubeStore } from './cube.svelte';
import { demoStore } from './demo.svelte';
import { invertMove } from '../cube/state';

// Fast per-move time for the "Reset to checkpoint" rewind on the user's cube.
const RESET_MOVE_MS = 60;

// The engine drives the reference cube in the hint window, not the user's cube.
const walkthroughApi: WalkthroughApi = {
  applyMoves: (moves) =>
    demoStore.applyMoves(typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves),
  reset: () => demoStore.reset(),
  isBusy: () => demoStore.isBusy(),
  setMoveDuration: (ms) => demoStore.setMoveDuration(ms)
};

class WalkthroughStore {
  snapshot: WalkthroughState = $state({ walkthrough: null });
  // Whether the learner has pressed "Solve my cube" for the active walkthrough.
  userCubeSolved = $state(false);
  // Live progress while the solution animates on the user's cube (long solves
  // take ~30s at learner pace — without this there's no cue anything is happening).
  applyProgress = $state<{ done: number; total: number } | null>(null);
  // Moves applied to the user's cube by the button, so "Reset" can undo exactly.
  private userApplied: string[] = [];

  private readonly engine = new WalkthroughEngine(
    walkthroughApi,
    WALKTHROUGHS,
    (type, opts) => demoStore.highlight(type, opts)
  );

  constructor() {
    this.engine.subscribe((s) => {
      this.snapshot = s;
      this.syncWindow(s);
    });
  }

  // Keep the window's chips in sync with the beat, and close it when the
  // walkthrough ends.
  private syncWindow(s: WalkthroughState): void {
    if (!s.walkthrough) {
      if (demoStore.source === 'walkthrough') demoStore.close();
      return;
    }
    demoStore.setBeat(s.beat.moves ?? [], s.moveIndex, s.walkthrough.title);
  }

  getWalkthroughs(): Walkthrough[] {
    return this.engine.getWalkthroughs();
  }
  isPlaying(): boolean {
    return this.engine.isPlaying();
  }
  loadGenerated(walkthrough: Walkthrough): void {
    // engine.loadGenerated adds + selects internally, which bypasses the store's
    // select (window open + reference-cube seed) — so run that select too.
    this.engine.loadGenerated(walkthrough);
    this.select(walkthrough.id);
  }

  select(id: string): void {
    const wt = this.engine.getWalkthroughs().find((w) => w.id === id);
    if (!wt) return;
    this.clearUserCube();
    demoStore.openForWalkthrough(wt.title);
    // Seed the reference cube: a solve mirrors the learner's scramble; built-in
    // demos start from solved (the engine's reset drives that once bound).
    if (wt.startFromCurrent) demoStore.seed(cubeStore.getState());
    else demoStore.reset();
    this.engine.select(id);
  }

  close(): void {
    this.engine.close();
    this.clearUserCube();
  }
  play(): void {
    this.engine.play();
  }
  pause(): void {
    this.engine.pause();
  }
  stop(): void {
    this.engine.stop();
  }
  next(): void {
    this.engine.next();
  }
  previous(): void {
    this.engine.previous();
  }

  // --- User-cube opt-in actions (the only things that touch the learner's cube) ---

  // The moves the walkthrough would apply to the user's cube (skips the scramble
  // beat of a solve, which the user's cube already holds).
  private solutionMoves(): string[] {
    const w = this.snapshot.walkthrough;
    if (!w) return [];
    const start = w.startFromCurrent ? 1 : 0;
    return w.beats.slice(start).flatMap((b) => b.moves ?? []);
  }

  hasUserMoves(): boolean {
    return this.solutionMoves().length > 0;
  }

  solveUserCube(): void {
    if (this.userCubeSolved) return;
    const moves = this.solutionMoves();
    if (!moves.length) return;
    this.applyProgress = { done: 0, total: moves.length };
    const off = cubeStore.onMove(() => {
      const p = this.applyProgress;
      if (!p) {
        off();
        return;
      }
      const done = p.done + 1;
      this.applyProgress = done >= p.total ? null : { done, total: p.total };
      if (done >= p.total) off();
    });
    cubeStore.applyMoves(moves);
    this.userApplied = moves.slice();
    this.userCubeSolved = true;
  }

  resetUserCubeToCheckpoint(): void {
    if (this.userApplied.length) {
      const undo = this.userApplied.slice().reverse().map(invertMove);
      cubeStore.setMoveDuration(RESET_MOVE_MS);
      cubeStore.applyMoves(undo);
      const settleMs = undo.length * RESET_MOVE_MS + 300;
      setTimeout(() => cubeStore.setMoveDuration(), settleMs);
    }
    this.clearUserCube();
  }

  private clearUserCube(): void {
    this.userApplied = [];
    this.userCubeSolved = false;
    this.applyProgress = null;
  }
}

export const walkthroughStore = new WalkthroughStore();
