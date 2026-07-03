// Reactive façade for the hint window's reference cube. Two drivers:
//   - lesson "Show me how": openFor() seeds a state + move list, played once.
//   - walkthrough: openForWalkthrough() shows the window and the walkthrough engine
//     drives the reference cube move-by-move via the cube API below (applyMoves /
//     reset / highlight / …). DemoScene binds the actual controller in here.

import type { State } from '../cube/state';
import type { CubeletType } from '../scene/cubelets';
import SCENE_CONFIG from '../config/scene-config';

export type DemoSource = 'lesson' | 'walkthrough';

export interface DemoOpen {
  source: DemoSource;
  seedState: State;
  moves: string[];
  title?: string;
}

// The imperative controls DemoScene binds so the walkthrough can drive the cube.
export interface DemoCubeControls {
  applyMoves(moves: string[]): { accepted: string[]; rejected: string[] };
  reset(): void;
  isBusy(): boolean;
  setMoveDuration(ms?: number): void;
  highlight(type: CubeletType | null, opts?: { fadeMs?: number }): void;
  seedFromState(state: State): void;
}

// How far the user's cube slides left (world units) during a lesson demo, so the
// docked card doesn't cover it. Walkthroughs leave the user cube alone.
const MAIN_CUBE_SHIFT = -2.4;

class DemoStore {
  open = $state(false);
  // True while the Guide modal (any tab) is open — used to slide the cube up
  // so it stays visible above the modal backdrop.
  modalOpen = $state(false);
  source: DemoSource | null = $state(null);
  seedState: State | null = $state(null);
  moves: string[] = $state([]);
  title = $state('');
  // -1 = nothing applied yet; the index of the move currently shown as applied.
  activeIndex = $state(-1);
  // Bumped to (re)seed and play once — the lesson "Show me how" path.
  playToken = $state(0);
  // Bumped to (re)seed the reference cube for a walkthrough (no auto-play).
  seedToken = $state(0);

  private controls: DemoCubeControls | null = null;

  bindCube(c: DemoCubeControls): void {
    this.controls = c;
  }
  unbindCube(): void {
    this.controls = null;
  }

  // Only the lesson demo nudges the user cube aside; a walkthrough plays entirely
  // in the window and leaves the user cube untouched.
  get mainCubeShift(): number {
    if (!this.open || this.source !== 'lesson' || SCENE_CONFIG.isMobile) return 0;
    return MAIN_CUBE_SHIFT;
  }

  // --- Lesson "Show me how" ---
  openFor(o: DemoOpen): void {
    this.source = o.source;
    this.seedState = o.seedState;
    this.moves = o.moves.slice();
    this.title = o.title ?? '';
    this.activeIndex = -1;
    this.open = true;
    this.playToken += 1;
  }
  replay(): void {
    if (!this.open) return;
    this.activeIndex = -1;
    this.playToken += 1;
  }

  // --- Walkthrough ---
  openForWalkthrough(title: string): void {
    this.source = 'walkthrough';
    this.seedState = null;
    this.moves = [];
    this.title = title;
    this.activeIndex = -1;
    this.open = true;
  }
  // Reflect the current beat's moves in the chip bar.
  setBeat(moves: string[], activeIndex: number, title: string): void {
    this.moves = moves.slice();
    this.activeIndex = activeIndex;
    this.title = title;
  }
  // Seed the reference cube to a state (e.g. the learner's scramble). Bumps
  // seedToken so DemoScene reseeds even if it binds after this call.
  seed(state: State): void {
    this.seedState = state;
    this.seedToken += 1;
  }

  // Cube API forwarded to the bound controller (used by the walkthrough engine).
  applyMoves(moves: string[]): { accepted: string[]; rejected: string[] } {
    return this.controls?.applyMoves(moves) ?? { accepted: [], rejected: moves.slice() };
  }
  reset(): void {
    this.controls?.reset();
  }
  isBusy(): boolean {
    return this.controls?.isBusy() ?? false;
  }
  setMoveDuration(ms?: number): void {
    this.controls?.setMoveDuration(ms);
  }
  highlight(type: CubeletType | null, opts?: { fadeMs?: number }): void {
    this.controls?.highlight(type, opts);
  }

  setActiveIndex(i: number): void {
    this.activeIndex = i;
  }

  close(): void {
    this.open = false;
    this.source = null;
    this.seedState = null;
    this.moves = [];
    this.title = '';
    this.activeIndex = -1;
  }
}

export const demoStore = new DemoStore();
