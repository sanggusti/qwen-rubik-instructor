import { describe, it, expect } from 'vitest';
import { solvedState, applyMove, isSolved } from '../cube/state';
import { parseMove } from '../cube/moves';
import { SCRAMBLE, SOLUTION } from './solve-sequence';

describe('landing solve sequence', () => {
  it('scramble then solution returns the cube to solved', () => {
    const state = solvedState();
    for (const m of SCRAMBLE) applyMove(state, m);
    expect(isSolved(state)).toBe(false);
    for (const m of SOLUTION) applyMove(state, m);
    expect(isSolved(state)).toBe(true);
  });

  it('every token is a quarter turn the animator can parse', () => {
    for (const m of [...SCRAMBLE, ...SOLUTION]) {
      expect(parseMove(m), `unparseable move: ${m}`).not.toBeNull();
    }
  });
});
