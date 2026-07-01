// Wraps LessonEngine, re-exposing its existing .subscribe() as a rune so
// LessonsPanel.svelte reads lessonStore.snapshot reactively instead of
// manually re-rendering on a callback (today's main.ts pattern).

import { LessonEngine, type EngineState, type LessonApi } from '../education/lesson_engine';
import { LESSON_CATALOG } from '../education/lesson_catalog';
import type { Lesson, LessonStep, LessonTrack } from '../education/lesson_types';
import { cubeStore } from './cube.svelte';
import { demoStore } from './demo.svelte';
import { applyMove, solvedState, type State } from '../cube/state';

function storage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

const lessonApi: LessonApi = {
  applyMoves: (moves) => cubeStore.applyMoves(moves),
  getState: () => cubeStore.getState(),
  isSolved: () => cubeStore.isSolved,
  reset: () => cubeStore.reset(),
  onMove: (fn) => cubeStore.onMove(fn)
};

class LessonStore {
  snapshot: EngineState = $state({ lesson: null });

  private readonly engine = new LessonEngine(lessonApi, LESSON_CATALOG, storage());

  constructor() {
    this.engine.subscribe((s) => { this.snapshot = s; });
    cubeStore.onReset(() => this.engine.handleCubeReset());
  }

  getLessons(track?: LessonTrack): Lesson[] {
    return this.engine.getLessons(track);
  }

  getCurrentLesson(): Lesson | null {
    return this.engine.getCurrentLesson();
  }

  loadGenerated(lesson: Lesson): void { this.engine.loadGenerated(lesson); }
  selectLesson(id: string): void { this.engine.selectLesson(id); }
  closeLesson(): void {
    this.engine.closeLesson();
    if (demoStore.source === 'lesson') demoStore.close();
  }
  next(): void { this.engine.next(); }
  previous(): void { this.engine.previous(); }
  markComplete(): void { this.engine.markComplete(); }
  resetLesson(): void { this.engine.resetLesson(); }
  applySetupMoves(): void { this.engine.applySetupMoves(); }
  applyExampleMoves(): void { this.engine.applyExampleMoves(); }

  // Open the demo window showing the current step's moves from its checkpoint.
  showDemo(): void {
    const step = this.engine.getCurrentStep();
    if (!step?.expectedMoves?.length) return;
    demoStore.openFor({
      source: 'lesson',
      seedState: this.checkpointState(step),
      moves: step.expectedMoves,
      title: step.title
    });
  }

  // Rescue for a scrambled attempt: rebuild the step's starting position and
  // re-run the demo from it. Reuses the engine's existing resetStep.
  backToCheckpoint(): void {
    this.engine.resetStep();
    if (demoStore.open && demoStore.source === 'lesson') this.showDemo();
  }

  // The step's starting position: solved + setup moves for a drill step (exact),
  // otherwise the live cube (best effort for solve/manual steps with no setup).
  private checkpointState(step: LessonStep): State {
    if (step.setupMoves?.length) {
      const s = solvedState();
      for (const m of step.setupMoves) applyMove(s, m);
      return s;
    }
    return cubeStore.getState();
  }
}

export const lessonStore = new LessonStore();
