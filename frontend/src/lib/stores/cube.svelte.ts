// Reactive replacement for the old window.rubikInstructor global + the
// closure-based state/moveSubscribers in main.ts. CubeMesh.svelte owns the
// actual Three.js animator (per Phase 2/3's deviation from bind:ref) and
// binds its imperative controls in here via bind(), so this store can stay a
// plain reactive façade: applyMoves/scramble/reset plus state/isBusy/isSolved.

import { applyMove, cloneState, isSolved as isSolvedState, solvedState, type State } from '../cube/state';
import { generateScramble } from '../cube/scramble';

export interface CubeAnimatorControls {
  enqueue(move: string): boolean;
  isBusy(): boolean;
  reset(): void;
  setMoveDuration(ms?: number): void;
  /** Abandon the in-flight move and drain the queue without applying. */
  cancel(): void;
  /** Rebuild solved geometry and repaint stickers from an arbitrary state. */
  seedFromState(state: State): void;
}

const VALID_MOVE = /^([UDLRFBMESxyz])('?)$/;

class CubeStore {
  state: State = $state(solvedState());
  isBusy: boolean = $state(false);
  isSolved: boolean = $derived(isSolvedState(this.state));

  private readonly moveSubscribers = new Set<(move: string, state: State) => void>();
  private readonly resetSubscribers = new Set<() => void>();
  private readonly scrambleSubscribers = new Set<(moves: string[]) => void>();
  private readonly loadSubscribers = new Set<(state: State) => void>();
  private controls: CubeAnimatorControls | null = null;

  bind(controls: CubeAnimatorControls): void {
    this.controls = controls;
  }

  unbind(): void {
    this.controls = null;
  }

  applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] } {
    const arr = typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves;
    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const m of arr) {
      if (!VALID_MOVE.test(m) || !this.controls?.enqueue(m)) { rejected.push(m); continue; }
      accepted.push(m);
    }
    if (accepted.length) this.isBusy = true;
    return { accepted, rejected };
  }

  scramble(length = 20): string[] {
    const seq = generateScramble(length);
    for (const m of seq) this.controls?.enqueue(m);
    if (seq.length) this.isBusy = true;
    for (const fn of this.scrambleSubscribers) fn(seq);
    return seq;
  }

  reset(): void {
    if (!this.controls || this.controls.isBusy()) return;
    this.controls.reset();
    this.state = solvedState();
    this.isBusy = false;
    for (const fn of this.resetSubscribers) fn();
  }

  setMoveDuration(ms?: number): void {
    this.controls?.setMoveDuration(ms);
  }

  /**
   * Load an arbitrary facelet state (e.g. scanned from a physical cube).
   * Cancels any in-flight animation, rebuilds solved geometry, repaints the
   * stickers, and notifies onLoadState subscribers — challenge anti-cheat
   * treats this like a reset/scramble.
   */
  loadState(state: State): void {
    if (!this.controls) return;
    this.controls.cancel();
    this.controls.seedFromState(state);
    this.state = cloneState(state);
    this.isBusy = false;
    for (const fn of this.loadSubscribers) {
      try { fn(cloneState(state)); } catch (e) { console.error(e); }
    }
  }

  getState(): State {
    return cloneState(this.state);
  }

  /** Subscribe to completed moves (after each animated quarter-turn settles). */
  onMove(fn: (move: string, state: State) => void): () => void {
    this.moveSubscribers.add(fn);
    return () => this.moveSubscribers.delete(fn);
  }

  /** Subscribe to whole-cube resets (Reset button / Enter key / Guide reset). */
  onReset(fn: () => void): () => void {
    this.resetSubscribers.add(fn);
    return () => this.resetSubscribers.delete(fn);
  }

  /** Subscribe to scrambles (Scramble buttons / Space key). */
  onScramble(fn: (moves: string[]) => void): () => void {
    this.scrambleSubscribers.add(fn);
    return () => this.scrambleSubscribers.delete(fn);
  }

  /** Subscribe to full-state loads (physical-cube scans). */
  onLoadState(fn: (state: State) => void): () => void {
    this.loadSubscribers.add(fn);
    return () => this.loadSubscribers.delete(fn);
  }

  // Called by CubeMesh.svelte when the keyboard Space shortcut scrambles
  // directly on the animator (bypassing scramble() above).
  handleExternalScramble(moves: string[]): void {
    for (const fn of this.scrambleSubscribers) fn(moves);
  }

  // Called by CubeMesh.svelte's animator hooks.
  handleMoveStart(): void {
    this.isBusy = true;
  }

  handleMoveComplete(move: string): void {
    applyMove(this.state, move);
    this.state = cloneState(this.state);
    this.isBusy = this.controls?.isBusy() ?? false;
    for (const fn of this.moveSubscribers) {
      try { fn(move, cloneState(this.state)); } catch (e) { console.error(e); }
    }
  }
}

export const cubeStore = new CubeStore();
