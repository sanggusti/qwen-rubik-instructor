# Turso (libSQL) as the persistence layer for learner memory

**Status:** core implemented on 2026-07-03 — see
[Part 13: Memory that outlives the browser](../13-memory-that-outlives-the-browser-turso-with-a-kill-switch.md)
for what shipped (schema, optional config, snapshot sync, digest fallback,
leaderboard). The *semantic recall* layer sketched in §5 remains future work.
Originally tracked GitHub issue *"Use Turso (libSQL) for persistent learner
memory."*

**Context in this repo:**
- Today, long-term learner state is browser-local. `frontend/src/lib/education/profile.ts`
  holds the profile in `localStorage` and builds a compact `MemoryDigest`
  (`buildMemoryDigest`) that is sent with every request.
- `backend/main.py` mirrors that digest as a Pydantic `MemoryDigest`
  (`struggles`, `mastered`, `dueForReview`, …) and forwards it to Qwen for
  narration. Nothing is persisted server-side.
- The forgetting/decay/spaced-repetition logic already exists client-side
  (`decayFactor`, `decayedWeight`, `isDueForReview`). See
  [`docs/06-the-memoryagent-pivot-forgetting-and-mastery.md`](../06-the-memoryagent-pivot-forgetting-and-mastery.md).

The goal of this doc: persist and *query* that memory server-side so recall can
be semantic and cross-device, while keeping browser-local progress as a working
fallback.

---

## 1. What Turso is (as of 2026)

Turso is a **SQLite-compatible database**. It began as a hosted fork of SQLite
(libSQL) and is now a from-scratch **Rust rewrite** (originally "Project Limbo,"
now "Turso Database") that preserves SQLite's SQL dialect and file format while
modernising the engine. Properties that matter here:

| Feature | Why it matters for us |
|---|---|
| **It *is* SQLite** | A local `.db` file and a hosted Turso DB are the same format. One code path, two connection strings. |
| **Embedded replicas** | A local SQLite file synced into the app process; reads are local (µs), writes go to primary and propagate back. |
| **Native vector search** | Store embeddings as vector columns, query by cosine/L2 in the *same* DB. No separate vector store. Exact search today; ANN indexing maturing. |
| **Database-per-user** | "Database Freedom Day" made unlimited DBs the model; one small DB per learner is viable. |
| **MVCC concurrent writes** | `BEGIN CONCURRENT` — multiple writers progress at once (classic SQLite serialises). |
| **MCP server mode** | Turso can expose itself to AI agents over MCP. |
| **Cost** | Free tier is enough for a hackathon; Developer ~$5/mo. Billing meters **storage + rows read** — index what you filter/order on. |

**Caveats to go in with eyes open:** the Rust rewrite is young (alpha-grade);
vector *indexing* (ANN/DiskANN) is still landing, but at our data volumes exact
vector search is instant. Watch the "rows read" meter — unindexed scans cost.

---

## 2. Why it fits *this* project

1. **Graceful fallback becomes almost free.** The issue requires browser-local
   progress to keep working when the DB is absent. Because Turso *is* SQLite, the
   backend DB layer is a plain SQLite file when there is no `TURSO_DATABASE_URL`,
   and the *same code* points at hosted Turso (with a local embedded replica)
   when configured. No dual code path.

2. **`MemoryDigest` is already a relational schema.** `StageStat`
   (stage, attempts, mistakes, bestMs, lastAt, mastered) is a `stage_stats` row
   verbatim; `decayedWeight` / `isDueForReview` become SQL over `last_at`
   timestamps. We are persisting a model that already exists, not inventing one.

3. **In-DB vectors are the Memory-track differentiator.** A memory track is won
   by *recall*, not storage. Turso keeps the relational profile and semantic
   embeddings of past struggles/questions in one query — the mechanism that turns
   "we saved your stats" into "the tutor remembers *this exact mistake*."

4. **Per-user DBs give a clean anonymous story.** The required no-auth demo path
   maps to: mint an anonymous token → one small DB (or one `learner_id` scope)
   per token. Real persistence, no login wall, cross-device when the token moves.

5. **Stack fit.** FastAPI + the `libsql` Python client; a local file for dev and
   tests (zero infra); hosted for the multi-device demo. Satisfies "fresh dev
   setup runs on a local DB" and "tests cover schema + read/write paths."

---

## 3. Proposed schema (maps 1:1 to what exists)

```sql
-- Identity: anonymous-first. `anon_token` is what a browser stores instead of
-- (or alongside) the localStorage profile; it is the cross-device handle.
CREATE TABLE learners (
  id          TEXT PRIMARY KEY,          -- uuid
  anon_token  TEXT UNIQUE NOT NULL,
  level       TEXT NOT NULL DEFAULT 'newbie',
  method      TEXT NOT NULL DEFAULT 'lbl',
  created_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  learner_id   TEXT NOT NULL REFERENCES learners(id),
  started_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- == StageStat, persisted. The heart of the current client memory. ==
CREATE TABLE stage_stats (
  learner_id TEXT NOT NULL REFERENCES learners(id),
  stage      TEXT NOT NULL,
  label      TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  mistakes   INTEGER NOT NULL DEFAULT 0,
  best_ms    INTEGER,
  last_at    TEXT NOT NULL,             -- drives decay + due-for-review
  mastered   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (learner_id, stage)
);
CREATE INDEX idx_stage_stats_learner ON stage_stats(learner_id);

-- == NEW: episodic / semantic memory. The differentiator. ==
-- One row per meaningful event (a struggle, an /ask question, a solve).
-- `embedding` is a Turso vector column for semantic recall over the learner's
-- own history. `F32_BLOB(<dim>)` matches the embedding model's dimensionality.
CREATE TABLE episodes (
  id         TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  kind       TEXT NOT NULL,             -- 'struggle' | 'question' | 'solve' | 'narration'
  stage      TEXT,
  text       TEXT NOT NULL,             -- what to recall / embed
  embedding  F32_BLOB(1024),            -- e.g. Qwen text-embedding dim
  created_at TEXT NOT NULL
);
CREATE INDEX idx_episodes_learner ON episodes(learner_id);
-- Later, when ANN lands: CREATE INDEX ... USING vector(embedding).

-- == Spaced repetition, promoted from the client heuristic to real state. ==
CREATE TABLE review_state (
  learner_id TEXT NOT NULL REFERENCES learners(id),
  stage      TEXT NOT NULL,
  stability  REAL,                      -- FSRS/SM-2 state
  difficulty REAL,
  due_at     TEXT,
  PRIMARY KEY (learner_id, stage)
);

-- == Timed solves + leaderboard source. ==
CREATE TABLE solve_attempts (
  id         TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id),
  scramble   TEXT,
  ms         INTEGER NOT NULL,
  moves      TEXT,                      -- json array
  created_at TEXT NOT NULL
);
CREATE INDEX idx_solve_ms ON solve_attempts(ms);
```

`stage_stats` is the existing `StageStat`. `episodes.embedding` is the new
capability. `review_state` promotes the decay heuristic into a real scheduler.

---

## 4. Integration design (enable later, low blast radius)

### 4.1 Config & optional dependency

`backend/config.py` already centralises settings. Add:

```python
# config.py — new optional settings
turso_database_url: str | None = None   # e.g. libsql://<db>.turso.io  OR  file:./dev.db
turso_auth_token: str | None = None
embedding_model: str | None = None      # e.g. a DashScope/Qwen embedding model
```

Add `libsql` (or `libsql-client`) to `backend/requirements.txt`. Keep it soft:
if `turso_database_url` is unset, the persistence layer is a no-op and the app
behaves exactly as today (digest-only, browser-local).

### 4.2 A thin repository, not an ORM

Per the repo's "Simplicity First" rule, no ORM. One module,
`backend/memory/store.py`, exposing plain functions:

```python
def connect() -> Connection | None: ...          # None when unconfigured
def upsert_stage_stat(learner_id, stat) -> None: ...
def record_episode(learner_id, kind, text, embedding, stage=None) -> None: ...
def recall(learner_id, query_embedding, k=5) -> list[Episode]: ...   # vector search
def due_for_review(learner_id, now) -> list[str]: ...
def record_solve(learner_id, ms, scramble, moves) -> None: ...
def leaderboard(limit=20) -> list[SolveRow]: ...
```

Semantic recall is a single query in the same DB:

```sql
SELECT text, kind, stage, created_at
FROM episodes
WHERE learner_id = ?
ORDER BY vector_distance_cos(embedding, ?) ASC
LIMIT ?;
```

### 4.3 Wiring into the existing endpoints

- **`/narrate/*` and `/ask`** (`backend/main.py`): when a `learner_id` is present
  and the store is configured, *hydrate* the `MemoryDigest` from `stage_stats` +
  `review_state` server-side (instead of trusting the client digest), and attach
  the top-k `recall(...)` episodes to the prompt context. When unconfigured,
  fall back to the client-sent `MemoryDigest` exactly as today.
- **New `POST /progress`**: accept a `StageResult` (mirror of the client's
  `recordStageResult`) and persist `stage_stats` + append an `episode`.
- **New `POST /solve-attempt` / `GET /leaderboard`**: timed-solve write + query.
- **Anonymous identity**: `POST /session` mints an `anon_token`; the frontend
  stores it next to the `rubik-profile` key. No auth required.

### 4.4 Keeping the frontend fallback intact

The frontend keeps writing `localStorage` as today. When an `anon_token` and a
reachable backend exist, it *also* POSTs progress. The digest sent on each
request stays as the offline contract; the server only *overrides* it with
persisted memory when it has better data. If the backend or DB is down, nothing
breaks — this is the acceptance criterion "browser-local progress still works."

---

## 5. What makes the Memory track *outstanding* (the recall layer)

Persisting state is table stakes. The track is won by recall. Priority order,
each layer independently shippable:

1. **Episodic memory + semantic recall (the money feature).** Log every
   struggle / `/ask` / solve as an `episode` with an embedding. On a new question
   or stage entry, vector-search the learner's *own* history and feed the top-k to
   Qwen. Enables: *"You asked almost this exact question about the F2L cross-color
   case on June 24th — last time pairing the corner first unstuck you."* Keyword
   matching can't do that; this is exactly what Turso's in-DB vectors are for.

2. **Two-tier memory with consolidation.** Keep raw episodic events *and* a
   distilled semantic/profile layer. Periodically (optionally via Qwen) summarise
   many episodes into durable skill facts (*"reliably flips one edge on OLL"*).
   Mirrors experience → consolidated knowledge; keeps LLM context small while
   recall stays rich. Nice visualization: events collapsing into learned facts.

3. **Real spaced repetition (FSRS/SM-2).** The current 21-day interval + half-life
   is proto-SRS. Persist per-skill stability/difficulty in `review_state` so
   review timing adapts per learner and survives devices — a genuine, *showable*
   forgetting curve.

4. **Cross-device continuity.** Master the cross on a laptop, reload on a phone,
   the tutor greets you with streak + what's due. Server persistence + anon token
   unlocks this; it's the visceral live-demo moment.

5. **Visible + narrated memory.** Have Qwen ground its opening in retrieved
   memory (*"3 sessions in, cross mastered, PLL gone stale, still missing the same
   OLL edge"*), and surface a "What I remember" panel (mastered skills, decaying
   curve, what's due, remembered moments). Judges reward memory they can *see*.

6. **Timed solves + leaderboard** (already in scope): the objective, social layer
   next to the learning/mastery view.

**Suggested build order:** (a) persist `stage_stats` + sessions behind the
SQLite/Turso fallback → (b) `episodes` + vector recall in `/ask` and lesson start
(*the differentiator*) → (c) anon token + "What I remember" cross-device UI →
(d) FSRS scheduling + leaderboard polish. If only one thing ships, make it (b).

**Open decision:** one DB per learner (best "database-per-user" narrative) vs a
single shared DB with a `learner_id` column (simpler migrations/tests). For a
hackathon: single shared DB for dev/tests, per-user as an architecture talking
point — unless the per-user scaling story is central to the pitch.

---

## 6. Acceptance-criteria mapping

| Issue criterion | Covered by |
|---|---|
| Fresh dev setup runs on a local DB | `file:./dev.db` connection string; §4.1 |
| Tested persistence APIs (sessions, context, history, progress, solves) | §4.2 repository + endpoint tests against a file/in-memory DB |
| Qwen narration consumes persisted memory | §4.3 hydrate digest + `recall()` |
| Record & query timed solves for a leaderboard | `solve_attempts` + `GET /leaderboard`; §3, §4.3 |
| Browser-local fallback when DB absent | §4.4; store is a no-op when unconfigured |
| Schema/migrations committed + documented | this doc + a `migrations/` sql dir |

---

## Sources

- [What is Turso? — the SQLite-compatible database for the agentic era](https://turso.tech/what-is-turso)
- [Turso — Databases Everywhere](https://turso.tech/)
- [Embedded Replicas — Turso docs](https://docs.turso.tech/features/embedded-replicas/introduction)
- [Vector Search — Turso docs](https://docs.turso.tech/guides/vector-search) · [Native Vector Search for SQLite](https://turso.tech/vector)
- [SQLite Rewritten in Rust with MVCC, Async I/O & Vector Search (2026 guide)](https://www.explainx.ai/blog/turso-database-sqlite-rust-rewrite-guide-2026)
- [Turso Complete Guide 2026 (multi-tenant SaaS / RAG / mobile)](https://www.oflight.co.jp/en/columns/turso-edge-sqlite-libsql-2026)
- [Why We Created Turso, a Rust-Based Rewrite of SQLite — The New Stack](https://thenewstack.io/why-we-created-turso-a-rust-based-rewrite-of-sqlite/)
