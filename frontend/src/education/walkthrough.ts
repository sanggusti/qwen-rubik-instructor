// The Watch & Learn engine plays a Walkthrough: an ordered list of "beats", each
// pairing narration text with optional cube moves and/or a cubelet highlight. It
// is framework-free and mirrors the Emitter-based shape of LessonEngine /
// PracticeEngine. Playback is driven by timers: after a beat's moves are enqueued
// it waits for the animator to settle, dwells, then steps to the next beat.

import { Emitter } from '../core/events';
import type { CubeletType } from '../scene/cube/cubelets';

export interface Beat {
  text: string;
  /** Moves to animate for this beat (standard notation; no doubles like U2). */
  moves?: string[];
  /** Cubelet class to spotlight while this beat is shown. */
  highlight?: CubeletType | null;
  /** Pause after the moves settle before advancing (ms). */
  dwellMs?: number;
}

export interface Walkthrough {
  id: string;
  title: string;
  description: string;
  beats: Beat[];
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

export class WalkthroughEngine {
  private readonly api: WalkthroughApi;
  private readonly walkthroughs: Walkthrough[];
  private readonly setHighlight: (type: CubeletType | null) => void;
  private readonly emitter = new Emitter<WalkthroughState>();

  private current: Walkthrough | null = null;
  private beatIndex = 0;
  private playing = false;
  private finished = false;
  // Highest beat index whose moves are already applied to the current (un-reset)
  // cube, so forward steps never double-apply and resuming after pause is safe.
  private lastApplied = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    api: WalkthroughApi,
    walkthroughs: Walkthrough[],
    setHighlight: (type: CubeletType | null) => void
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
    this.seek(0);
    this.emit();
  }

  close(): void {
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.current = null;
    this.api.setMoveDuration?.();
    this.setHighlight(null);
    this.emit();
  }

  play(): void {
    if (!this.current || this.playing) return;
    if (this.finished) this.seek(0);
    this.finished = false;
    this.playing = true;
    this.api.setMoveDuration?.(PLAYBACK_MOVE_MS);
    this.emit();
    this.scheduleContinue();
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
    this.seek(0);
    this.emit();
  }

  next(): void {
    if (!this.current) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.stepForward();
    this.emit();
  }

  previous(): void {
    if (!this.current || this.beatIndex === 0) return;
    this.clearTimer();
    this.playing = false;
    this.finished = false;
    this.seek(this.beatIndex - 1);
    this.emit();
  }

  dispose(): void {
    this.clearTimer();
  }

  // Hard seek via reset + cumulative replay (used by select / stop / previous).
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
    this.lastApplied = index;
    this.setHighlight(this.current.beats[index].highlight ?? null);
  }

  // Enter the next beat incrementally (no reset). Returns false at the end.
  private stepForward(): boolean {
    if (!this.current || this.beatIndex >= this.current.beats.length - 1) return false;
    this.beatIndex += 1;
    const beat = this.current.beats[this.beatIndex];
    if (this.beatIndex === this.lastApplied + 1) {
      if (beat.moves?.length) this.api.applyMoves(beat.moves);
      this.lastApplied = this.beatIndex;
    }
    this.setHighlight(beat.highlight ?? null);
    return true;
  }

  // Wait for the current beat's moves to settle, dwell, then auto-advance.
  private scheduleContinue(): void {
    this.timer = setTimeout(() => {
      if (!this.playing || !this.current) return;
      if (this.api.isBusy()) {
        this.scheduleContinue();
        return;
      }
      const dwell = this.current.beats[this.beatIndex].dwellMs ?? DEFAULT_DWELL_MS;
      this.timer = setTimeout(() => this.autoStep(), dwell);
    }, POLL_MS);
  }

  private autoStep(): void {
    if (!this.playing) return;
    if (!this.stepForward()) {
      this.playing = false;
      this.finished = true;
      this.api.setMoveDuration?.();
      this.emit();
      return;
    }
    this.emit();
    this.scheduleContinue();
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
      playing: this.playing,
      finished: this.finished
    };
  }

  private emit(): void {
    this.emitter.emit(this.snapshot());
  }
}
