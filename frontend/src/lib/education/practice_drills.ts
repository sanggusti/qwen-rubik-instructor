// A small, static catalog of practice drills. Deliberately compact: this is not
// a content library, just enough to exercise both validator types across a few
// categories and difficulties. Larger catalogs are future work.

import type { Drill } from './practice_types';

export const PRACTICE_DRILLS: Drill[] = [
    {
        id: 'sexy-move',
        title: 'Sexy move',
        category: 'trigger',
        difficulty: 'easy',
        prompt: 'Perform the trigger R U R\u2032 U\u2032. Repeat it cleanly twice.',
        expectedMoves: ['R', 'U', "R'", "U'"],
        rounds: 2,
        validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
    },
    {
        id: 'sune',
        title: 'Sune',
        category: 'algorithm',
        difficulty: 'medium',
        prompt: 'Run the Sune algorithm: R U R\u2032 U R U U R\u2032.',
        expectedMoves: ['R', 'U', "R'", 'U', 'R', 'U', 'U', "R'"],
        rounds: 1,
        validator: { type: 'moveSequence', moves: ['R', 'U', "R'", 'U', 'R', 'U', 'U', "R'"] }
    },
    {
        id: 'solve-one-move',
        title: 'Solve from one move',
        category: 'solve',
        difficulty: 'easy',
        prompt: 'The cube is one move from solved. Return it to a solved state.',
        setupMoves: ['R'],
        expectedMoves: ["R'"],
        rounds: 1,
        validator: { type: 'cubeSolved' }
    }
];
