import { describe, it, expect } from 'vitest';
import { solvedState, applyMove, isSolved } from '../core/state';
import { WALKTHROUGHS } from './walkthroughs';

// Apply every move from every beat of a walkthrough, in order, to a solved cube.
function runDemo(id: string): boolean {
  const wt = WALKTHROUGHS.find((w) => w.id === id)!;
  const state = solvedState();
  for (const beat of wt.beats) for (const m of beat.moves ?? []) applyMove(state, m);
  return isSolved(state);
}

describe('walkthrough demos that claim to return to solved', () => {
  it('trigger ends solved after six repetitions', () => {
    expect(runDemo('trigger')).toBe(true);
  });
  it('t-perm ends solved (forward then inverse)', () => {
    expect(runDemo('t-perm')).toBe(true);
  });
});
