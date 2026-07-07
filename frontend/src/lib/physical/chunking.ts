// Micro-chunk segmentation for physical read-along: a solver stage is 8–30
// moves — too many to perform blind — so beats are split into 3–6 move
// chunks the learner confirms one at a time (docs §6.2). Rules: never split
// between two identical adjacent tokens (an expanded double like "U U" is one
// physical motion), and prefer a break right after a slice move (M/E/S — a
// grip change is a natural pause).

const MAX_CHUNK = 5;
const SLICES = new Set(['M', "M'", 'E', "E'", 'S', "S'"]);

export interface Chunk {
  moves: string[];
  /** Index of the chunk's first move within the beat's move list. */
  start: number;
}

export function segmentBeat(moves: string[]): Chunk[] {
  if (moves.length === 0) return [];
  if (moves.length <= MAX_CHUNK + 1) return [{ moves: [...moves], start: 0 }];

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < moves.length) {
    let end = Math.min(start + MAX_CHUNK, moves.length);
    if (end < moves.length) {
      // Don't split an expanded double (identical adjacent tokens).
      if (moves[end - 1] === moves[end]) end -= 1;
      // Prefer ending just after a slice move (grip change = natural pause).
      else if (SLICES.has(moves[end]) && end - start > 2) {
        // keep the boundary — slice starts the next chunk
      } else if (SLICES.has(moves[end - 1])) {
        // slice already ends this chunk — fine
      } else {
        for (let back = 1; back <= 2 && end - back > start + 1; back++) {
          if (SLICES.has(moves[end - back - 1])) {
            end -= back;
            break;
          }
        }
      }
    }
    // Guard against degenerate empty chunks.
    if (end <= start) end = Math.min(start + MAX_CHUNK, moves.length);
    chunks.push({ moves: moves.slice(start, end), start });
    start = end;
  }
  return chunks;
}

// Physical-friendly phrasing for the moves a beginner may not know; shown as
// a hint under the chunk (slices survive in solver output; x/y/z never do).
export const MOVE_PHRASES: Record<string, string> = {
  M: 'M — the middle layer (between left and right), turned like the left face',
  "M'": "M' — the middle layer, opposite way",
  E: 'E — the equator layer (between top and bottom), turned like the bottom',
  "E'": "E' — the equator layer, opposite way",
  S: 'S — the standing layer (between front and back), turned like the front',
  "S'": "S' — the standing layer, opposite way"
};

/** Hint lines for any slice moves present in a chunk (deduplicated). */
export function slicePhrases(moves: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of moves) {
    if (MOVE_PHRASES[m] && !seen.has(m)) {
      seen.add(m);
      out.push(MOVE_PHRASES[m]);
    }
  }
  return out;
}
