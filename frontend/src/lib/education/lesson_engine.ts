// The engine is framework-free TypeScript. It tracks the selected lesson,
// current step, completed steps and per-step move history, validates steps
// after each cube move, persists progress, and notifies UI subscribers.

import { Emitter } from '../cube/events';
import type { State } from '../cube/state';
import type { Lesson, LessonStep, LessonTrack } from './lesson_types';
import { validateStep } from './lesson_validator';
import { buildCoachingMessages, type CoachingMessage } from './coaching';
import { loadProgress, saveProgress, clearProgress, type StorageLike } from './lesson_progress';

// The slice of the cube API the engine needs. Keeping it narrow lets tests
// supply a lightweight fake instead of the full window.rubikInstructor.
export interface LessonApi {
    applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
    getState(): State;
    isSolved(): boolean;
    onMove(fn: (move: string, state: State) => void): () => void;
}

export interface LessonView {
    lesson: Lesson;
    step: LessonStep;
    stepIndex: number;
    stepCount: number;
    completedStepIds: string[];
    stepCompleted: boolean;
    lessonCompleted: boolean;
    coachingMessages: CoachingMessage[];
}

export type EngineState =
    | { lesson: null }
    | ({ lesson: Lesson } & LessonView);

export class LessonEngine {
    private readonly api: LessonApi;
    private readonly lessons: Lesson[];
    private readonly storage: StorageLike | null;
    private readonly emitter = new Emitter<EngineState>();
    private readonly unsubscribeMove: () => void;

    private current: Lesson | null = null;
    private stepIndex = 0;
    private completedStepIds: string[] = [];
    private moveHistory: string[] = [];
    // Moves applied programmatically as step setup should not count toward
    // validation; this counter swallows the matching onMove callbacks.
    private pendingSetupMoves = 0;

    constructor(api: LessonApi, lessons: Lesson[], storage: StorageLike | null) {
        this.api = api;
        this.lessons = lessons;
        this.storage = storage;
        this.unsubscribeMove = api.onMove((move) => this.handleMove(move));
    }

    getLessons(track?: LessonTrack): Lesson[] {
        return track ? this.lessons.filter((l) => l.track === track) : this.lessons.slice();
    }

    getCurrentLesson(): Lesson | null {
        return this.current;
    }

    getCurrentStep(): LessonStep | null {
        return this.current ? this.current.steps[this.stepIndex] : null;
    }

    subscribe(fn: (state: EngineState) => void): () => void {
        const off = this.emitter.on(fn);
        fn(this.snapshot());
        return off;
    }

    // Add a runtime-generated lesson (replacing any prior one with the same id)
    // and start it. Lets backend-generated content reuse this same engine.
    loadGenerated(lesson: Lesson): void {
        const existing = this.lessons.findIndex((l) => l.id === lesson.id);
        if (existing >= 0) this.lessons.splice(existing, 1);
        this.lessons.push(lesson);
        this.selectLesson(lesson.id);
    }

    selectLesson(lessonId: string): void {
        const lesson = this.lessons.find((l) => l.id === lessonId);
        if (!lesson) return;
        this.current = lesson;
        const progress = loadProgress(lesson.id, this.storage);
        this.completedStepIds = progress.completedStepIds.filter((id) =>
            lesson.steps.some((s) => s.id === id)
        );
        const resumeIndex = progress.currentStepId
            ? lesson.steps.findIndex((s) => s.id === progress.currentStepId)
            : -1;
        this.stepIndex = resumeIndex >= 0 ? resumeIndex : 0;
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.persist();
        this.emit();
    }

    closeLesson(): void {
        this.current = null;
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.emit();
    }

    next(): void {
        if (!this.current) return;
        if (this.stepIndex < this.current.steps.length - 1) {
            this.stepIndex += 1;
            this.moveHistory = [];
            this.persist();
            this.emit();
        }
    }

    previous(): void {
        if (!this.current) return;
        if (this.stepIndex > 0) {
            this.stepIndex -= 1;
            this.moveHistory = [];
            this.persist();
            this.emit();
        }
    }

    markComplete(): void {
        const step = this.getCurrentStep();
        if (!step) return;
        this.completeStep(step);
    }

    resetLesson(): void {
        if (!this.current) return;
        clearProgress(this.current.id, this.storage);
        this.completedStepIds = [];
        this.stepIndex = 0;
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.persist();
        this.emit();
    }

    applySetupMoves(): void {
        const step = this.getCurrentStep();
        if (!step?.setupMoves?.length) return;
        this.pendingSetupMoves += step.setupMoves.length;
        this.api.applyMoves(step.setupMoves);
    }

    applyExampleMoves(): void {
        const step = this.getCurrentStep();
        if (!step?.expectedMoves?.length) return;
        this.api.applyMoves(step.expectedMoves);
    }

    // Called by the host when the whole cube is reset, so per-step history
    // doesn't carry stale moves across a fresh cube.
    handleCubeReset(): void {
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.emit();
    }

    dispose(): void {
        this.unsubscribeMove();
    }

    private handleMove(move: string): void {
        if (!this.current) return;
        if (this.pendingSetupMoves > 0) {
            this.pendingSetupMoves -= 1;
            return;
        }
        this.moveHistory.push(move);
        const step = this.getCurrentStep();
        if (!step) return;
        if (this.isStepCompleted(step)) {
            this.emit();
            return;
        }
        if (validateStep(step, this.moveHistory, this.api.getState())) {
            this.completeStep(step);
        } else {
            this.emit();
        }
    }

    private completeStep(step: LessonStep): void {
        if (!this.current) return;
        if (!this.completedStepIds.includes(step.id)) {
            this.completedStepIds.push(step.id);
        }
        this.persist();
        // Auto-advance to the next incomplete step if one exists.
        if (this.stepIndex < this.current.steps.length - 1) {
            this.stepIndex += 1;
            this.moveHistory = [];
            this.persist();
        }
        this.emit();
    }

    private isStepCompleted(step: LessonStep): boolean {
        return this.completedStepIds.includes(step.id);
    }

    private isLessonCompleted(): boolean {
        if (!this.current) return false;
        return this.current.steps.every((s) => this.completedStepIds.includes(s.id));
    }

    private getNextLessonTitle(): string | undefined {
        if (!this.current) return undefined;
        const sameTrack = this.lessons.filter((l) => l.track === this.current!.track);
        const index = sameTrack.findIndex((l) => l.id === this.current!.id);
        return index >= 0 && index < sameTrack.length - 1 ? sameTrack[index + 1].title : undefined;
    }

    private persist(): void {
        if (!this.current) return;
        const lessonCompleted = this.isLessonCompleted();
        saveProgress(
            this.current.id,
            {
                completedStepIds: this.completedStepIds.slice(),
                currentStepId: this.getCurrentStep()?.id,
                completedAt: lessonCompleted ? new Date().toISOString() : undefined
            },
            this.storage
        );
    }

    private snapshot(): EngineState {
        if (!this.current) return { lesson: null };
        const step = this.current.steps[this.stepIndex];
        const stepCompleted = this.completedStepIds.includes(step.id);
        const lessonCompleted = this.isLessonCompleted();
        const isLastStep = this.stepIndex >= this.current.steps.length - 1;
        const coachingMessages = buildCoachingMessages({
            step,
            moveHistory: this.moveHistory,
            stepCompleted,
            lessonCompleted,
            isLastStep,
            nextLessonTitle: this.getNextLessonTitle()
        });
        return {
            lesson: this.current,
            step,
            stepIndex: this.stepIndex,
            stepCount: this.current.steps.length,
            completedStepIds: this.completedStepIds.slice(),
            stepCompleted,
            lessonCompleted,
            coachingMessages
        };
    }

    private emit(): void {
        this.emitter.emit(this.snapshot());
    }
}

