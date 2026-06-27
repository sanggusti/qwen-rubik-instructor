# Qwen Rubik Instructor

An interactive, browser-based Rubik's Cube tutor built on a real-time 3D engine.
You turn faces, follow guided lessons, drill patterns, and step through animated
walkthroughs — all on a live cube you can grab and play with at any time.

> **Where this is heading:** today the lessons, drills, and walkthroughs are
> hand-authored. The goal is to drive them with **Qwen** — generating course
> content, explanations, and move sequences on the fly, animating them live, and
> letting the learner interrupt and experiment mid-lesson. See
> [Roadmap](#roadmap).

## What you can do today

- **Spin a real cube** — drag a face to rotate that layer, or use keyboard
  notation. Standard moves (`U D L R F B`), slices (`M E S`), and whole-cube
  rotations (`x y z`), with prime variants.
- **Take guided lessons** — beginner notation, first sequences, and
  improvement tracks. Steps validate your actual moves and track progress
  (persisted in the browser).
- **Run practice drills** — repeatable pattern drills with live evaluation,
  scoring, and feedback.
- **Explore walkthroughs** — narrated, animated step-throughs that highlight
  pieces and pace the animation so you can follow what's happening.
- **Inspect cube state** — a State panel shows move history and state
  transitions for debugging and understanding.
- **Scramble / reset** anytime, with an idle "breathing" animation when you
  step away.

## Quick start

Requirements: **Node.js 18+** and npm.

```bash
npm install        # also installs the frontend workspace
npm run dev        # start the dev server
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`).

That's the whole setup — no API keys or backend needed yet.

### Other commands

```bash
npm run build      # type-check + production build
npm run preview    # serve the production build
npm run test       # run the Vitest suite
```

## Controls

| Action | Input |
| --- | --- |
| Rotate a layer | Drag a face |
| Face turns | `U` `D` `L` `R` `F` `B` |
| Middle slices | `M` `E` `S` |
| Whole-cube rotation | `x` `y` `z` |
| Counter-clockwise (prime) | Hold `Shift` + key |
| Scramble | `Space` |
| Reset | `Enter` |

## How it works

The frontend is a single TypeScript + Vite app. The cube itself is rendered and
animated with Three.js, and the learning logic is a set of engines that drive
the same shared cube API.

```text
frontend/src/
├── core/         # cube state model + event utilities
├── scene/        # Three.js scene, cube mesh, move animator, scramble
├── education/    # lessons, practice drills, walkthroughs, evaluation
├── ui/           # HUD menu, panels, captions, drag/keyboard controls
├── configs/      # scene / lighting / debug / sound configuration
└── main.ts       # wires the cube API to the engines and UI
```

`main.ts` exposes a small cube API (`applyMoves`, `scramble`, `reset`,
`getState`, `onMove`, …) on `window.rubikInstructor`. Every learning
experience — lessons, practice, walkthroughs — is built on top of that same
API, which is also what makes the cube a clean target for an external content
generator to drive.

## Roadmap

The current app is the playable foundation. The product direction is to make the
course **dynamic** rather than static:

- Generate lesson and drill content with **Qwen** instead of a fixed catalog.
- Stream explanations and move sequences from the model and animate them live.
- Let the learner interrupt, ask, and experiment mid-lesson — the cube stays
  interactive throughout.
- Adapt difficulty and next steps to what the learner actually does on the cube.

Smaller follow-ups: timed solving mode, scrubbable move-history playback, and
additional lesson tracks (F2L / OLL / PLL).

## License

See [LICENSE](LICENSE).
