// Wraps LessonEngine, re-exposing its existing .subscribe() as a rune so
// LessonsPanel.svelte reads lessonStore.snapshot reactively instead of
// manually re-rendering on a callback (today's main.ts pattern).

import { LessonEngine, type EngineState, type LessonApi } from '../education/lesson_engine';
import { LESSON_CATALOG } from '../education/lesson_catalog';
import type { Lesson, LessonTrack } from '../education/lesson_types';
import { cubeStore } from './cube.svelte';

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
  closeLesson(): void { this.engine.closeLesson(); }
  next(): void { this.engine.next(); }
  previous(): void { this.engine.previous(); }
  markComplete(): void { this.engine.markComplete(); }
  resetLesson(): void { this.engine.resetLesson(); }
  applySetupMoves(): void { this.engine.applySetupMoves(); }
  applyExampleMoves(): void { this.engine.applyExampleMoves(); }
}

export const lessonStore = new LessonStore();
