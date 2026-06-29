# Teaching correctness: a verified curriculum and grounded Q&A

*Part 3 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

[Part 1](./01-the-critique-verify-before-you-build.md) found the gaps;
[Part 2](./02-giving-qwen-a-memory.md) gave the tutor a memory. This post is
about the two places where *correctness* is non-negotiable: the curriculum that
teaches you to solve, and the "ask Qwen anything" box that must never invent a
move. Both lean on the same principle — let the LLM write words over a structure
it cannot break.

## The problem: a tutor that couldn't teach solving

The static catalog had four lessons — notation, one trigger, two speed drills. A
beginner who finished all four still couldn't solve a scrambled cube, because the
actual method (layer by layer) was never taught. The fix is a real curriculum:
seven lessons mirroring the solver's own stages, white cross through last-layer
edges, each with a concept step and an algorithm to drill.

That sounds like content work, not engineering. The engineering is in making sure
the content is *correct*.

## The trap: hand-written cube algorithms are a minefield

Each algorithm drill follows a satisfying, self-checking pattern borrowed from
the existing topic lessons: scramble the cube with the *inverse* of the
algorithm, so that performing the algorithm returns it to solved. For example,
the first-layer corner insert:

```ts
{
  id: 'lbl-flc-insert',
  setupMoves: ['U', 'R', "U'", "R'"],          // inverse of the trigger
  expectedMoves: ['R', 'U', "R'", "U'"],        // the trigger itself
  validator: { type: 'moveSequence', moves: ['R', 'U', "R'", "U'"] }
}
```

The inverse of a move sequence is the reversed list with each move inverted. For
four moves that's easy. For the eight-move middle-layer insertion
`U R U' R' U' F' U F`, or the twelve-move H-permutation
`M2 U M2 U2 M2 U M2` expanded into single quarter-turns with slice moves — it is
extremely easy to get a sign or an order wrong by hand. And a wrong setup is a
silent failure: the lesson looks fine, but performing the "correct" algorithm
doesn't solve the cube, and the learner is taught something subtly broken.

## The fix: let the engine grade the homework

The frontend already has a real, tested cube engine (`core/state.ts`) with
`applyMove` and `isSolved`. So instead of trusting my arithmetic, I wrote a test
that replays *every* drill on the real engine: apply the setup, confirm it
actually scrambles, apply the taught algorithm, and assert the cube is solved
again.

```ts
it.each(drills)('setup + algorithm solves: $lesson / $step.id', ({ step }) => {
  const state = solvedState();
  for (const m of step.setupMoves!) applyMove(state, m);
  expect(isSolved(state)).toBe(false);   // setup actually scrambles

  const algo = step.validator.moves;
  for (const m of algo) applyMove(state, m);
  expect(isSolved(state)).toBe(true);    // algorithm restores it
});
```

This is the whole game. The test discovers the drills by scanning the catalog, so
it automatically covers any lesson added later. It caught my inverses while I
wrote them, and it will catch the next person's. The M-slice H-permutation — the
one I was least sure about — passes, which means it's right, not that I got lucky.

A second test asserts the seven stages are present and in the solver's canonical
order, so the *path* stays coherent, not just each step.

## A deliberate product decision: gate on attempts, not mastery

The lessons unlock in order — a stage opens once the previous one is done. The
obvious rule is "unlock when the previous stage is *mastered*." But mastery, from
Part 2, means a zero-mistake completion. Gating on perfection would hard-wall a
beginner who makes a single slip on step three — exactly the person the tutor
exists for.

So the gate is **attempted (`attempts > 0`), not mastered**:

```ts
const attempted = (performance[lesson.stage ?? lesson.id]?.attempts ?? 0) > 0;
prevDone = attempted; // the next lesson opens once this one is completed at all
```

This is a place where the "correct" implementation and the *right* one diverge.
The plan said "mastered"; the humane choice is "completed." Worth flagging to the
user, worth choosing deliberately.

## Mid-lesson Q&A: the model's most dangerous surface

The last feature is the most exposed: let the learner type any question about the
current step and have Qwen answer. Free-form generation is where an LLM tutor
most wants to hallucinate — confidently telling you to "do an L then a B" when
neither move belongs in this step.

The system already had a guard for this on its narration path: a validator that
parses the model's JSON and rejects any answer mentioning a move outside the
frame's allowed list. The trick was to reuse it for Q&A without rewriting it. The
answer path builds a *synthetic* frame whose `moves` are the moves in play, then
runs the model's reply through the exact same validator:

```python
def answer_question(question, *, stage="", moves=None, level="newbie", memory=None, ...):
    moves = moves or []
    # Synthetic frame: validation only needs `moves` (the allow-list) and `stage`.
    frame = VisualFrame(id="ask", stage=stage or "ask", moves=moves, focus="", expected="")
    messages = [
        {"role": "system", "content": _ASK_SYSTEM},     # "only mention moves in the list"
        {"role": "user", "content": build_ask_message(question, stage=stage, moves=moves, ...)},
    ]
    for _ in range(2):
        content = _complete(client, model, messages)
        ok, reason, narration = validate_narration(frame, content)   # same guard as narration
        if ok:
            return narration.text, False
        # re-prompt once with the specific problem, then fall back
    return ("Take it one move at a time, and use Show next move if you get stuck.", True)
```

The behaviour is verified with a mocked model that *tries* to cheat:

```python
def test_ask_rejects_invented_moves(client, monkeypatch):
    monkeypatch.setattr(llm_narrator, "_complete",
        lambda *a: json.dumps({"text": "Do L then B to fix it."}))
    res = client.post("/ask", json={"question": "help", "moves": ["R", "U"]})
    body = res.json()
    assert body["fallback"] is True                         # rejected, re-prompted, fell back
    assert "L" not in body["text"] and "B" not in body["text"]  # never leaked the invented moves
```

A model that mentions `L`/`B` when only `R`/`U` are in play gets re-prompted once,
then replaced with a safe, grounded fallback. The invented moves never reach the
learner. The same live call from Part 2 shows the happy path: a grounded,
memory-aware answer that only references the moves actually on the table.

On the frontend, the ask box lives *outside* the part of the panel that
re-renders on every move, so a half-typed question survives you turning the cube.
The "Explain differently" button from the rescue flow funnels into the same
endpoint with a canned prompt. And because the question and answer are just an
HTTP round-trip, the cube stays fully interactive the whole time — which was the
entire point of "let the learner interrupt and experiment mid-lesson."

## The pattern under all of it

Three features, one shape:

- The **curriculum** is correct because a deterministic engine grades every
  algorithm, not because I trusted my own inverses.
- The **Q&A** is safe because a deterministic validator vets every answer, not
  because the prompt politely asks the model to behave.
- The **memory** from Part 2 is honest because the digest is built from recorded
  facts, not the model's recollection.

The LLM is genuinely valuable here — it makes the tutor warm, responsive, and
adaptive in a way a decision tree never could. But it is valuable precisely
because it is fenced. Every place it could be wrong, something deterministic and
tested is standing between it and the learner. That's the difference between an
LLM tutor that's delightful and one that quietly teaches you the wrong thing.

## Where it landed

Five phases, all shipped with tests: backend 697 passing, frontend 162 passing,
a clean production build, and a live model call confirming the loop end to end.
The prototype you could play with is now a tutor you can learn from — and, just
as importantly, one whose correctness you can prove.
