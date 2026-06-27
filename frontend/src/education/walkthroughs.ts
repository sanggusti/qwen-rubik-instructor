// The four built-in Watch & Learn walkthroughs. Plain data consumed by
// WalkthroughEngine. Captions are kept short so they stream in beside the cube
// roughly in step with the moves. Moves use single-turn notation only (no
// doubles like U2 — the host accepts only [UDLRFBMESxyz] with an optional
// prime), so U2 is written as two U's, R2 as two R's, etc.

import type { Walkthrough } from './walkthrough';

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'anatomy',
    title: 'Anatomy of the cube',
    description: 'Meet the three kinds of pieces and the hidden core.',
    beats: [
      { text: "A cube has 26 little pieces — in three kinds. Let's meet them.", highlight: null, dwellMs: 1500 },
      { text: '6 CENTRES — one per face. They never move, so each fixes its face colour.', highlight: 'center', dwellMs: 2200 },
      { text: '12 EDGES — two colours each, sitting between two centres.', highlight: 'edge', dwellMs: 2200 },
      { text: "8 CORNERS — three colours each, at the cube's corners.", highlight: 'corner', dwellMs: 2200 },
      { text: 'Inside hides the CORE the faces pivot around.', highlight: 'core', dwellMs: 2000 },
      { text: 'Solving = bringing every edge and corner home.', highlight: null, dwellMs: 1600 }
    ]
  },
  {
    id: 'trigger',
    title: "The trigger: R U R' U'",
    description: 'The most common four-move pattern in cubing.',
    beats: [
      { text: "R U R' U' — the “trigger”. Watch one repetition.", dwellMs: 1300 },
      { text: "R, U, R-prime, U-prime.", moves: ['R', 'U', "R'", "U'"], dwellMs: 1100 },
      {
        text: 'Repeat it six times and the cube returns to solved. Five more…',
        moves: [
          'R', 'U', "R'", "U'",
          'R', 'U', "R'", "U'",
          'R', 'U', "R'", "U'",
          'R', 'U', "R'", "U'",
          'R', 'U', "R'", "U'"
        ],
        dwellMs: 700
      },
      { text: 'Solved again — every sequence eventually cycles back.', dwellMs: 1500 }
    ]
  },
  {
    id: 'sune',
    title: 'Sune — your first algorithm',
    description: "Twist the last-layer corners with R U R' U R U2 R'.",
    beats: [
      { text: "Sune: R U R' U R U2 R'. A classic last-layer algorithm.", dwellMs: 1500 },
      { text: "First: R U R'.", moves: ['R', 'U', "R'"], dwellMs: 1000 },
      { text: 'Then U R, a half-turn U2, and R-prime.', moves: ['U', 'R', 'U', 'U', "R'"], dwellMs: 1100 },
      { text: "That's Sune — it cycles three of the top corners.", dwellMs: 1500 }
    ]
  },
  {
    id: 't-perm',
    title: 'T-Perm — swapping pieces',
    description: 'Swap two adjacent corners and two edges, then undo it.',
    beats: [
      { text: 'The T-Perm swaps two corners and two edges.', dwellMs: 1400 },
      {
        text: "Watch: R U R' U' R' F R2 U' R' U' R U R' F'.",
        moves: ['R', 'U', "R'", "U'", "R'", 'F', 'R', 'R', "U'", "R'", "U'", 'R', 'U', "R'", "F'"],
        dwellMs: 1300
      },
      {
        text: 'See the two corners and two edges swapped on top.',
        dwellMs: 1800
      },
      {
        // Exact inverse of the sequence above — restores the cube to solved.
        text: 'Now run it backwards to put everything home.',
        moves: ['F', 'R', "U'", "R'", 'U', 'R', 'U', "R'", "R'", "F'", 'R', 'U', 'R', "U'", "R'"],
        dwellMs: 1200
      },
      { text: 'Solved again.', dwellMs: 1400 }
    ]
  }
];
