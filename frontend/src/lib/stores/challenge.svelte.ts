// Challenge-mode state machine: idle → scrambling → running → solved.
// The play page owns the rAF tick and the isBusy/isSolved effects; this store
// owns the transitions. Any scramble or reset the challenge didn't initiate
// aborts a run in progress (anti-cheat: Reset would otherwise "solve" the cube
// instantly).

import { cubeStore } from './cube.svelte';

export type ChallengeStatus = 'idle' | 'scrambling' | 'running' | 'solved';

export const CHALLENGE_SCRAMBLE_LENGTH = 20;

class ChallengeStore {
  status: ChallengeStatus = $state('idle');
  elapsedMs: number = $state(0);
  startMs = 0;

  private scrambling = false;

  constructor() {
    cubeStore.onReset(() => this.cancel());
    cubeStore.onScramble(() => {
      if (!this.scrambling) this.cancel();
    });
    // A scanned-in state could otherwise fake a solve (loadState sets state
    // directly with isBusy false) — treat it exactly like an external reset.
    cubeStore.onLoadState(() => this.cancel());
  }

  /** Scramble the cube; the play page starts the clock once isBusy clears. */
  begin(): void {
    if (this.status === 'scrambling' || this.status === 'running') return;
    this.elapsedMs = 0;
    this.status = 'scrambling';
    this.scrambling = true;
    cubeStore.scramble(CHALLENGE_SCRAMBLE_LENGTH);
    this.scrambling = false;
  }

  /** Scramble animation done — the timer starts now. */
  start(): void {
    if (this.status !== 'scrambling') return;
    this.startMs = performance.now();
    this.elapsedMs = 0;
    this.status = 'running';
  }

  tick(): void {
    if (this.status !== 'running') return;
    this.elapsedMs = performance.now() - this.startMs;
  }

  finish(): void {
    if (this.status !== 'running') return;
    this.elapsedMs = performance.now() - this.startMs;
    this.status = 'solved';
  }

  /** Abort a run without recording anything (Reset/Scramble mid-challenge). */
  cancel(): void {
    if (this.status !== 'scrambling' && this.status !== 'running') return;
    this.status = 'idle';
    this.elapsedMs = 0;
  }

  /** Back to idle after the celebration ("Play Again" / "Go Home"). */
  reset(): void {
    this.status = 'idle';
    this.elapsedMs = 0;
  }
}

/** mm:ss.S — e.g. 83_450ms → "01:23.4". */
export function formatChallengeTime(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = seconds.toFixed(1).padStart(4, '0');
  return `${mm}:${ss}`;
}

export const challengeStore = new ChallengeStore();
