# Playable and learnable: an E2E suite that plays the whole game (without the API bill)

*Part 12 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The brief

By 2026-07-02 the project had 948 tests — 710 backend, 238 frontend — and not
one of them opened a browser. Every engine, validator, solver stage, and SSE
contract was covered in isolation. Whether a human could *open the app, turn
the cube, follow a lesson, practice, ask Qwen, and recover from a mistake* was
covered by nothing but hope and manual spot-checks.

The brief for this phase was explicit: **the app should be demonstrably
playable and learnable.** Not "the endpoints return 200" — the actual learner
journey, in a real browser, against the real backend, including the
Qwen-narrated flows.

Three questions had to be answered before writing a single spec:

1. How do you E2E-test an LLM feature without paying for (or flaking on) the
   LLM?
2. How do you assert anything about a WebGL canvas Playwright can't see into?
3. What do you do when the journey you're told to test includes a feature that
   doesn't exist?

## Degradation as a test harness

The answer to the first question was already in the codebase, disguised as an
error-handling policy. Every Qwen call in the backend is wrapped so that a
failure falls back to deterministic narration — the stream still completes,
every beat/step event just carries `fallback: true` and template text. The
solver underneath is pure LBL: same cube state in, same moves out, every time.

That means the *entire* production pipeline — HTTP, CORS, SSE framing, plan
building, solving, merging — runs for free if you simply make the LLM call
fail fast:

```ts
// playwright.config.ts — the backend webServer entry
env: { DASHSCOPE_API_KEY: 'e2e-dummy-key', DASHSCOPE_BASE_URL: 'http://127.0.0.1:9' }
```

An unroutable base URL guarantees no real call, no cost, and no key leak, and
the connection refusal is instant, so the suite is fast. The backend log even
confirms it per run: `narrate_plan ... fallbacks=8/8`.

This is worth naming as a pattern: **if your LLM integration degrades
gracefully, the degraded mode is your E2E harness.** You're not mocking the
network layer and hoping the mock matches reality — you're running reality
with the one nondeterministic component pinned to its deterministic floor. A
separate `@live` spec (excluded by default, opt-in via `E2E_LIVE=1`) covers
the real-model happy path, same shape as the backend's existing
`pytest -m live` escape hatch.

The deterministic solver is what makes the flagship assertion possible at all.
The suite's money test is the product's whole pitch in one spec:

> scramble the cube with a fixed sequence → click **Solve my cube (Qwen)** →
> a narrated walkthrough streams in over real SSE → click **Solve my cube** →
> the learner's actual cube animates to solved → `isSolved === true` →
> **Reset to checkpoint** restores the exact pre-solve state, deep-equal.

If that passes, "playable and learnable" is not a claim, it's a green check.

## Three lines instead of thirty test-ids

The cube is a Threlte/three.js canvas. Its pixels are opaque to a test runner,
and the codebase had zero `data-testid` attributes. Rather than sprinkle
dozens of them, the app got exactly one test hook, DEV-gated so production
builds strip it:

```ts
// src/routes/play/+page.svelte
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__cubeStore = cubeStore;
}
```

That one object answers everything the canvas can't: `isBusy` (deterministic
settle-waiting between animated moves), `isSolved` and `getState()` (truth
assertions, including the deep-equal for checkpoint restore), and
`setMoveDuration(20)` — the store already had a speed control, so a 166-move
solve animates in seconds instead of half a minute. Everything else is
asserted through surfaces a human can see: button text, ARIA labels, and the
State panel's DOM. One discipline made the suite stable: **zero
`waitForTimeout` calls** — every wait is a condition on the store or an
auto-retrying text assertion.

Input goes through the same channel a keyboard user's would — the window-level
key listener (`R`, `Shift+R` for prime) — with one wrinkle found the hard way:
after each keypress the helper waits for a move *counter* to increment, not
for `isBusy` to flip, because a 20 ms animation can start and finish between
two polls.

## The feature that didn't exist

The brief said "ask Qwen." The landing page said "Ask Qwen anything
mid-solve." The API client had a complete, typed `askQwen()` function and the
backend's `/ask` endpoint had pytest coverage.

Nothing in the UI called any of it. The advertised feature was dead code on
both ends of a wire nobody had connected.

This is the quiet value of writing an E2E plan against the *promised* journey
instead of the shipped one: the plan itself becomes an audit. The fix was a
small form in the stage caption — the panel that's visible during every
lesson, drill, and walkthrough — that sends the question grounded with the
current step title and live cube state, and renders the one-sentence answer
under it. The E2E spec then covers it like any other feature (in fallback mode
the answer is deterministic, which makes the assertion trivial).

## What the browser found that 948 unit tests couldn't

The first full run failed in ways no unit test could have predicted. Each
failure was a real defect, and each diagnosis is a small lesson in not
trusting your first hypothesis.

### 1. The 500 that wore a CORS mask

Every Qwen-backed flow failed in the browser with `Couldn't ask: Failed to
fetch`. "Failed to fetch" smells like DNS or CORS, and the first hypothesis
was IPv6 — macOS resolves `localhost` to `::1`, uvicorn was bound to IPv4
`127.0.0.1`, and a quick `curl` even confirmed the IPv6 refusal. Plausible,
evidence-adjacent… and not the bug. The Playwright trace showed the page was
already reaching `http://127.0.0.1:8000/ask`. A direct `curl` of the endpoint
returned the truth: **Internal Server Error**.

The traceback landed on the narrator's client factory:

```
File "narrative/llm_narrator.py", line 88, in get_client
    return OpenAI(
openai.OpenAIError: Missing credentials...
```

An *invalid* API key fails inside `_complete()`, which every caller wraps with
the fallback guard. An *empty* key crashes the `OpenAI(...)` constructor —
which runs **outside** those guards. And because FastAPI's error responses
carry no CORS headers, the browser is forbidden from reading the 500 and
reports it as a generic network failure. A server bug, wearing a CORS mask,
impersonating an infrastructure problem.

The fix is one honest line — defer the failure to where it's handled:

```python
api_key=settings.dashscope_api_key or "missing-api-key",
```

plus a regression test pinning it. Backend suite: 710 green.

### 2. The typewriter that froze mid-sentence

The walkthrough spec asserted the final beat's full narration and got
`"Solving = bringing"` — frozen, mid-word, forever. The caption's typewriter
effect lived in a Svelte `$effect` whose teardown cleared the pending
`setTimeout`. But the effect re-runs on *every* store emit (each move's
progress tick), and teardown runs before every re-run. Same caption text →
early return → nobody restarts the chain. Any store activity during typing
silently killed the narration.

Users had certainly seen this — text stalling mid-sentence during move-heavy
beats — but it reads as "huh, weird" and nobody files it. A machine asserting
the full sentence found it in one run. The fix inverts ownership: no teardown;
the chain self-terminates when a newer caption takes over
(`if (lastKey !== key) return`).

### 3. The click that Playwright refused to make

Switching Guide tabs while a panel was open timed out with the most useful
error message in this whole phase:

```
<div class="modal-backdrop"> intercepts pointer events
```

Playwright wasn't being pedantic — it was reporting exactly what a human
experiences: the tab rail is fully visible behind the translucent backdrop,
*looks* clickable, and eats your click closing the modal instead. Every tab
switch cost two taps. Actionability checks are an accessibility audit you get
for free; when the runner refuses to click something visible, believe it. One
z-index (rail above backdrop) made tab switching one click for humans and
tests alike.

## Green suite ≠ learnable: the human pass

With 22 specs green, a deliberate second pass played the app as a person — real
Qwen key this time — and immediately caught what the suite structurally
couldn't. The suite *knows where everything is*; a learner doesn't.

The clearest example: the first lesson step says "press **Mark complete** to
continue" — and there is no such button on screen. It lives in the Lessons
panel, which auto-closed the moment you picked the lesson. The E2E test
happily reopened the panel and clicked it, because the test knew to. A
beginner stares at a caption referencing a button that isn't there. The fix
puts Mark complete in the caption itself, next to the sentence that names it —
and a new spec now covers the *caption* path, encoding the human's route
rather than the expert's.

The same pass produced the rest of the findings list: no onboarding hint on
the play screen (nothing says "drag a face" or "press R"), a 170-move
walkthrough for a 4-move scramble animating for ~30 seconds with no progress
cue (fixed with a live `Solving… 42/166` counter), drill round/score visible
only in a closed panel, and a favicon 404 as the only console error. It also
delivered the payoff moment that no fallback-mode test can: the real model
opened with *"Welcome back — let's solve your cube together, layer by layer"*
— the client-side memory digest from Part 6, visibly working, and a grounded
mid-lesson answer ("The apostrophe means 'counterclockwise'…") from the newly
wired ask box.

## A viewport resize is not a phone

"Have you run it on phone mode too?" Honest answer at that point: only a
390-pixel-wide *desktop*. The resize had genuinely caught one bug — the fixed
vertical FOV cropped the cube on portrait aspect ratios, fixed by pulling the
camera back radially (`max(1, 0.67 / aspect)`, same look-at direction). But
the app's entire touch UI is gated on `matchMedia('(pointer: coarse)')`, and
no resize ever makes a mouse coarse. The touch keypad, the Keypad quick
action, the mobile layout decisions — all of it was untested.

Real device emulation (touch events, mobile UA, coarse pointer) found the bug
in minutes: on a phone, the open keypad and the lesson caption both anchor to
the bottom of the screen, and the keypad — higher z-index — sat on top of the
step text. Which is precisely the moment a phone learner needs both: read the
step, tap the moves. The fix threads the one bit of state that matters
(`keypadOpen`) into the caption as a `raised` prop that lifts it clear. The
first version of the fix capped the raised caption too short and pushed the
Mark complete button below the fold — caught by looking at the screenshot, not
the selector, which is its own small lesson about verifying fixes visually.

Two more phone-specific touches: the onboarding hint now speaks touch ("drag a
face · **Keypad** for precise moves") instead of listing keyboard shortcuts at
someone with no keyboard, and the suite gained a permanent `mobile` project —
iPhone 13 emulation pinned to `browserName: 'chromium'`, because the device
descriptor defaults to WebKit, which isn't installed and can't take the
`--enable-unsafe-swiftshader` flag headless WebGL needs. (Chromium emulation
is not Safari; a real-device pass remains on the list before the demo video.)

## Where it landed

- **25 E2E specs** across two projects (23 desktop, 2 mobile), ~1.7 minutes,
  zero API cost, zero `waitForTimeout`. `npm run test:e2e` boots both servers
  itself.
- **238 frontend unit tests, 710 backend tests**, all green throughout.
- Three product bugs fixed that only a browser could see (empty-key 500,
  frozen typewriter, backdrop-eaten clicks), one advertised feature wired into
  existence (mid-lesson Ask Qwen), six human-QA findings fixed (caption Mark
  complete, onboarding hint, solve progress counter, portrait camera, inline
  drill score, favicon), and one phone-only layout collision fixed under real
  touch emulation.

## Lessons

1. **Graceful degradation is a free E2E harness.** If the LLM path falls back
   deterministically, run the whole real stack with the model pinned to its
   floor — and keep one tagged live test for the real thing.
2. **An E2E plan is an audit of promises.** Writing specs against the journey
   you *advertise* finds the features you never shipped.
3. **Errors without CORS headers lie to the browser.** A backend 500 can
   present as "Failed to fetch"; when a fetch fails mysteriously, curl the
   endpoint before blaming the network. (And: your first plausible hypothesis
   — IPv6, here — deserves the same verification as the code survey in Part 5.)
4. **When the test runner refuses to click something visible, that's a UX
   finding**, not a test problem. Actionability checks are a free
   accessibility audit.
5. **A green suite proves the app works for someone who already knows it.**
   Follow it with a pass as a person who doesn't — then encode what they
   tripped on as new specs.
6. **A narrow viewport is not a phone.** Touch UIs gate on pointer capability,
   not width; emulate coarse pointers or you're testing a thin desktop.
