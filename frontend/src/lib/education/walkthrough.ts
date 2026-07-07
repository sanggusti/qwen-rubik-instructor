// The Watch & Learn engine plays a Walkthrough: an ordered list of "beats", each
// pairing narration text with optional cube moves and/or a cubelet highlight. It
// is framework-free and mirrors the Emitter-based shape of LessonEngine /
// PracticeEngine. Playback is driven by timers: after a beat's moves are enqueued
// it waits for the animator to settle, dwells, then steps to the next beat.

import { Emitter } from '../cube/events';
import { invertMove } from '../cube/state';
import type { State } from '../cube/state';
import type { CubeletType } from '../scene/cubelets';

export interface Beat {
  text: string;
  /** Moves to animate for this beat (standard notation; no doubles like U2). */
  moves?: string[];
  /** Cubelet class to spotlight while this beat is shown. */
  highlight?: CubeletType | null;
  /** Pause after the moves settle before advancing (ms). */
  dwellMs?: number;
  /**
   * How the beat's moves play during auto-play:
   *  - 'step' (default): one move at a time, paced + announced, so a human can follow.
   *  - 'fast': all at once (used for setup/scramble beats that shouldn't be studied).
   */
  pace?: 'step' | 'fast';
  /** Solver stage id this beat narrates (e.g. 'cross'); absent for catalog beats. */
  stage?: string;
  /**
   * Exact cube state after this beat's moves (solve beats only) — physical
   * mode verifies the learner's real cube against it at stage checkpoints.
   */
  expectedState?: State | null;
}

export interface Walkthrough {
  id: string;
  title: string;
  description: string;
  beats: Beat[];
  /**
   * True for a solve of the learner's *current* cube: playback starts from the
   * cube as-is (it already holds the scramble) instead of resetting to solved and
   * re-creating the scramble. beat 0 still carries the scramble as data (for the
   * reference/demo cube), but the live cube never replays it.
   */
  startFromCurrent?: boolean;
}

// The slice of the cube API the engine needs; a narrow surface keeps tests light.
export interface WalkthroughApi {
  applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
  reset(): void;
  isBusy(): boolean;
  // Set the per-move animation time (ms); called with no argument to restore the
  // default. Used to slow demos down so the moves read clearly.
  setMoveDuration?(ms?: number): void;
}

export interface WalkthroughView {
  beat: Beat;
  beatIndex: number;
  beatCount: number;
  /** Index of the move currently playing within the beat (-1 if none). */
  moveIndex: number;
  /** Number of moves in the current beat. */
  moveCount: number;
  /** The move currently animating (for the caption badge), or null. */
  currentMove: string | null;
  playing: boolean;
  finished: boolean;
}

export type WalkthroughState =
  | { walkthrough: null }
  | ({ walkthrough: Walkthrough } & WalkthroughView);

const POLL_MS = 80;
const DEFAULT_DWELL_MS = 1100;
// Slower per-move time during playback so demonstrated turns are easy to follow.
const PLAYBACK_MOVE_MS = 380;
// Quick per-move time for 'fast' setup beats (e.g. re-creating the scramble) so
// the preview doesn't drag at the slow playback speed.
const SETUP_MOVE_MS = 50;
// Pause between consecutive moves so each turn reads as a discrete step.
const INTER_MOVE_PAUSE_MS = 260;
// How long the step's emphasis highlight is held before the cube returns to
// full colour and the moves play.
const HIGHLIGHT_EMPHASIS_MS = 900;
// Fade duration for the emphasis highlight (passed through to the view).
const HIGHLIGHT_FADE_MS = 220;

export class WalkthroughEngine {
  private readonly api: WalkthroughApi;
  private readonly walkthroughs: Walkthrough[];
  private readonly setHighlight: (type: CubeletType | null, opts?: { fadeMs?: number }) => void;
  private readonly emitter = new Emitter<WalkthroughState>();

  private current: Walkthrough | null = null;
  private beatIndex = 0;
  // Move cursor within the current beat: index of the last-applied move (-1 = none
  // applied yet), and the beat's move count. Lets play pace move-by-move and lets
  // pause/resume continue mid-beat without double-applying.
  private moveIndex = -1;
  private moveCount = 0;
  private currentMove: string | null = null;
  private playing = false;
  private finished = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    api: WalkthroughApi,
    walkthroughs: Walkthrough[],
    setHighlight: (type: CubeletType | null, opts?: { fadeMs?: number }) => void
  ) {
    this.api = api;
    this.walkthroughs = walkthroughs;
    this.setHighlight = setHighlight;
  }

  getWalkthroughs(): Walkthrough[] {
    return this.walkthroughs.slice();
  }

  getCurrent(): Walkthrough | null {
    return this.current;
  }

  /** True while a walkthrough is actively auto-playing — used to pause idle drift. */
  isPlaying(): boolean {
    return this.playing;
  }

  subscribe(fn: (state: WalkthroughState) => void): () => void {
    const off = this.emitter.on(fn);
    fn(this.snapshot());
    return off;
  }

  // Add a runtime-generated walkthrough (replacing any prior one with the same
  // id) and start it. Lets backend-generated content reuse this same player.
  loadGenerated(walkthrough: Walkthrough): void {
    const existing = this.walkthroughs.findIndex((w) => w.id === walkthrough.id);
    if (existing >= 0) this.walkthroughs.splice(existing, 1);
    this.walkthroughs.push(walkthrough);
    this.select(walkthrough.id);
  }

  select(id: string): void {
    const found = this.walkthroughs.find((w) => w.id === id);
    if (!found) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.current = found;
    if (found.startFromCurrent) {
      // The cube already holds the learner's scramble (this walkthrough was
      // generated from it), so don't reset + re-scramble. Sit on the intro beat
      // with its scramble treated as already applied; play advances into the solve.
      this.settleAtIntro(found);
    } else {
      this.seek(0);
    }
    this.emit();
  }

  // Position at beat 0 without touching the cube — the live cube is already at the
  // intro's result (the learner's scramble). moveIndex sits at the end so play()
  // advances straight into the first solving beat.
  private settleAtIntro(w: Walkthrough): void {
    const intro = w.beats[0];
    this.beatIndex = 0;
    this.moveCount = intro?.moves?.length ?? 0;
    this.moveIndex = this.moveCount - 1;
    this.currentMove = null;
    this.setHighlight(intro?.highlight ?? null);
  }

  close(): void {
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.current = null;
    this.moveIndex = -1;
    this.moveCount = 0;
    this.currentMove = null;
    this.api.setMoveDuration?.();
    this.setHighlight(null);
    this.emit();
  }

  play(): void {
    if (!this.current || this.playing) return;
    // Replay after finishing a start-from-current solve: rewind to the scramble by
    // undoing the solution (never a re-scramble), then play once settled.
    if (this.finished && this.current.startFromCurrent) {
      this.finished = false;
      this.playing = true;
      this.seekFromCurrent(0, false);
      this.emit();
      this.waitSettle(() => {
        this.api.setMoveDuration?.(PLAYBACK_MOVE_MS);
        this.resumePlayback();
      });
      return;
    }
    if (this.finished) this.seek(0);
    this.finished = false;
    this.playing = true;
    this.api.setMoveDuration?.(PLAYBACK_MOVE_MS);
    this.emit();
    this.resumePlayback();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.clearTimer();
    this.api.setMoveDuration?.();
    this.emit();
  }

  stop(): void {
    if (!this.current) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.api.setMoveDuration?.();
    this.goTo(0);
    this.emit();
  }

  // Manual forward: finish any partly-played beat, then apply the next beat's
  // moves at once (incremental, no reset) so stepping is snappy.
  next(): void {
    if (!this.current) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.api.setMoveDuration?.();
    const beat = this.current.beats[this.beatIndex];
    const moves = beat.moves ?? [];
    if (this.moveIndex < moves.length - 1) {
      const remaining = moves.slice(this.moveIndex + 1);
      if (remaining.length) this.api.applyMoves(remaining);
      this.moveIndex = moves.length - 1;
    }
    if (this.beatIndex < this.current.beats.length - 1) {
      this.beatIndex += 1;
      const nb = this.current.beats[this.beatIndex];
      const nm = nb.moves ?? [];
      if (nm.length) this.api.applyMoves(nm);
      this.moveCount = nm.length;
      this.moveIndex = nm.length - 1;
      this.setHighlight(nb.highlight ?? null);
    }
    this.currentMove = null;
    this.emit();
  }

  previous(): void {
    if (!this.current || this.beatIndex === 0) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.api.setMoveDuration?.();
    this.goTo(this.beatIndex - 1);
    this.emit();
  }

  dispose(): void {
    this.clearTimer();
  }

  // Navigate to `index`. For a start-from-current solve we rewind/advance the
  // *solution* moves relative to the live cube (never a reset + re-scramble);
  // otherwise we hard-seek from solved.
  private goTo(index: number): void {
    if (this.current?.startFromCurrent) this.seekFromCurrent(index);
    else this.seek(index);
  }

  // Hard seek via reset + cumulative replay (used by select / stop / previous).
  // Leaves the target beat fully applied (moveIndex at its last move).
  private seek(index: number): void {
    if (!this.current) return;
    this.api.reset();
    const moves: string[] = [];
    for (let k = 0; k <= index; k++) {
      const m = this.current.beats[k].moves;
      if (m?.length) moves.push(...m);
    }
    if (moves.length) this.api.applyMoves(moves);
    this.beatIndex = index;
    const beat = this.current.beats[index];
    this.moveCount = beat.moves?.length ?? 0;
    this.moveIndex = this.moveCount - 1;
    this.currentMove = null;
    this.setHighlight(beat.highlight ?? null);
  }

  // Seek without a reset: reconcile the solution moves currently on the live cube
  // with those needed at `index` by undoing the surplus (inverses) and applying
  // the remainder. beat 0 (the scramble) is never applied — the cube already holds
  // it. The reconciling burst plays fast, then the move duration is restored.
  private seekFromCurrent(index: number, restoreDuration = true): void {
    if (!this.current) return;
    const current = this.appliedSolutionMoves();
    const target: string[] = [];
    for (let k = 1; k <= index; k++) {
      const m = this.current.beats[k]?.moves;
      if (m?.length) target.push(...m);
    }
    let common = 0;
    while (common < current.length && common < target.length && current[common] === target[common]) {
      common += 1;
    }
    const burst = [...current.slice(common).reverse().map(invertMove), ...target.slice(common)];
    if (burst.length) {
      this.api.setMoveDuration?.(SETUP_MOVE_MS);
      this.api.applyMoves(burst);
      if (restoreDuration) this.restoreDurationWhenIdle();
    }
    this.beatIndex = index;
    const beat = this.current.beats[index];
    this.moveCount = beat?.moves?.length ?? 0;
    this.moveIndex = this.moveCount - 1;
    this.currentMove = null;
    this.setHighlight(beat?.highlight ?? null);
  }

  // The solution moves currently applied to the live cube (beats 1..current,
  // partial for the current beat). Excludes beat 0 — the scramble the cube already
  // holds and which we never replay.
  private appliedSolutionMoves(): string[] {
    const moves: string[] = [];
    if (!this.current) return moves;
    for (let k = 1; k < this.beatIndex; k++) {
      const m = this.current.beats[k]?.moves;
      if (m?.length) moves.push(...m);
    }
    if (this.beatIndex >= 1) {
      const cur = this.current.beats[this.beatIndex]?.moves ?? [];
      for (let i = 0; i <= this.moveIndex && i < cur.length; i += 1) moves.push(cur[i]);
    }
    return moves;
  }

  // Restore the default move duration once the reconciling burst settles, so later
  // manual cube turns aren't stuck at the fast setup speed.
  private restoreDurationWhenIdle(): void {
    const poll = (): void => {
      if (this.api.isBusy()) {
        this.timer = setTimeout(poll, POLL_MS);
        return;
      }
      this.api.setMoveDuration?.();
    };
    this.timer = setTimeout(poll, POLL_MS);
  }

  // Resume auto-play from the current cursor: continue mid-beat, or advance.
  private resumePlayback(): void {
    if (!this.playing || !this.current) return;
    if (this.moveCount === 0) { this.advanceBeat(); return; }
    if (this.moveIndex < 0) { this.startBeatMoves(); return; }
    if (this.moveIndex >= this.moveCount - 1) { this.advanceBeat(); return; }
    this.playNextMove();
  }

  // Move to the next beat (or finish) and begin its emphasis + paced moves.
  private advanceBeat(): void {
    if (!this.playing || !this.current) return;
    if (this.beatIndex >= this.current.beats.length - 1) {
      this.playing = false;
      this.finished = true;
      this.currentMove = null;
      this.api.setMoveDuration?.();
      this.setHighlight(null, { fadeMs: HIGHLIGHT_FADE_MS });
      this.emit();
      return;
    }
    this.beatIndex += 1;
    const beat = this.current.beats[this.beatIndex];
    this.moveCount = beat.moves?.length ?? 0;
    this.moveIndex = -1;
    this.currentMove = null;
    this.beginBeatPlayback();
  }

  // Pulse the step's highlight for emphasis, then restore full colour and play.
  // A highlighted beat with no moves (e.g. the anatomy tour) keeps its spotlight
  // for the whole beat — there are no turns to watch on a full-colour cube.
  private beginBeatPlayback(): void {
    if (!this.playing || !this.current) return;
    const beat = this.current.beats[this.beatIndex];
    this.emit(); // narration + counter for the new beat
    const hasMoves = (beat.moves?.length ?? 0) > 0;
    if (beat.highlight) {
      this.setHighlight(beat.highlight, { fadeMs: HIGHLIGHT_FADE_MS });
      if (!hasMoves) {
        this.moveCount = 0;
        this.moveIndex = -1;
        this.currentMove = null;
        this.afterMoves();
        return;
      }
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        this.startBeatMoves();
      }, HIGHLIGHT_EMPHASIS_MS);
    } else {
      this.setHighlight(null, { fadeMs: HIGHLIGHT_FADE_MS });
      this.startBeatMoves();
    }
  }

  private startBeatMoves(): void {
    if (!this.playing || !this.current) return;
    const beat = this.current.beats[this.beatIndex];
    // Restore full colour before turning so the moves are clearly visible.
    this.setHighlight(null, { fadeMs: HIGHLIGHT_FADE_MS });
    const moves = beat.moves ?? [];
    this.moveCount = moves.length;
    if (moves.length === 0) { this.afterMoves(); return; }
    if (beat.pace === 'fast') {
      this.api.setMoveDuration?.(SETUP_MOVE_MS); // burst through setup quickly
      this.api.applyMoves(moves);
      this.moveIndex = moves.length - 1;
      this.currentMove = null;
      this.emit();
      this.waitSettle(() => {
        this.api.setMoveDuration?.(PLAYBACK_MOVE_MS); // back to followable speed
        this.afterMoves();
      });
      return;
    }
    this.moveIndex = -1;
    this.playNextMove();
  }

  // Play one move, wait for it to settle, pause, then the next — so each turn
  // reads as a discrete, announced step.
  private playNextMove(): void {
    if (!this.playing || !this.current) return;
    const moves = this.current.beats[this.beatIndex].moves ?? [];
    if (this.moveIndex >= moves.length - 1) { this.afterMoves(); return; }
    this.moveIndex += 1;
    this.currentMove = moves[this.moveIndex];
    this.api.applyMoves([this.currentMove]);
    this.emit();
    this.waitSettle(() => {
      this.timer = setTimeout(() => this.playNextMove(), INTER_MOVE_PAUSE_MS);
    });
  }

  private afterMoves(): void {
    if (!this.playing || !this.current) return;
    this.currentMove = null;
    this.emit();
    const dwell = this.current.beats[this.beatIndex].dwellMs ?? DEFAULT_DWELL_MS;
    this.timer = setTimeout(() => this.advanceBeat(), dwell);
  }

  // Poll until the animator has settled, then run cb.
  private waitSettle(cb: () => void): void {
    this.timer = setTimeout(() => {
      if (!this.playing || !this.current) return;
      if (this.api.isBusy()) { this.waitSettle(cb); return; }
      cb();
    }, POLL_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private snapshot(): WalkthroughState {
    if (!this.current) return { walkthrough: null };
    return {
      walkthrough: this.current,
      beat: this.current.beats[this.beatIndex],
      beatIndex: this.beatIndex,
      beatCount: this.current.beats.length,
      moveIndex: this.moveIndex,
      moveCount: this.moveCount,
      currentMove: this.currentMove,
      playing: this.playing,
      finished: this.finished
    };
  }

  private emit(): void {
    this.emitter.emit(this.snapshot());
  }
}
