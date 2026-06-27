// The Practice engine is framework-free TypeScript, mirroring LessonEngine. It
// tracks the selected drill, current round, per-attempt move history, score and
// completion, evaluates after each cube move, and notifies UI subscribers. It
// holds no persistence: practice state is in-memory only.

import { Emitter } from '../core/events';
import type { State } from '../core/state';
import type { Drill, EvaluationResult } from './practice_types';
import { findDrill } from './drill_generator';
import { evaluate } from './evaluation';

// The slice of the cube API the engine needs. Keeping it narrow lets tests
// supply a lightweight fake instead of the full window.rubikInstructor.
export interface PracticeApi {
    applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
    getState(): State;
    isSolved(): boolean;
    onMove(fn: (move: string, state: State) => void): () => void;
}

export interface PracticeView {
    drill: Drill;
    round: number;
    roundCount: number;
    score: number;
    completed: boolean;
    evaluation: EvaluationResult;
}

export type PracticeState =
    | { drill: null }
    | ({ drill: Drill } & PracticeView);

export class PracticeEngine {
    private readonly api: PracticeApi;
    private readonly drills: Drill[];
    private readonly emitter = new Emitter<PracticeState>();
    private readonly unsubscribeMove: () => void;

    private current: Drill | null = null;
    private round = 0;
    private score = 0;
    private completed = false;
    private moveHistory: string[] = [];
    // Moves applied programmatically as drill setup must not count toward
    // evaluation; this counter swallows the matching onMove callbacks.
    private pendingSetupMoves = 0;

    constructor(api: PracticeApi, drills: Drill[]) {
        this.api = api;
        this.drills = drills;
        this.unsubscribeMove = api.onMove((move) => this.handleMove(move));
    }

    getDrills(): Drill[] {
        return this.drills.slice();
    }

    getCurrentDrill(): Drill | null {
        return this.current;
    }

    subscribe(fn: (state: PracticeState) => void): () => void {
        const off = this.emitter.on(fn);
        fn(this.snapshot());
        return off;
    }

    selectDrill(id: string): void {
        const drill = findDrill(this.drills, id);
        if (!drill) return;
        this.current = drill;
        this.startRound(0, 0);
    }

    closeDrill(): void {
        this.current = null;
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.emit();
    }

    resetDrill(): void {
        if (!this.current) return;
        this.startRound(0, 0);
    }

    applySetupMoves(): void {
        if (!this.current?.setupMoves?.length) return;
        this.pendingSetupMoves += this.current.setupMoves.length;
        this.api.applyMoves(this.current.setupMoves);
    }

    applyExampleMoves(): void {
        if (!this.current?.expectedMoves?.length) return;
        this.api.applyMoves(this.current.expectedMoves);
    }

    // Called by the host when the whole cube is reset, so per-attempt history
    // doesn't carry stale moves across a fresh cube.
    handleCubeReset(): void {
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        this.emit();
    }

    dispose(): void {
        this.unsubscribeMove();
    }

    private roundCount(): number {
        return this.current?.rounds ?? 1;
    }

    // Begin (or restart) at a given round with a given score, applying any setup
    // moves so the drill is immediately playable.
    private startRound(round: number, score: number): void {
        if (!this.current) return;
        this.round = round;
        this.score = score;
        this.completed = false;
        this.moveHistory = [];
        this.pendingSetupMoves = 0;
        if (this.current.setupMoves?.length) {
            this.pendingSetupMoves += this.current.setupMoves.length;
            this.api.applyMoves(this.current.setupMoves);
        }
        this.emit();
    }

    private handleMove(move: string): void {
        if (!this.current || this.completed) return;
        if (this.pendingSetupMoves > 0) {
            this.pendingSetupMoves -= 1;
            // Once setup settles, refresh so the panel reflects the new state
            // rather than the pre-setup (often solved) snapshot.
            if (this.pendingSetupMoves === 0) this.emit();
            return;
        }
        this.moveHistory.push(move);
        const result = evaluate(this.current, this.moveHistory, this.api.getState());
        if (result.status === 'correct') {
            this.completeRound();
        } else {
            this.emit();
        }
    }

    private completeRound(): void {
        if (!this.current) return;
        const nextScore = this.score + 1;
        if (this.round < this.roundCount() - 1) {
            // Advance to the next round, re-applying setup for the fresh attempt.
            this.startRound(this.round + 1, nextScore);
        } else {
            this.score = nextScore;
            this.completed = true;
            this.moveHistory = [];
            this.emit();
        }
    }

    private snapshot(): PracticeState {
        if (!this.current) return { drill: null };
        const evaluation: EvaluationResult = this.completed
            ? { status: 'correct', message: 'Drill complete.' }
            : evaluate(this.current, this.moveHistory, this.api.getState());
        return {
            drill: this.current,
            round: this.round,
            roundCount: this.roundCount(),
            score: this.score,
            completed: this.completed,
            evaluation
        };
    }

    private emit(): void {
        this.emitter.emit(this.snapshot());
    }
}
