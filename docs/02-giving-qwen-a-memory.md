# Giving Qwen a memory

*Part 2 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

In [Part 1](./01-the-critique-verify-before-you-build.md) we found that the tutor
had no memory: the backend was stateless and used only the *length* of a
learner's history. This post is about fixing that — giving the LLM something
real to remember and adapt to — while keeping the backend stateless and adding
no database.

## The design constraint that made this easy

The user's call was to keep learner memory **client-side**, extending the
existing `localStorage` pattern, and to send the backend a structured *digest*
each request. This is a good fit for a single-player learning app:

- No accounts, no auth, no migrations, no server state to operate.
- The data that matters (your mistakes, your times) lives next to the learner.
- The backend stays a pure function: `(plan, level, memory) → narration`.

The cost is that memory doesn't follow you across devices. For this app, that's
a fine trade. The architecture stays a function you can test, and the whole
feature is a few hundred lines instead of a service.

## Step 1: capture signals where the work happens

The learner's profile already lived in `frontend/src/education/profile.ts` with a
clean, DOM-free, injectable-storage pattern. We grew it with a per-stage
performance record:

```ts
export interface StageStat {
  stage: string;
  label?: string;     // human-readable, for the welcome-back nod
  attempts: number;   // completions of this stage
  mistakes: number;   // cumulative wrong moves
  bestMs?: number;    // fastest completion
  lastAt: string;     // ISO timestamp
  mastered: boolean;  // completed with zero mistakes (sticky)
}

export interface UserProfile {
  level: Level;
  method: Method;
  sessionId: string;
  history: HistoryEntry[];
  performance: Record<string, StageStat>;   // <- new
}
```

Two helpers do all the work: `recordStageResult` folds one completed
lesson/drill into the running stats, and `buildMemoryDigest` produces the compact
object sent to the backend.

The signals themselves come from the engines that already track the relevant
state — we didn't add a new subsystem, we tapped existing ones:

- **`lesson_engine.ts`** already had `moveHistory` and step validation. A move
  that leaves a sequence step off-track is counted as a mistake, reusing the
  exact same on-track logic the coaching uses:

  ```ts
  private countMistake(step: LessonStep): void {
    if (step.validator.type !== 'moveSequence') return;
    if (trailingPrefixLength(this.moveHistory, step.validator.moves) === 0) {
      this.mistakeCount += 1;
      this.stepMistakes += 1;
    }
  }
  ```

  Timing reuses the *exact* injected-clock pattern the practice engine already
  used (`now: () => number = () => Date.now()`), so it's deterministic in tests.
  On completion, the engine records the result once, guarded against
  double-recording.

- **`practice_engine.ts`** already timed solves and stored best times. We gave it
  an optional `storage` param and a wrong-move counter, so finished drills feed
  the same `performance` map. One unified signal source.

A subtle but important definition: **mastery is a zero-mistake completion, and it
is sticky.** Once you nail a stage clean, it stays mastered even if a later
attempt is sloppy. This keeps the "you've got this" signal stable.

Every bit of this is unit-tested — that mistakes accumulate, that `bestMs` keeps
the minimum, that mastery flips correctly, and that it all survives a reload:

```ts
it('accumulates attempts, mistakes, and best time per stage', () => {
  recordStageResult({ stage: 'cross', mistakes: 3, durationMs: 8000 }, store);
  recordStageResult({ stage: 'cross', mistakes: 1, durationMs: 5000 }, store);
  const stat = loadProfile(store).performance['cross'];
  expect(stat.attempts).toBe(2);
  expect(stat.mistakes).toBe(4);   // cumulative
  expect(stat.bestMs).toBe(5000);  // fastest
});
```

## Step 2: a digest small enough to put in a prompt

The model doesn't need your raw history; it needs a glanceable summary. So
`buildMemoryDigest` keeps the top few struggles and the mastered list, nothing
more:

```ts
export interface MemoryDigest {
  level: Level;
  method: Method;
  sessions: number;
  lastKind?: 'walkthrough' | 'lesson';
  struggles: { stage: string; label?: string; mistakes: number }[]; // top 3, not mastered
  mastered: string[];
}
```

This is what rides along with each generate request, replacing the old raw
`history` array.

## Step 3: thread it to the prompt — and actually use it

The backend `NarrateRequest` gained a typed `memory: MemoryDigest`, threaded
through to the narrator. The old length-only continuity string was replaced by
two functions that turn the digest into prompt text.

The first is a frame-0 welcome-back nod that names the *specific* struggle:

```python
def welcome_line(memory):
    sessions = (memory or {}).get("sessions") or 0
    if not sessions:
        return ""
    parts = [f"This returning learner has done {sessions} recent session(s)."]
    struggles = memory.get("struggles") or []
    if struggles:
        labels = ", ".join((s.get("label") or s.get("stage")) for s in struggles[:2])
        parts.append(f"They've struggled most with: {labels}.")
    mastered = memory.get("mastered") or []
    if mastered:
        parts.append(f"They've already got: {', '.join(mastered[:3])}.")
    parts.append("A brief, specific welcome-back nod is welcome on this first frame only.")
    return " ".join(parts)
```

The second is per-frame: if the frame the model is narrating *is* a stage the
learner has struggled with, nudge a gentler tone right there:

```python
def stage_struggle_note(memory, stage):
    for s in (memory or {}).get("struggles") or []:
        if s.get("stage") == stage:
            return (f"The learner has struggled with this stage before "
                    f"({s.get('mistakes')} past mistakes); be especially clear and reassuring.")
    return ""
```

That per-frame match is why the memory keys matter. Performance is keyed by
`lesson.stage ?? lesson.id`, and the curriculum lessons (Part 3) set `stage` to
the solver's stage names — `cross`, `middle-layer`, and so on. So struggling in
the cross *lesson* writes `performance['cross']`, and later, when you ask for a
full solve, the `cross` *frame* of that solve gets the gentle note. The memory
follows you across different surfaces of the app because they share a vocabulary.

## Does it work?

This is the kind of feature that's easy to ship and hard to believe. So beyond
the mocked unit tests (which assert the digest text lands in the prompt), I ran
one live call against the real model, passing a digest that claimed two prior
sessions and four past mistakes on the cross:

```
ANSWER = "Welcome back! You turn R first to position the white edge
          correctly before aligning it with U."
```

"Welcome back" because `sessions: 2`. Grounded to the cross because that's where
the digest said the learner struggled. The memory is real, and the model uses it.

## What I'd carry forward

- **Keep state where the data is born.** The engines already knew about mistakes
  and time; the win was recording what they observed, not inventing a tracker.
- **A digest is a prompt-sized projection of your state, not your state.** Decide
  what the model can act on, ship only that, and keep it human-readable so a
  failure is obvious in the logs.
- **Make surfaces share a vocabulary.** Keying performance by solver stage names
  is what lets a lesson's struggle inform a later walkthrough. Shared keys turn
  separate features into one coherent memory.

[Part 3](./03-teaching-correctness-curriculum-and-grounded-qa.md) covers the
other half: a curriculum a beginner can actually finish, and a mid-lesson Q&A
that the model can't fake its way through.
