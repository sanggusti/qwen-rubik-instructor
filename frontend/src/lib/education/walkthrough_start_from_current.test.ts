import { describe, it, expect } from 'vitest';
import { WalkthroughEngine, type WalkthroughApi, type WalkthroughState, type Walkthrough } from './walkthrough';
import type { CubeletType } from '../scene/cubelets';

function fakeApi() {
  const applied: string[][] = [];
  let resets = 0;
  const api: WalkthroughApi = {
    applyMoves(moves) {
      const arr = typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves;
      applied.push(arr);
      return { accepted: arr, rejected: [] };
    },
    reset() {
      resets += 1;
    },
    isBusy: () => false,
    setMoveDuration: () => {}
  };
  return { api, applied, resets: () => resets };
}

const noHighlight = (_t: CubeletType | null) => {};

// A start-from-current solve: beat 0 is the scramble (data only, so the demo cube
// can reconstruct the start), beats 1..n are the solution the live cube plays.
const SOLVE: Walkthrough[] = [
  {
    id: 's1',
    title: 'Solve',
    description: 'solve the current cube',
    startFromCurrent: true,
    beats: [
      { text: 'intro', moves: ['R', 'U'], pace: 'fast' },
      { text: 'stage 1', moves: ["U'", "R'"], highlight: 'edge' },
      { text: 'stage 2', moves: ['F'], highlight: null }
    ]
  }
];

function active(engine: WalkthroughEngine): Extract<WalkthroughState, { walkthrough: Walkthrough }> {
  let state!: WalkthroughState;
  const off = engine.subscribe((s) => { state = s; });
  off();
  if (state.walkthrough === null) throw new Error('expected an active walkthrough');
  return state;
}

const last = <T>(arr: T[]): T => arr[arr.length - 1];

describe('WalkthroughEngine — start-from-current solve', () => {
  it('select does not reset or re-scramble the live cube', () => {
    const { api, applied, resets } = fakeApi();
    const engine = new WalkthroughEngine(api, SOLVE, noHighlight);
    engine.select('s1');
    expect(resets()).toBe(0); // never solves the learner's cube
    expect(applied).toEqual([]); // never replays the scramble
    expect(active(engine).beatIndex).toBe(0);
  });

  it('advancing plays only the solution moves, from the current cube', () => {
    const { api, applied, resets } = fakeApi();
    const engine = new WalkthroughEngine(api, SOLVE, noHighlight);
    engine.select('s1');
    engine.next(); // intro -> stage 1
    expect(resets()).toBe(0);
    expect(applied).toEqual([["U'", "R'"]]);
    engine.next(); // stage 1 -> stage 2
    expect(applied).toEqual([["U'", "R'"], ['F']]);
  });

  it('stopping rewinds by undoing the solution — not by resetting', () => {
    const { api, applied, resets } = fakeApi();
    const engine = new WalkthroughEngine(api, SOLVE, noHighlight);
    engine.select('s1');
    engine.next(); // apply ["U'", "R'"]
    engine.next(); // apply ['F']
    engine.stop(); // back to the scramble
    expect(resets()).toBe(0);
    // Undo of ['F', "R'", "U'"] reversed then inverted = ["F'", 'R', 'U'].
    expect(last(applied)).toEqual(["F'", 'R', 'U']);
    expect(active(engine).beatIndex).toBe(0);
  });

  it('previous rewinds a single beat via inverse moves', () => {
    const { api, applied } = fakeApi();
    const engine = new WalkthroughEngine(api, SOLVE, noHighlight);
    engine.select('s1');
    engine.next(); // stage 1
    engine.next(); // stage 2 (applied ['F'])
    engine.previous(); // back to stage 1: undo ['F']
    expect(last(applied)).toEqual(["F'"]);
    expect(active(engine).beatIndex).toBe(1);
  });
});
