import type { Lesson } from './lesson_types';

// A small, static catalog. Beginner lessons use plain language and introduce
// notation gently. Time-improvement lessons focus on smooth, practical drills.
export const LESSON_CATALOG: Lesson[] = [
    {
        id: 'beginner-notation',
        track: 'beginner',
        title: 'Learn the notation',
        audience: 'Brand-new solvers who have never used cube letters before.',
        description:
            'Each face of the cube has a letter. In this lesson you will learn what those letters mean and turn a few faces yourself.',
        steps: [
            {
                id: 'beginner-notation-intro',
                title: 'Faces have letters',
                body:
                    "Every side of the cube has a name: R is the right face, L is the left face, U is the top (up), D is the bottom (down), F is the front, and B is the back. Read this, then press Mark complete to continue.",
                validator: { type: 'manual' }
            },
            {
                id: 'beginner-notation-r',
                title: 'Turn the right face',
                body:
                    "`R` means turn the right face clockwise once. Drag the right face up, or press the R key. Do a single R turn now.",
                expectedMoves: ['R'],
                hints: ['Use the R key, or drag the right face upward.'],
                validator: { type: 'moveSequence', moves: ['R'] }
            },
            {
                id: 'beginner-notation-r-prime',
                title: 'Turn it back the other way',
                body:
                    "`R'` (say \"R prime\") means turn the right face the other way, counter-clockwise. Do an R' turn to send the right face back. Hold Shift and press R, or drag it down.",
                expectedMoves: ["R'"],
                validator: { type: 'moveSequence', moves: ["R'"] }
            },
            {
                id: 'beginner-notation-u',
                title: 'Turn the top face',
                body:
                    "`U` means turn the top (up) face clockwise once. Try a single U turn.",
                expectedMoves: ['U'],
                validator: { type: 'moveSequence', moves: ['U'] }
            }
        ]
    },
    {
        id: 'beginner-first-trigger',
        track: 'beginner',
        title: 'Your first sequence',
        audience: 'Beginners who know the face letters and want to do a short sequence.',
        description:
            'A short, repeatable set of turns is called a sequence. Here you will learn a friendly four-move sequence and watch how it changes the cube.',
        steps: [
            {
                id: 'beginner-first-trigger-explain',
                title: 'What a sequence is',
                body:
                    'A sequence is just a few turns done in order. The one you will practice is R, U, R prime, U prime. Press Mark complete when you are ready to try it.',
                validator: { type: 'manual' }
            },
            {
                id: 'beginner-first-trigger-do',
                title: 'Do R U R\u2032 U\u2032',
                body:
                    "Turn the right face clockwise (`R`), the top clockwise (`U`), the right face back (`R'`), then the top back (`U'`). Take your time \u2014 the panel will confirm when you finish. Use Apply example moves if you want to watch it first.",
                expectedMoves: ['R', 'U', "R'", "U'"],
                hints: ['Say the moves out loud: R, U, R prime, U prime.'],
                validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
            },
            {
                id: 'beginner-first-trigger-solve',
                title: 'Bring it back to solved',
                body:
                    'The cube is one quarter-turn away from solved. Press Set up step to scramble it by a single turn, then undo that turn to make every face one solid color again.',
                setupMoves: ['R'],
                hints: ['Undo the setup move by turning the same face in the opposite direction.'],
                validator: { type: 'cubeSolved' }
            }
        ]
    },
    {
        id: 'time-right-hand-trigger',
        track: 'time-improvement',
        title: 'Smooth right-hand trigger',
        audience: 'Solvers who can already solve the cube and want faster, smoother turns.',
        description:
            'The right-hand trigger R U R\u2032 U\u2032 shows up constantly. Practicing it until it feels automatic removes pauses and speeds up your solves.',
        steps: [
            {
                id: 'time-right-hand-trigger-once',
                title: 'Perform the trigger slowly',
                body:
                    "Do `R U R' U'` once, slowly and without pausing between turns. Focus on a steady rhythm rather than speed.",
                expectedMoves: ['R', 'U', "R'", "U'"],
                validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
            },
            {
                id: 'time-right-hand-trigger-twice',
                title: 'Chain it twice',
                body:
                    "Run the trigger back-to-back: `R U R' U' R U R' U'`. Try to keep the same smooth pace through both repetitions and notice the repeated pattern.",
                expectedMoves: ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'"],
                validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'"] }
            },
            {
                id: 'time-right-hand-trigger-recognize',
                title: 'Look ahead',
                body:
                    'Do the trigger one more time, but try to see the next piece you would turn before you finish the current turn. Press Mark complete once you have practiced looking ahead.',
                validator: { type: 'manual' }
            }
        ]
    },
    {
        id: 'time-left-hand-trigger',
        track: 'time-improvement',
        title: 'Practice both hands',
        audience: 'Solvers who want balanced turning and fewer regrips.',
        description:
            'Mirroring the trigger on the left side keeps your turning balanced so you regrip less and pause less during a solve.',
        steps: [
            {
                id: 'time-left-hand-trigger-do',
                title: 'Mirror on the left',
                body:
                    "The left-hand version is `L' U' L U`. Perform it slowly and let your left hand lead. Use Apply example moves to preview it first if you like.",
                expectedMoves: ["L'", "U'", 'L', 'U'],
                validator: { type: 'moveSequence', moves: ["L'", "U'", 'L', 'U'] }
            },
            {
                id: 'time-left-hand-trigger-plan',
                title: 'Plan before you turn',
                body:
                    'Before your next practice solve, look at the cube for a few seconds and plan your first move without turning. Press Mark complete once you have tried planning ahead.',
                validator: { type: 'manual' }
            }
        ]
    }
];
