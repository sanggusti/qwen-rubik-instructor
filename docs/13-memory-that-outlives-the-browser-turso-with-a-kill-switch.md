# Memory that outlives the browser: a Turso mirror with a kill switch

*Part 13 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## The tension

Parts 2 and 6 built a learner memory that decays, forgets, and budgets its own
recall — and it all lives in `localStorage`. That was a feature, not a
shortcut: the app is playable and learnable with the backend completely off,
and Part 12's E2E suite pins that promise in a browser (`backend-down.spec.ts`
literally aborts every backend request and asserts the app still teaches).

But for the MemoryAgent track, browser-local memory has an obvious ceiling.
Clear your site data and the tutor forgets you. Switch devices and you're a
stranger. And the backend — the thing that talks to Qwen — never *owns* any
memory at all; it's handed a digest per request and amnesiac in between. We'd
already written the design note
([Turso as the persistent-memory layer](./research/turso-persistent-memory.md));
this is the post where it became code.

So the assignment was two requirements pointed at each other:

1. Make learner memory **persistent and queryable** server-side — sessions,
   context, history, mastery, due-for-review, timed solves, a leaderboard.
2. Change **nothing** about the offline path. The E2E suite must pass
   *unchanged* — not adapted, unchanged.

The design that resolves the tension is a **mirror with a kill switch**: the
client stays authoritative, the server keeps a best-effort copy, and an empty
env var means the database — code, schema, endpoints and all — effectively
isn't there.

## The kill switch we already had

The backend already contains a pattern we liked: there is no `FALLBACK_MODE`
flag anywhere. An empty `DASHSCOPE_API_KEY` simply makes every LLM call fail
fast, and the `try/except` around each call returns deterministic template
text. Fallback isn't a mode; it's *emergent* from a missing credential. Part
12's whole E2E strategy stands on that.

Persistence copies the shape exactly. `TURSO_DATABASE_URL` unset (the
default) → `database.init()` returns `False`, the connection stays `None`, and
every service function no-ops (`None`/`[]`/`False`). Set it to a plain file
path (`data/rubik.db`) and you get a local libSQL database with zero external
services — that's the dev and test story. Set it to `libsql://…` plus
`TURSO_AUTH_TOKEN` and you're on Turso cloud. `init()` never raises: a bad
URL, a missing wheel on some platform, a network failure — all degrade to
"persistence disabled," never to "backend won't boot."

The client half of the kill switch is silence. Every new frontend call
(`api/memory.ts`) is fire-and-forget with a 4-second timeout and a `catch`
that swallows everything. With the backend down, the new code paths produce no
errors, no console noise, no UI difference. That's why the E2E suite passes
unchanged: from the browser's point of view, an absent database is
indistinguishable from the world before this feature existed.

## Client-authoritative, with one exception

The tempting architecture was to promote the server to source of truth and
demote `localStorage` to a cache. We didn't, for a reason worth stating: the
offline path isn't a degraded mode in this app, it's a *guarantee*, and a
guarantee needs an owner. The owner stays the browser.

So the sync is a **whole-profile snapshot**, not an event stream.
`POST /memory/sync` carries the entire profile — level, method, history (it's
capped at 10 entries), and the per-stage stats map — and the server replaces
that user's rows wholesale. Snapshot-replace buys three properties that
event-sourcing would make us earn: it's idempotent (retries are harmless),
order-insensitive (two racing syncs converge on the later one), and
self-healing (a client that missed a sync fixes everything on the next one).
The frontend hooks are two lines in the profile store — after `setLevel` and
`appendHistory`, `void syncProfile(this.profile)` — plus one on drill
completion.

The one exception is **timed solves**. A leaderboard needs every attempt, not
the folded-down `bestMs` the profile keeps, so attempts are the one
event-shaped thing: `POST /attempts` appends a row, `GET /leaderboard` takes
`MIN(duration_ms)` per user. Everything else mirrors; attempts accumulate.

And the identity? It was already there, hiding under the wrong name.
`profile.sessionId` — a UUID minted once per browser and stable forever after —
is not a session id at all; it's an anonymous *user* id that had simply never
been sent to the backend. Every new API field and column calls it `userId`.
(The `sessions` table, meanwhile, stores what the client calls history
entries — one row per completed walkthrough or lesson — because that's what
`MemoryDigest.sessions` actually counts.)

## The digest is the contract

The most load-bearing decision is invisible in the diff: **`llm_narrator.py`
changed by zero lines.**

The narrator consumes a plain dict — `sessions`, `struggles`, `mastered`,
`dueForReview` — and doesn't care who built it. So the persisted path doesn't
introduce a new memory format; it introduces a second *producer* of the same
one. `service.load_digest(user_id)` reads the mirrored rows and emits a dict
shaped exactly like the client's `buildMemoryDigest` output, and the
precedence rule in `main.py` is four lines:

```python
def _memory_dict(req) -> Optional[dict]:
    if req.memory is not None:
        return req.memory.model_dump()
    return service.load_digest(req.userId) if req.userId else None
```

A client-sent digest **always wins** — the client is authoritative and its
digest reflects the session in progress, including the mistake you made ten
seconds ago. The persisted digest is the fallback for the interesting new
case: a request that carries only a `userId`. That's the cross-device story —
a fresh browser with an old identity gets Qwen's "welcome back, you've
struggled with the middle layer" nod from the server's memory alone.

Two consequences of "the digest is the contract," one cheap and one paid for:

**Due-for-review is derived, never stored.** It's a pure function of
`mastered + last_at` (the forgetting curve from Part 6), so a
`due_for_review` column would be a second source of truth that goes stale by
definition. The schema stores facts; staleness is computed at read time.

**`buildMemoryDigest` is now ported twice.** The decay half-life, the review
interval, the forget threshold, the 3/6/3 caps — all now live in
`profile.ts` *and* `db/service.py`. This project has precedent: the cube
engine is deliberately ported twice (TS and Python) and pinned by
cross-validation tests. The digest port gets the same treatment — the
backend's `test_db.py` mirrors the decay/forget/due-for-review cases from
`profile.test.ts` line for line ("forgets a struggle whose faded weight drops
below the threshold", "surfaces stale mastered skills as due for review"…),
so the two implementations can only drift by failing a test. It's a wart,
it's documented as a gotcha, and it's the price of a stateless narrator.

## The schema is four tables

Nothing exotic — the schema maps 1:1 onto types the frontend already had:

- `users` — the anonymous id, an optional leaderboard `handle`, level/method.
- `sessions` — mirrors `HistoryEntry` (kind, method, stages, timestamp).
- `stage_stats` — mirrors `StageStat`, one row per (user, stage):
  attempts, mistakes, best time, `last_at`, `mastered`.
- `solve_attempts` — the event log: user, drill, duration, timestamp.

Migrations are versioned `.sql` files applied idempotently at startup and
recorded in `schema_migrations`. No Alembic, no ORM — the whole data layer is
a connection module and a service module, and the single seam (`execute` /
`query` behind one lock) is the thing tests monkeypatch or point at a temp
file, exactly the way the LLM tests monkeypatch `_complete`.

The client is the `libsql` PyPI package — the maintained Turso Python SDK
(the older async `libsql-client` is archived). It's a sqlite3-compatible
DBAPI that happily opens a local file, which is what makes "a fresh dev setup
runs with a local database" true with zero services: the test suite runs
against `tmp_path`, dev runs against `data/rubik.db`, production points the
same code at a `libsql://` URL.

## What the tests caught (and what they exposed)

Two finds worth the price of admission.

**The upsert that quietly forgot.** The first version of `upsert_user` used
the idiomatic-looking:

```sql
INSERT INTO users (id, level, method, handle)
VALUES (?, COALESCE(?, 'newbie'), COALESCE(?, 'lbl'), ?)
ON CONFLICT(id) DO UPDATE SET
  level = COALESCE(excluded.level, level), ...
```

Spot the bug: `excluded.level` is the value the INSERT *tried* to insert —
which has already been coalesced to `'newbie'`. So updating a user without
specifying a level would silently reset an `'advanced'` user to `'newbie'`.
`COALESCE(excluded.x, x)` can never preserve the existing value when the
INSERT clause has already applied defaults. The fix is to coalesce the UPDATE
against the raw bind parameters instead of `excluded`. A four-line unit test
("upsert keeps fields not provided") caught it before it ever ran against a
real database — this is exactly the class of bug that survives manual smoke
testing, because smoke tests always provide all the fields.

**The stage stat that was never there.** Verifying the golden path in a real
browser — complete a drill, watch the leaderboard render, then inspect the
database — turned up a surprise: the drill's attempt row was there, but its
`stage_stats` row wasn't. The sync wasn't broken; it was *faithfully
mirroring an absence*. `practiceStore` constructs its `PracticeEngine`
without a storage argument, the constructor defaults it to `null`, and
`recordStageResult(result, null)` — with storage passed *explicitly* as null
rather than omitted — skips the default-parameter fallback and writes
nowhere. Practice drills have never contributed to the learner profile; only
lessons have. That's a pre-existing behavior from Part 2's wiring, so per the
project's surgical-changes rule it's flagged, not fixed — but it's a lovely
specimen of how a mirror makes the original legible: the database made
visible a gap that `localStorage` had been silently normalizing for weeks.

## The leaderboard, honestly

The demo-visible payoff is small and deliberate: complete a drill and the
Practice panel shows **Fastest solves** — top five, best clean time per user —
with a "Name on leaderboard" input whose value lives in `localStorage` and
rides along on the next sync. No account, no login: user ids are
client-generated UUIDs and any client can write any id, which means
leaderboard times are spoofable. For a hackathon demo that's the right trade,
and the README says so out loud rather than pretending otherwise. (The server
does validate what it cheaply can: durations must be positive, handles are
trimmed and capped.)

## Verified the usual way

Backend: 739 tests green — the 710 that existed before, untouched, plus the
persistence suite (migrations idempotency, snapshot-replace semantics,
leaderboard ordering, the digest port pinned to the frontend's cases, and
disabled-mode no-ops for everything). A `conftest.py` autouse fixture forces
persistence off for the whole suite so a developer's configured `.env` can't
leak rows into tests. The precedence rule is tested at the prompt level: mock
the LLM seam, capture the messages, and assert that a `userId`-only request
injects the persisted "returning learner" welcome while a client digest
shoves the persisted one aside.

Frontend: svelte-check clean, 238 unit tests green, and the full 25-spec
Playwright suite — including `backend-down`, `practice`, and `lessons` —
**unchanged and green**, which was the whole point.

And once in a live browser, because this series has learned that lesson
repeatedly: sexy-move drill completed against a real backend with a real
file database — the attempt landed as a row, the leaderboard rendered it
ranked third behind two smoke-test rivals, the handle synced onto the `users`
row, and a `/narrate` request carrying only the `userId` came back with the
welcome-back continuity, served entirely from the mirror.

## The throughline holds

**Deterministic skeleton, generative skin** — now with the skeleton pinned in
two languages. The forgetting curve, the retrieval ranking, the caps, the
precedence rule, the schema: all deterministic, all tested, and the digest
that reaches Qwen is byte-shaped the same whether the browser or the database
built it. The model still only writes words over a structure it cannot break;
the structure just learned to survive a cleared cache.
