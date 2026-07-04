# Challenge Me: Google auth and a leaderboard with a clock

*Part 14 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The tension

Part 13 shipped a leaderboard and immediately confessed its flaw: user ids are
client-generated UUIDs, any client can write any id, and the times are
spoofable. For per-drill practice times inside a tutor, that's a fine trade.
For the thing we wanted next — a **full-cube timed challenge** with a public
leaderboard on the landing page — it isn't. A leaderboard you race strangers
on needs names that belong to someone.

So the assignment: a "Challenge Me" mode — scramble, clock, solve, celebrate,
rank — with real identity behind the names, and the same non-negotiable from
Part 13 carried forward: **the app without a database (or without Google)
must behave exactly as before.** Auth is a feature of challenge mode, not a
wall in front of the tutor.

Two constraints shaped everything else:

1. Identity has to be *cheap*. This is a hackathon project; nobody is
   building a password store, email verification, or refresh-token rotation.
2. The clock has to be *honest enough to demo*. Not adversarially secure —
   honest enough that the obvious one-click cheat doesn't work.

## Auth without an auth service

The design is deliberately boring: **Google's authorization-code flow,
terminated in FastAPI, minting opaque bearer tokens.**

`GET /auth/google` redirects to Google's consent screen. Google calls back
`GET /auth/callback`; the backend exchanges the code, fetches the `sub` and
`email` claims, upserts a `members` row keyed on `sub`, mints a random UUID
into `auth_tokens` with a 30-day expiry, and redirects to
`{frontend_url}/play?token=<uuid>`. The root layout grabs the token, stores
it in `localStorage`, and `history.replaceState`s it out of the URL before it
can land in browser history. From then on it's `Authorization: Bearer` and a
`require_member()` dependency on anything that writes.

What we didn't build is the interesting part:

- **No JWTs.** Opaque tokens in a table mean logout is `DELETE FROM
  auth_tokens WHERE token = ?` and there's no signature scheme to get wrong.
  At hackathon scale, a database lookup per authed request is free.
- **No refresh tokens.** Thirty days, then sign in again. The token expiry is
  compared *in SQL* (`expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
  so the stored format and the comparison format can never drift — a small
  lesson learned from the timestamp-parsing defensiveness Part 13 needed.
- **No merge with the anonymous identity.** `members` (Google `sub`) lives
  *alongside* `users` (the anonymous UUID from Part 13), not on top of it.
  A learner's tutor memory and their challenge scores are different concerns
  with different identities; merging them would entangle the offline
  guarantee with an OAuth dependency for zero demo value.

And the kill switch holds, in the same emergent style as Parts 12–13: no
`CHALLENGE_ENABLED` flag exists. `TURSO_DATABASE_URL` unset → every `/auth/*`
and `/challenge/*` endpoint returns 503; unset Google credentials → same.
The frontend's landing leaderboard swallows the failure and renders nothing.
The feature isn't disabled; it's *absent*.

## The clock, and the cheat we almost shipped

Challenge flow: click **Challenge Me** → 20-move scramble animates → the
instant `cubeStore.isBusy` goes false the clock starts → solve → the
`isSolved` derived flips → freeze the clock, submit, confetti for ten
seconds, then the top-10 modal with your row highlighted.

The store is a four-state machine (`idle → scrambling → running → solved`)
and the page wires it with three Svelte effects: one starts the clock when
scrambling settles, one runs a `requestAnimationFrame` loop while running,
one watches `isSolved`.

Here's the bug that planning caught before code did. The HUD has always had a
**Reset** button — it restores the solved state instantly. `isSolved` is a
pure derivation over cube state; it does not know *how* the cube got solved.
So the naive effect — "running and solved → finish" — turns Reset into a
one-click world record. Scramble, wait a second, hit Reset, submit 1.4
seconds to the global leaderboard.

The fix is a decision, not a trick: **anything the challenge didn't initiate
cancels it.** Reset already had a subscriber hook (`cubeStore.onReset`, used
elsewhere), so the challenge store subscribes and aborts the run — no score,
no confetti, back to idle. Scramble needed the same treatment and had no
hook, so it grew one (`onScramble`), with a guard flag so the challenge's
*own* opening scramble doesn't cancel itself.

Then the audit of call sites found the sneaky third path: the keyboard.
Space-to-scramble doesn't go through `cubeStore.scramble()` at all — it
enqueues moves directly on the Three.js animator (a Part 8 seam), so the new
hook never fires. The keyboard handler already took an `onScramble` callback;
it just needed to notify the store. That's the whole anti-cheat: three entry
points, one rule, and an `isSolved` effect that additionally requires
`status === 'running'` and a settled animator.

The UI then made the rule mostly invisible: during a live run the rail hides
Challenge Me, Guide, Scramble and Reset entirely — a racing HUD is a clock
and an escape hatch, so a **"Give Up!"** button takes their place and calls
the same `cancel()`. Hiding the buttons doesn't retire the cancel rule,
though. The keyboard shortcuts and the mobile keypad's Scramble/Reset stay
live (the keypad is how you *make moves* on a phone), so the subscriptions
remain the actual guarantee; the hidden buttons are just good manners.

Worth saying plainly: the solve *time* is still client-reported. A motivated
cheater can POST any number with a valid token. The anti-cheat here is
UX-level honesty (the accidental cheat is impossible), not adversarial
security (the deliberate one isn't). Same posture as Part 13's leaderboard,
one identity tier up, and the docs say so instead of pretending.

## The landing page fought back

The plan said "insert a leaderboard section between the hero and the first
content section." The first screenshot said otherwise: the scroll-scrubbed
3D cube from the landing scene (Part 8's persistent canvas) rendered
*through* the new section, parked squarely on top of the heading.

The reason is the landing page's central conceit: the cube isn't in any
section — it's a fixed canvas behind everything, and a `measure()` pass finds
every `.content-section`, computes its center and side (from the `flip`
class), and builds the scroll→pose timeline that flies the cube from section
to section. A new section that isn't a `.content-section` doesn't exist to
the timeline; the cube happily flies through the space it occupies.

So the leaderboard section stopped being special and started being a
citizen: it renders the same two-column grid as every other section — an
empty `cube-col` spacer the parked cube travels into, and a `text-col` glass
panel holding the table. One subtlety remained: the section's content is
async (it may render nothing if the board is empty or the backend is off),
and `measure()` runs on mount and resize. A section that appears *after*
measurement shifts every section below it and desynchronizes the cube's
flight path. The fix is one honest hack: after the fetch settles, dispatch a
synthetic `resize` event — the listener the page already has re-measures.

## Verifying a login flow without logging in

Part 12's E2E philosophy — run the real stack, pin the expensive dependency —
had an obvious extension here. The expensive dependency is Google, and you
can't automate a consent screen (nor should a test want to).

But the OAuth exchange is precisely one seam wide. Everything after the
callback — token in URL, localStorage adoption, `/auth/me`, the username
step, score submission, the boards — runs on rows in two tables. So the
Playwright pass runs the backend against a local file database, inserts a
member row, mints a token with the same `create_token()` production uses,
plants it in `localStorage`, and reloads. From the app's point of view, a
user just came back from Google.

The checks that matter, in the order they ran:

- Landing leaderboard renders ranked rows (and hides when the backend is
  down); the desktop rail shows **⚡ Challenge Me** above Guide; the mobile
  viewport swaps it for a top-right FAB.
- A token whose member has no username lands on the **pick-a-username** step;
  submitting a taken name renders the 409 inline ("That username is already
  taken."); a valid name closes the modal and *starts the challenge* — the
  scramble fires and the clock appears without another click.
- Mid-run, clicking Reset kills the timer and writes **no row** — the
  anti-cheat check, asserted against the database, not the UI.
- The solve itself: the test subscribes to `cubeStore.onMove`, records the
  scramble as it animates, then plays the *inverse sequence* back through
  `applyMoves()`. (The old trick — `reset()` to force a solved state — is
  exactly what the anti-cheat now cancels, which is its own kind of
  regression test.) Confetti over a frozen clock, then the modal:
  `e2e_racer`, rank 1, 00:32.4, highlighted.
- Back on the landing page, the new score is in the table and
  `GET /challenge/leaderboard` returned 200.

The one thing no automation covers is Google's half of the handshake — the
consent screen and the real callback — verified once, by a human, in a real
browser. Knowing exactly which sliver of the flow needs a human is most of
what the seam bought.

## What it cost

Three tables (`members`, `auth_tokens`, `challenge_scores` — with `username`
denormalized onto scores so the leaderboard read is one table), one
migration file the existing `_migrate()` picked up unprompted, two small
backend packages wired in two lines of `main.py`, and on the frontend: an
auth store, a challenge state machine, four components, and one new
subscriber hook on the cube store. The existing suites moved by one
assertion (the migration-count test now expects two versions). Backend 739
green, frontend 238 green, svelte-check clean.

## The throughline holds

**Deterministic skeleton, generative skin** has a corollary this feature
leans on: *the skeleton is what makes honesty cheap*. `isSolved` is a pure
function of cube state, so "what counts as a solve" is not a judgment call —
which is exactly why the Reset cheat was visible at planning time and why
the fix is three subscriptions and a status guard rather than heuristics.
The clock, the state machine, the token table, the SQL-side expiry: all
deterministic, all tested. The only generative thing anywhere near this
feature is the confetti.
