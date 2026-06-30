import { describe, it, expect, vi, afterEach } from 'vitest';
import { WalkthroughEngine, type WalkthroughApi, type WalkthroughState, type Walkthrough } from './walkthrough';
import type { CubeletType } from '../scene/cubelets';

// A fake cube API that records move/reset calls and lets a test toggle busyness
// to stand in for the animator queue.
function fakeApi() {
  const applied: string[][] = [];
  let resets = 0;
  let busy = false;
  const api: WalkthroughApi = {
    applyMoves(moves) {
      const arr = typeof moves === 'string' ? moves.split(/\s+/).filter(Boolean) : moves;
      applied.push(arr);
      return { accepted: arr, rejected: [] };
    },
    reset() { resets++; },
    isBusy: () => busy
  };
  return { api, applied, resets: () => resets, setBusy: (b: boolean) => { busy = b; } };
}

function fakeHighlight() {
  const calls: (CubeletType | null)[] = [];
  return { calls, fn: (t: CubeletType | null) => calls.push(t) };
}

const WTS: Walkthrough[] = [
  {
    id: 'w1',
    title: 'W1',
    description: 'demo',
    beats: [
      { text: 'b0' },
      { text: 'b1', moves: ['R', 'U'], highlight: 'edge' },
      { text: 'b2', moves: ["R'"], highlight: null }
    ]
  }
];

function latest(engine: WalkthroughEngine): WalkthroughState {
  let state!: WalkthroughState;
  const off = engine.subscribe((s) => { state = s; });
  off();
  return state;
}

// Narrow to the populated variant for direct property assertions.
function active(engine: WalkthroughEngine): Extract<WalkthroughState, { walkthrough: Walkthrough }> {
  const s = latest(engine);
  if (s.walkthrough === null) throw new Error('expected an active walkthrough');
  return s;
}

const last = <T>(arr: T[]): T => arr[arr.length - 1];

afterEach(() => {
  vi.useRealTimers();
});

describe('WalkthroughEngine', () => {
  it('starts idle with no walkthrough', () => {
    const { api } = fakeApi();
    const hl = fakeHighlight();
    const engine = new WalkthroughEngine(api, WTS, hl.fn);
    expect(latest(engine)).toEqual({ walkthrough: null });
  });

  it('select resets the cube and shows beat 0 paused', () => {
    const { api, applied, resets } = fakeApi();
    const hl = fakeHighlight();
    const engine = new WalkthroughEngine(api, WTS, hl.fn);
    engine.select('w1');
    const s = latest(engine);
    expect(s.walkthrough?.id).toBe('w1');
    expect(s).toMatchObject({ beatIndex: 0, beatCount: 3, playing: false, finished: false });
    expect(resets()).toBe(1);
    expect(applied).toEqual([]); // beat 0 has no moves
    expect(last(hl.calls)).toBeNull();
  });

  it('next steps forward and applies that beat\'s moves incrementally', () => {
    const { api, applied } = fakeApi();
    const hl = fakeHighlight();
    const engine = new WalkthroughEngine(api, WTS, hl.fn);
    engine.select('w1');
    engine.next();
    expect(latest(engine)).toMatchObject({ beatIndex: 1, playing: false });
    expect(applied).toEqual([['R', 'U']]);
    expect(last(hl.calls)).toBe('edge');
    engine.next();
    expect(applied).toEqual([['R', 'U'], ["R'"]]);
    expect(latest(engine)).toMatchObject({ beatIndex: 2 });
  });

  it('previous rebuilds via reset + cumulative replay', () => {
    const { api, applied, resets } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    engine.select('w1');   // reset #1
    engine.next();         // -> beat 1, applies [R,U]
    engine.next();         // -> beat 2, applies [R']
    const resetsBefore = resets();
    engine.previous();     // -> beat 1, reset + replay cumulative [R,U]
    expect(resets()).toBe(resetsBefore + 1);
    expect(last(applied)).toEqual(['R', 'U']);
    expect(latest(engine)).toMatchObject({ beatIndex: 1 });
  });

  it('stop returns to beat 0 and clears highlight', () => {
    const { api } = fakeApi();
    const hl = fakeHighlight();
    const engine = new WalkthroughEngine(api, WTS, hl.fn);
    engine.select('w1');
    engine.next();
    engine.stop();
    expect(latest(engine)).toMatchObject({ beatIndex: 0, playing: false, finished: false });
    expect(last(hl.calls)).toBeNull();
  });

  it('play auto-advances through every beat then finishes', () => {
    vi.useFakeTimers();
    const { api, applied } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    engine.select('w1');
    engine.play();
    expect(active(engine).playing).toBe(true);
    vi.advanceTimersByTime(10000);
    const s = latest(engine);
    expect(s).toMatchObject({ playing: false, finished: true, beatIndex: 2 });
    // Moves now play one at a time (followable), in order.
    expect(applied).toEqual([['R'], ['U'], ["R'"]]);
  });

  it('exposes the current move while stepping a beat', () => {
    vi.useFakeTimers();
    const { api } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    engine.select('w1');
    engine.play();
    vi.advanceTimersByTime(950); // past beat 1 emphasis hold, into its first move
    const s = active(engine);
    expect(s).toMatchObject({ beatIndex: 1, moveIndex: 0, moveCount: 2, currentMove: 'R' });
  });

  it("pulses the beat's highlight then restores full colour before moving", () => {
    vi.useFakeTimers();
    const { api } = fakeApi();
    const hl = fakeHighlight();
    const engine = new WalkthroughEngine(api, WTS, hl.fn);
    engine.select('w1');
    engine.play();
    vi.advanceTimersByTime(300); // during emphasis hold of beat 1 (highlight 'edge')
    expect(last(hl.calls)).toBe('edge');
    vi.advanceTimersByTime(900); // emphasis elapsed -> restored before turning
    expect(last(hl.calls)).toBeNull();
  });

  it('keeps the spotlight for a highlighted beat with no moves', () => {
    vi.useFakeTimers();
    const { api } = fakeApi();
    const hl = fakeHighlight();
    const wt: Walkthrough[] = [{
      id: 'wa', title: 'WA', description: 'd',
      beats: [{ text: 'a' }, { text: 'edges', highlight: 'edge', dwellMs: 3000 }]
    }];
    const engine = new WalkthroughEngine(api, wt, hl.fn);
    engine.select('wa');
    engine.play();
    vi.advanceTimersByTime(1500); // past the emphasis window, still within the beat
    expect(last(hl.calls)).toBe('edge'); // retained, not restored to full colour
  });

  it("plays a 'fast' beat's moves in one burst", () => {
    vi.useFakeTimers();
    const { api, applied } = fakeApi();
    const fast: Walkthrough[] = [{
      id: 'wf', title: 'WF', description: 'd',
      beats: [{ text: 'a' }, { text: 'b', moves: ['R', 'U', "R'"], pace: 'fast' }]
    }];
    const engine = new WalkthroughEngine(api, fast, fakeHighlight().fn);
    engine.select('wf');
    engine.play();
    vi.advanceTimersByTime(5000);
    expect(applied).toContainEqual(['R', 'U', "R'"]); // applied together, not split
  });

  it('pause stops auto-advance and keeps the current beat', () => {
    vi.useFakeTimers();
    const { api } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    engine.select('w1');
    engine.play();
    vi.advanceTimersByTime(1300); // enough for one auto-step into beat 1
    engine.pause();
    const idx = active(engine).beatIndex;
    expect(active(engine).playing).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(active(engine).beatIndex).toBe(idx); // did not advance after pause
  });
});

describe('WalkthroughEngine.loadGenerated', () => {
  it('adds a runtime walkthrough and selects it', () => {
    const { api } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    const gen: Walkthrough = {
      id: 'gen-1', title: 'Generated', description: 'd',
      beats: [{ text: 'g0' }, { text: 'g1', moves: ['U'] }]
    };
    engine.loadGenerated(gen);
    const s = active(engine);
    expect(s.walkthrough.id).toBe('gen-1');
    expect(s.beatIndex).toBe(0);
    expect(engine.getWalkthroughs().some((w) => w.id === 'gen-1')).toBe(true);
  });

  it('replaces a prior generated walkthrough with the same id', () => {
    const { api } = fakeApi();
    const engine = new WalkthroughEngine(api, WTS, fakeHighlight().fn);
    engine.loadGenerated({ id: 'gen-1', title: 'A', description: 'd', beats: [{ text: 'a' }] });
    engine.loadGenerated({ id: 'gen-1', title: 'B', description: 'd', beats: [{ text: 'b' }] });
    const matches = engine.getWalkthroughs().filter((w) => w.id === 'gen-1');
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe('B');
  });
});
