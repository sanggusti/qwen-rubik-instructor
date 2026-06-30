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
                highlight: 'corner',
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
                expectedMoves: ["R'"],
                hints: ['Undo the setup move by turning the same face in the opposite direction.'],
                validator: { type: 'cubeSolved' }
            }
        ]
    },
    {
        id: 'lbl-cross',
        track: 'beginner',
        stage: 'cross',
        title: 'Step 1 — The white cross',
        audience: 'Beginners ready to start solving, layer by layer (LBL).',
        description:
            'The first step of every solve is a cross of edges on one face. The big idea: bring an edge to the top, then drop it straight down into place.',
        steps: [
            {
                id: 'lbl-cross-idea',
                highlight: 'edge',
                title: 'What the cross is',
                body:
                    'Pick a colour (white is traditional) and build a plus-sign of its four edges, each also matching the centre next to it. Edges only — corners come later. Press Mark complete when the idea is clear.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-cross-drop',
                highlight: 'edge',
                title: 'Drop an edge into the cross',
                body:
                    'Press Set up step to lift a cross edge to the top. Now turn that face twice (`F` then `F`) to drop the edge straight down into the cross. This is the core move of cross-building.',
                setupMoves: ['F', 'F'],
                expectedMoves: ['F', 'F'],
                hints: ['Two turns of the same face — F then F.'],
                validator: { type: 'moveSequence', moves: ['F', 'F'] }
            }
        ]
    },
    {
        id: 'lbl-first-layer-corners',
        track: 'beginner',
        stage: 'first-layer-corners',
        title: 'Step 2 — First-layer corners',
        audience: 'Solvers who can build the cross and want to finish the first layer.',
        description:
            'With the cross done, slot the four corners of that face. Hold a corner above its spot and repeat the right-hand trigger until it drops in correctly.',
        steps: [
            {
                id: 'lbl-flc-idea',
                highlight: 'corner',
                title: 'Position above the slot',
                body:
                    'A first-layer corner belongs between two centres. Put the corner in the top layer directly above the gap it needs to fill, then the trigger walks it down. Press Mark complete to try it.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-flc-insert',
                highlight: 'corner',
                title: 'Insert with R U R′ U′',
                body:
                    'Press Set up step to lift a corner out of place. Now do the trigger `R U R′ U′` to slot it back. Repeat the trigger until a corner is seated — here once is enough.',
                setupMoves: ['U', 'R', "U'", "R'"],
                expectedMoves: ['R', 'U', "R'", "U'"],
                hints: ['Same trigger as before: R, U, R prime, U prime.'],
                validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
            }
        ]
    },
    {
        id: 'lbl-middle-layer',
        track: 'beginner',
        stage: 'middle-layer',
        title: 'Step 3 — Middle layer edges',
        audience: 'Solvers with a finished first layer, ready for the second layer.',
        description:
            'Flip the cube so the solved layer is on the bottom, then send top-layer edges into the middle with a right-hand insertion algorithm.',
        steps: [
            {
                id: 'lbl-mid-idea',
                highlight: 'edge',
                title: 'Find an edge with no yellow',
                body:
                    'Top edges that have no yellow belong in the middle layer. Line the edge up with its matching centre, then send it right or left. Press Mark complete to practise the right insert.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-mid-insert',
                highlight: 'edge',
                title: 'Right insert: U R U′ R′ U′ F′ U F',
                body:
                    'Press Set up step, then perform the right-hand insertion `U R U′ R′ U′ F′ U F` to place a middle-layer edge. Go slowly and watch the edge travel down.',
                setupMoves: ["F'", "U'", 'F', 'U', 'R', 'U', "R'", "U'"],
                expectedMoves: ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],
                hints: ['It starts like a trigger (U R U′ R′) then adds U′ F′ U F.'],
                validator: {
                    type: 'moveSequence',
                    moves: ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F']
                }
            }
        ]
    },
    {
        id: 'lbl-last-layer-cross',
        track: 'beginner',
        stage: 'last-layer-cross',
        title: 'Step 4 — Last-layer cross',
        audience: 'Solvers with two layers done, starting the final layer.',
        description:
            'Make a cross on the last face by orienting its edges. One short algorithm, applied one to three times, turns a dot or an L or a line into a full cross.',
        steps: [
            {
                id: 'lbl-llc-idea',
                highlight: 'edge',
                title: 'Dot, L, or line',
                body:
                    'Look at the last-layer edges: you will see a dot, an L-shape, or a line. The same algorithm progresses each toward a cross. Press Mark complete to learn it.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-llc-do',
                highlight: 'edge',
                title: 'F R U R′ U′ F′',
                body:
                    'Press Set up step, then perform `F R U R′ U′ F′`. On a real solve you repeat it until the cross appears; here one application returns the cross.',
                setupMoves: ['F', 'U', 'R', "U'", "R'", "F'"],
                expectedMoves: ['F', 'R', 'U', "R'", "U'", "F'"],
                hints: ['Front face wraps the trigger: F, then R U R′ U′, then F prime.'],
                validator: { type: 'moveSequence', moves: ['F', 'R', 'U', "R'", "U'", "F'"] }
            }
        ]
    },
    {
        id: 'lbl-ll-corner-position',
        track: 'beginner',
        stage: 'll-corner-position',
        title: 'Step 5 — Place the last corners',
        audience: 'Solvers with the last-layer cross done.',
        description:
            'Move the last-layer corners to their correct spots (ignore twist for now). The algorithm cycles three corners until each is home.',
        steps: [
            {
                id: 'lbl-llcp-idea',
                highlight: 'corner',
                title: 'Right place, any twist',
                body:
                    'A corner is "placed" when its three colours match the three faces around its spot, even if it is twisted. Find one already-placed corner and cycle the rest. Press Mark complete to practise.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-llcp-do',
                highlight: 'corner',
                title: 'U R U′ L′ U R′ U′ L',
                body:
                    'Press Set up step, then perform the corner cycle `U R U′ L′ U R′ U′ L` to send the corners to their homes.',
                setupMoves: ["L'", 'U', 'R', "U'", 'L', 'U', "R'", "U'"],
                expectedMoves: ['U', 'R', "U'", "L'", 'U', "R'", "U'", 'L'],
                hints: ['Alternates the R and L sides around U turns.'],
                validator: {
                    type: 'moveSequence',
                    moves: ['U', 'R', "U'", "L'", 'U', "R'", "U'", 'L']
                }
            }
        ]
    },
    {
        id: 'lbl-ll-corner-orientation',
        track: 'beginner',
        stage: 'll-corner-orientation',
        title: 'Step 6 — Twist the last corners',
        audience: 'Solvers whose last corners are placed but not yet oriented.',
        description:
            'Twist each misoriented corner into place with R′ D′ R D, repeated. The cube looks scrambled mid-step — keep going and it snaps back.',
        steps: [
            {
                id: 'lbl-llco-idea',
                highlight: 'corner',
                title: 'One corner at a time',
                body:
                    'Hold the cube so a corner that needs twisting is at the top-front-right. Repeat R′ D′ R D (usually two or four times) until that one corner shows the right colour on top, then turn only the top to bring the next corner there. Press Mark complete to try one.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-llco-do',
                highlight: 'corner',
                title: "R′ D′ R D",
                body:
                    'Press Set up step, then perform `R′ D′ R D` to twist a corner back. Trust the process — this short cycle is the whole trick.',
                setupMoves: ["D'", "R'", 'D', 'R'],
                expectedMoves: ["R'", "D'", 'R', 'D'],
                hints: ['Four quarter-turns: R prime, D prime, R, D.'],
                validator: { type: 'moveSequence', moves: ["R'", "D'", 'R', 'D'] }
            }
        ]
    },
    {
        id: 'lbl-last-layer-edges',
        track: 'beginner',
        stage: 'last-layer-edges',
        title: 'Step 7 — Place the last edges',
        audience: 'Solvers one step from a finished cube.',
        description:
            'The corners are done; only the last-layer edges remain. A slice algorithm cycles them into place to finish the solve.',
        steps: [
            {
                id: 'lbl-lle-idea',
                highlight: 'edge',
                title: 'The final cycle',
                body:
                    'If the edges are swapped opposite each other, the H-permutation cycles them home in one go. Press Mark complete to learn it.',
                validator: { type: 'manual' }
            },
            {
                id: 'lbl-lle-do',
                highlight: 'edge',
                title: 'M2 U M2 U2 M2 U M2',
                body:
                    'Press Set up step, then perform the H-perm `M2 U M2 U2 M2 U M2` (each M2 is two M slices) to finish the cube. The middle slice does the work.',
                setupMoves: ['M', 'M', "U'", 'M', 'M', 'U', 'U', 'M', 'M', "U'", 'M', 'M'],
                expectedMoves: ['M', 'M', 'U', 'M', 'M', 'U', 'U', 'M', 'M', 'U', 'M', 'M'],
                hints: ['M2 means two M slice turns; the U turns separate them.'],
                validator: {
                    type: 'moveSequence',
                    moves: ['M', 'M', 'U', 'M', 'M', 'U', 'U', 'M', 'M', 'U', 'M', 'M']
                }
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
