// The engine is framework-free TypeScript. It tracks the selected lesson,
// current step, completed steps and per-step move history, validates steps
// after each cube move, persists progress, and notifies UI subscribers.

import { Emitter } from '../core/events';
import { invertMove, type State } from '../core/state';
import type { Lesson, LessonStep, LessonTrack } from './lesson_types';
import { validateStep } from './lesson_validator';
import { buildCoachingMessages, trailingPrefixLength, type CoachingMessage } from './coaching';
import { loadProgress, saveProgress, clearProgress, type StorageLike } from './lesson_progress';
import { recordStageResult } from './profile';

// The slice of the cube API the engine needs. Keeping it narrow lets tests
// supply a lightweight fake instead of the full window.rubikInstructor.
export interface LessonApi {
    applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
    getState(): State;
    isSolved(): boolean;
    reset(): void;
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
    /** The single move the learner should make next, for the rescue button. */
    nextMove: string | null;
    /** The learner's moves on this step so far (for the in-lesson history view). */
    moveHistory: string[];
}

export type EngineState =
    | { lesson: null }
    | ({ lesson: Lesson } & LessonView);

export class LessonEngine {
    private readonly api: LessonApi;
    private readonly lessons: Lesson[];
    private readonly storage: StorageLike | null;
    private readonly now: () => number;
    private readonly emitter = new Emitter<EngineState>();
    private readonly unsubscribeMove: () => void;

    private current: Lesson | null = null;
    private stepIndex = 0;
    private completedStepIds: string[] = [];
    private moveHistory: string[] = [];
    // Moves applied programmatically as step setup should not count toward
    // validation; this counter swallows the matching onMove callbacks.
    private pendingSetupMoves = 0;
    // Performance signals for the current attempt, folded into the learner's
    // profile on completion so the backend can adapt (see profile.ts).
    private startedAt: number | null = null; // first counted move starts the clock
    private mistakeCount = 0; // off-track moves on sequence steps this attempt
    private stepMistakes = 0; // off-track moves on the CURRENT step, for escalation
    private recorded = false; // guard so a completed lesson records exactly once

    constructor(
        api: LessonApi,
        lessons: Lesson[],
        storage: StorageLike | null,
        now: () => number = () => Date.now()
    ) {
        this.api = api;
        this.lessons = lessons;
        this.storage = storage;
        this.now = now;
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
        const generated = { ...lesson, generated: true };
        const existing = this.lessons.findIndex((l) => l.id === generated.id);
        if (existing >= 0) this.lessons.splice(existing, 1);
        this.lessons.push(generated);
        this.selectLesson(generated.id);
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
        this.resetAttemptSignals();
        this.applySetupMoves();
        this.persist();
        this.emit();
    }

    private resetAttemptSignals(): void {
        this.startedAt = null;
        this.mistakeCount = 0;
        this.stepMistakes = 0;
        this.recorded = false;
    }

    // The next move the learner should make (the one after their longest correct
    // trailing run). Works for sequence steps and for solve stages graded by cube
    // state (which carry their moves in expectedMoves). Null otherwise.
    nextExpectedMove(): string | null {
        const moves = this.gradedMoves();
        if (!moves.length) return null;
        const matched = trailingPrefixLength(this.moveHistory, moves);
        return moves[Math.min(matched, moves.length - 1)] ?? null;
    }

    // The ordered moves this step is graded against, if any: a sequence step's
    // own moves, or a solve/cubeSolved stage's expectedMoves. Empty for manual.
    private gradedMoves(): string[] {
        const step = this.getCurrentStep();
        if (!step) return [];
        if (step.validator.type === 'moveSequence') return step.validator.moves;
        if (step.validator.type === 'cubeState') return step.expectedMoves ?? [];
        if (step.validator.type === 'cubeSolved') return step.expectedMoves ?? [];
        return [];
    }

    // Apply the single next expected move for the learner (the "Do next move"
    // rescue). No-op when the step has no graded moves to fall back on.
    doNextMove(): void {
        const move = this.nextExpectedMove();
        if (move) this.api.applyMoves([move]);
    }

    // Step the learner back through their own turns: drop the last recorded move
    // and animate its inverse. The inverse is swallowed (pendingSetupMoves) so it
    // doesn't re-enter the history or count as a move.
    undoLastMove(): void {
        if (!this.moveHistory.length) return;
        const last = this.moveHistory.pop()!;
        this.pendingSetupMoves += 1;
        this.api.applyMoves([invertMove(last)]);
        this.emit();
    }

    // Apply moves on the learner's behalf (e.g. a solver's "get unstuck" path)
    // without counting them as the learner's turns — same swallow mechanism as
    // setup. Used to demonstrate a recovery from the live cube state.
    applyAssistMoves(moves: string[]): void {
        if (!moves.length) return;
        this.pendingSetupMoves += moves.length;
        this.api.applyMoves(moves);
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
            this.stepMistakes = 0;
            this.pendingSetupMoves = 0;
            this.applySetupMoves();
            this.persist();
            this.emit();
        }
    }

    previous(): void {
        if (!this.current) return;
        if (this.stepIndex > 0) {
            this.stepIndex -= 1;
            this.moveHistory = [];
            this.stepMistakes = 0;
            this.pendingSetupMoves = 0;
            this.applySetupMoves();
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
        this.resetAttemptSignals();
        this.applySetupMoves();
        this.persist();
        this.emit();
    }

    // Apply the current step's setup moves (the inverse of the drilled algorithm)
    // so it scrambles into a position the algorithm solves. Called automatically
    // whenever a setup-bearing step becomes current (mirrors PracticeEngine), and
    // by the "Set up step" button for a fresh attempt. The pendingSetupMoves
    // counter swallows the resulting onMove callbacks so they don't count as the
    // learner's own moves. Setup assumes a solved start (it's the inverse of the
    // algorithm), so we reset the cube first to clear any leftover scramble from
    // an earlier step — otherwise the setup lands on the wrong state.
    applySetupMoves(): void {
        const step = this.getCurrentStep();
        if (!step?.setupMoves?.length) return;
        this.api.reset(); // clears moveHistory + pendingSetupMoves via handleCubeReset
        this.pendingSetupMoves += step.setupMoves.length;
        this.api.applyMoves(step.setupMoves);
    }

    // Rescue: drop the learner's moves and rebuild the step's starting position
    // (solved, then setup re-applied). Backs the "Reset moves" button.
    resetStep(): void {
        const step = this.getCurrentStep();
        if (!step) return;
        this.moveHistory = [];
        this.stepMistakes = 0;
        this.pendingSetupMoves = 0;
        if (step.setupMoves?.length) this.applySetupMoves();
        else this.api.reset();
        this.emit();
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
            // Once setup settles, refresh so the panel reflects the scrambled
            // (post-setup) state rather than the pre-setup snapshot.
            if (this.pendingSetupMoves === 0) this.emit();
            return;
        }
        if (this.startedAt === null) this.startedAt = this.now(); // first counted move
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
            this.countMistake();
            this.emit();
        }
    }

    // A move that leaves a graded step off-track (not a valid prefix of its
    // expected moves) counts as a mistake — a coarse "struggled here" signal.
    // Covers sequence steps and solve stages (graded by cube state).
    private countMistake(): void {
        const moves = this.gradedMoves();
        if (!moves.length) return;
        if (trailingPrefixLength(this.moveHistory, moves) === 0) {
            this.mistakeCount += 1;
            this.stepMistakes += 1;
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
            this.stepMistakes = 0;
            this.pendingSetupMoves = 0;
            this.applySetupMoves();
            this.persist();
        }
        if (this.isLessonCompleted()) this.recordCompletion();
        this.emit();
    }

    // Fold this attempt's performance into the learner profile, exactly once.
    private recordCompletion(): void {
        if (!this.current || this.recorded) return;
        this.recorded = true;
        const durationMs = this.startedAt !== null ? this.now() - this.startedAt : undefined;
        recordStageResult(
            {
                stage: this.current.stage ?? this.current.id,
                label: this.current.title,
                mistakes: this.mistakeCount,
                durationMs
            },
            this.storage
        );
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
            nextLessonTitle: this.getNextLessonTitle(),
            stepMistakes: this.stepMistakes
        });
        return {
            lesson: this.current,
            step,
            stepIndex: this.stepIndex,
            stepCount: this.current.steps.length,
            completedStepIds: this.completedStepIds.slice(),
            stepCompleted,
            lessonCompleted,
            coachingMessages,
            nextMove: this.nextExpectedMove(),
            moveHistory: this.moveHistory.slice()
        };
    }

    private emit(): void {
        this.emitter.emit(this.snapshot());
    }
}

