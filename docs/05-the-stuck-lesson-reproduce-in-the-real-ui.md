# The stuck lesson: the bug is rarely where the survey says

*Part 5 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The report

> There is no Next button in `Lesson from my cube (Qwen)` — it gets stuck. The
> UI/UX is also not intuitive just yet.

Short, specific, and the kind of bug that's easy to misdiagnose from the code
alone. So I did the thing Part 1 of this series was about: I refused to trust a
survey and went to reproduce it.

## Two confident, wrong hypotheses

I sent an exploration agent to trace the path. It came back crisp and certain:

> **Root cause: the lesson has no steps.** `/narrate/lesson` returns an empty
> `steps` array; `step` is `undefined`; `renderDetail` throws on
> `step.validator.type` before the nav buttons are ever created.

It even offered a backup theory: a field-name mismatch between the backend
validator (`cubeSolved`) and the frontend type. Both were plausible. Both were
wrong.

A single live call settled it:

```
META frameCount= 8 title= Solve your cube, step by step
STEP idx=0 id=intro                 validator={'type': 'manual'} nmoves=0
STEP idx=1 id=cross                 validator={'type': 'manual'} nmoves=15
STEP idx=2 id=first-layer-corners   validator={'type': 'manual'} nmoves=20
… 8 well-formed steps …
DONE
```

Eight steps, all `manual`, validator shape matching the frontend type exactly.
The backend was fine. The frontend's `renderDetail` *always* renders Next and
Previous. On paper, there was no bug.

## So I opened the browser

This is the part no amount of reading finds. I drove the real app: scramble,
Lessons, **Lesson from my cube (Qwen)**, wait for Qwen to generate. The lesson
loaded — and the only thing on screen was the caption bubble beside the cube:

```
┌─ SOLVE YOUR CUBE THE CFOP WAY ──────  × ┐
│ Let's Begin Solving — Welcome back!     │
│ Let's solve your cube layer by layer…   │
└─────────────────────────────────────────┘
```

A title, body text, and an `×`. **No Next. No Mark complete.** Exactly the
report. The lesson wasn't broken — its controls were invisible. Three separate
things conspired:

1. **The panel closes itself.** `main.ts` called `hud.close()` right after
   `loadGenerated(...)`. The controls live in the *Lessons panel*; the caption
   bubble is display-only. So the moment the lesson started, the only thing left
   on screen was the one element with no way forward.

2. **Even open, the controls are below the fold.** Reopening the panel revealed
   the detail rendered *after* the full ten-item lesson list, in one scroll
   container. `Step 1 of N`, `Mark complete`, `Next` all sat below the viewport.
   You had to scroll past the whole catalog to find the button to advance.

3. **The generated lesson showed up as 🔒 locked.** It was appended to the gated
   beginner track, so the unlock logic disabled it — a confusing dead entry for
   the lesson you were *currently in*.

None of these is a crash. All three are layout. That's why reading the code found
"no bug" and the browser found it in thirty seconds.

## The fix: put the controls where the eyes are

The user picked the approach: when a lesson is active, collapse the browse UI and
**pin the step detail and its controls to the top of the panel**, behind a "◀ Back
to lessons" affordance. Keep the panel open so the controls are always there.

- `LessonsPanel` hides the track filter, the generate button, and the list while a
  lesson is active; renders Back-to-lessons + the pinned detail.
- `main.ts` no longer calls `hud.close()` when a lesson starts.
- Generated lessons get a `generated: true` flag and are never gated, so they list
  as a normal, re-enterable entry.

## The gotcha that only the browser would show

My first cut hid the list with the obvious thing:

```ts
this.listEl.hidden = true;
```

Type-checked, tested, shipped to the dev server — and in the browser the list was
*still there*, the pinned detail dangling below it. The HTML `hidden` attribute
sets `display: none` via the user-agent stylesheet, but the panel's CSS sets an
explicit `display` on `.lsn-list` / `.lsn-filter`, and a class rule beats the UA
rule. `hidden` was being silently overridden. The fix is inline display, which
wins:

```ts
const display = visible ? '' : 'none';
this.listEl.style.display = display;
```

A textbook CSS-specificity trap — and completely invisible to `tsc`, to the unit
tests, and to reading the code. The screenshot caught it on the first try.

## Verified the way it broke

`tsc` clean, 162 Vitest tests green — but the real verification was the same loop
that found the bug. In the browser: generate the Qwen lesson → the panel **stays
open** with `Step 1 of 6`, `Mark complete`, and `Next` all visible without
scrolling → `Next` advances to Step 2 → `Back to lessons` restores the list →
the generated lesson now lists unlocked. Hand-authored lessons inherit the same
pinned layout.

## The throughline

Part 1's lesson was "reproduce a claimed failure before fixing it." This is its
sequel for UI work: **a bug in what the user *sees* will not be found by reading
what the code *does*.** The agent's code-survey was fast and articulate and
confidently pointed at a crash that didn't exist; the actual defect was three
layout decisions and a CSS-specificity quirk, none of which a type-checker or a
unit test can feel. For anything a human looks at, the cheapest source of truth is
still the oldest one: run it, and look.
