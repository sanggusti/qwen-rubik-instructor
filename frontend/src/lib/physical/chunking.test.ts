import { describe, expect, it } from 'vitest';
import { segmentBeat, slicePhrases } from './chunking';

describe('segmentBeat', () => {
  it('keeps short beats whole', () => {
    expect(segmentBeat(['R', 'U', "R'"])).toEqual([{ moves: ['R', 'U', "R'"], start: 0 }]);
    expect(segmentBeat([])).toEqual([]);
    const six = ['R', 'U', "R'", "U'", 'F', "F'"];
    expect(segmentBeat(six)).toHaveLength(1);
  });

  it('splits long beats into 3-6 move chunks that cover everything in order', () => {
    const moves = ['R', 'U', "R'", "U'", 'F', 'D', "D'", 'L', 'B', "B'", 'U', 'R', 'F', "F'"];
    const chunks = segmentBeat(moves);
    expect(chunks.length).toBeGreaterThan(1);
    const flat = chunks.flatMap((c) => c.moves);
    expect(flat).toEqual(moves);
    for (const c of chunks) {
      expect(c.moves.length).toBeGreaterThanOrEqual(1);
      expect(c.moves.length).toBeLessThanOrEqual(6);
      expect(moves.slice(c.start, c.start + c.moves.length)).toEqual(c.moves);
    }
  });

  it('never splits an expanded double (identical adjacent tokens)', () => {
    // 'U U' at positions 4-5 would be split by a naive 5-boundary.
    const moves = ['R', 'F', 'L', 'D', 'U', 'U', 'R', 'F', 'B', 'L', 'D', 'R'];
    const chunks = segmentBeat(moves);
    for (const c of chunks) {
      const lastOfChunk = c.moves[c.moves.length - 1];
      const nextGlobal = moves[c.start + c.moves.length];
      expect(lastOfChunk === nextGlobal && lastOfChunk === 'U').toBe(false);
    }
    expect(chunks.flatMap((c) => c.moves)).toEqual(moves);
  });

  it('covers arbitrary lengths without dropping moves', () => {
    for (let n = 1; n <= 30; n++) {
      const moves = Array.from({ length: n }, (_, i) => ['R', 'U', 'F', 'L', 'D', 'B'][i % 6]);
      const flat = segmentBeat(moves).flatMap((c) => c.moves);
      expect(flat, `length ${n}`).toEqual(moves);
    }
  });
});

describe('slicePhrases', () => {
  it('describes each slice move once', () => {
    const hints = slicePhrases(['R', 'M', 'U', 'M', "E'"]);
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain('middle layer');
    expect(hints[1]).toContain('equator');
  });

  it('is empty for plain face turns', () => {
    expect(slicePhrases(['R', 'U', "R'"])).toEqual([]);
  });
});
