// Wraps PracticeEngine, mirroring lesson.svelte.ts: re-exposes .subscribe()
// as a rune so PracticePanel.svelte reads practiceStore.snapshot reactively.

import { PracticeEngine, type PracticeApi, type PracticeState } from '../education/practice_engine';
import { PRACTICE_DRILLS } from '../education/practice_drills';
import type { Drill } from '../education/practice_types';
import { cubeStore } from './cube.svelte';

const practiceApi: PracticeApi = {
  applyMoves: (moves) => cubeStore.applyMoves(moves),
  getState: () => cubeStore.getState(),
  isSolved: () => cubeStore.isSolved,
  onMove: (fn) => cubeStore.onMove(fn)
};

class PracticeStore {
  snapshot: PracticeState = $state({ drill: null });

  private readonly engine = new PracticeEngine(practiceApi, PRACTICE_DRILLS);

  constructor() {
    this.engine.subscribe((s) => { this.snapshot = s; });
    cubeStore.onReset(() => this.engine.handleCubeReset());
  }

  getDrills(): Drill[] { return this.engine.getDrills(); }
  getCurrentDrill(): Drill | null { return this.engine.getCurrentDrill(); }
  selectDrill(id: string): void { this.engine.selectDrill(id); }
  closeDrill(): void { this.engine.closeDrill(); }
  resetDrill(): void { this.engine.resetDrill(); }
  applySetupMoves(): void { this.engine.applySetupMoves(); }
  applyExampleMoves(): void { this.engine.applyExampleMoves(); }
}

export const practiceStore = new PracticeStore();
