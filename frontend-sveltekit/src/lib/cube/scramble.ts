const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const SUFFIXES = ['', "'", '2'];

// 2 means double turn (we expand to two quarter turns since the animator handles only quarters).
function expand(move: string): string[] {
  if (move.endsWith('2')) {
    const base = move.slice(0, -1);
    return [base, base];
  }
  return [move];
}

export function generateScramble(length = 20): string[] {
  const moves: string[] = [];
  let lastFace = '';
  let beforeLastFace = '';
  while (moves.length < length) {
    const face = FACES[Math.floor(Math.random() * FACES.length)];
    if (face === lastFace) continue;
    if (face === beforeLastFace && areOpposite(face, lastFace)) continue;
    const suf = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    moves.push(face + suf);
    beforeLastFace = lastFace;
    lastFace = face;
  }
  return moves.flatMap(expand);
}

function areOpposite(a: string, b: string): boolean {
  const pairs: Record<string, string> = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
  return pairs[a] === b;
}
