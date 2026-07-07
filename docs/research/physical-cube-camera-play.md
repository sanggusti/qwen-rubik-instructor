# Playing with your physical cube: camera scanning, state mapping, and live hints

**Status:** proposed on 2026-07-07 — research and integration design only; nothing
implemented yet. Companion diagram:
[`docs/diagrams/10-physical-cube-scan.drawio`](../diagrams/10-physical-cube-scan.drawio)
(export a same-named `.png` from draw.io when the diagram is finalized, per repo
convention). Some cited paths live on the `feat/review` branch (PR #33) and are
flagged as such.

**Context in this repo:**
- The canonical cube model is a per-face facelet dict,
  `State = Record<'U'|'D'|'L'|'R'|'F'|'B', Color[9]>`, ported verbatim between
  `frontend/src/lib/cube/state.ts` and `backend/pipeline/cube/facelet.py`
  (guarded by a Node↔Python cross-validation test). Color letters *are* face
  letters; index 4 is the center. The visual scheme lives in
  `frontend/src/lib/scene/cube.ts` (`FACE_COLORS`): U=white, D=yellow,
  L=orange, R=red, F=green, B=blue.
- `POST /solve` and `POST /narrate/*` (`backend/main.py`) already accept a full
  `State`. The planner (`backend/narrative/planner.py`) already handles
  "solve from the cube you're holding": `build_solve_walkthrough` sets
  `start_from_current=True` and stores `invert(solution)` on the intro beat as
  *data*, never replaying it on the live cube.
- The live cube store (`frontend/src/lib/stores/cube.svelte.ts`) changes state
  only through animated moves or reset — there is **no way today to load an
  arbitrary facelet state**. `frontend/src/lib/scene/paint-from-state.ts` +
  `demoStore.seed(state)` already paint a *reference* cube from a `State`.
- In-lesson hints (`frontend/src/lib/education/coaching.ts`) are driven by
  **move history vs. expected moves** (`trailingPrefixLength`), not facelets.
- Qwen is called through the OpenAI SDK against DashScope's compatible-mode
  endpoint (`backend/narrative/llm_narrator.py` `get_client()`, config in
  `backend/config.py`). The same client carries vision models via image
  content parts.
- There is **zero camera groundwork**: no `getUserMedia`, workers, wasm, or
  WebGPU anywhere in the frontend. This feature is greenfield on the device
  side.

The goal of this doc: let a learner scramble **their own physical cube**, scan
it with a webcam or phone camera, load that state into the app, and then run
every existing experience — walkthroughs, lessons, Qwen narration, hints,
review capture — against the real cube, with a scan-on-pause hint loop that
stays cheap on both the machine and the API bill.

---

## 1. Architectural thesis: the physical cube is an input device

Everything downstream of the cube — coaching, walkthrough playback, Qwen
narration, review capture, challenge anti-cheat — already consumes exactly two
primitives:

1. a facelet `State`, and
2. a stream of completed-move events (`cubeStore.onMove`).

So the feature is **two new producers of those primitives**, and almost nothing
else:

| New producer | What it feeds | Downstream changes |
|---|---|---|
| `cubeStore.loadState(state)` — full-state ingestion after a 6-face scan | the `State` primitive | none (one new `onLoadState` subscription for anti-cheat) |
| Synthetic moves inferred from scan-to-scan state diffs | the move-event primitive | none — coaching, review, lesson engines already subscribe |

All vision code is client-side TypeScript in a new
`frontend/src/lib/physical/` module. The backend gains **one** endpoint (a
Qwen-VL proxy) and one hardened validator. The decisions below were confirmed
up front: laptop-first but mobile-viable; **scan-on-pause** as the default hint
model; **classical CV primary, Qwen-VL fallback** as the vision stack.

## 2. UX flow and the scanning protocol

Scramble physically → guided 6-face scan → review/correct a 54-sticker grid →
legality validation → `loadState` → walkthrough/hints against the real cube.

The center sticker anchors each face's **identity** (white center ⇒ U), but it
does **not** fix the face's **rotation** — a face photographed sideways has the
same center. The protocol resolves this with a fixed grip and scan order:

1. Home grip: **white on top, green facing you**.
2. Scan the four side faces first — F, then rotate the cube `y`-style for R,
   B, L — keeping white on top the whole time. The overlay badge reads "white
   center stays up".
3. Tip the cube back for U (badge: "green edge at the bottom"), tip forward
   for D (badge: "green edge at the top").

Each scan screen shows the expected center color in the middle cell and the
adjacent-face cue on the top edge. A capture is **auto-rejected** when the
sampled center doesn't match the expected anchor — this catches wrong-face and
gross-rotation mistakes instantly. Residual rotation errors are caught by the
legality validator (§3), which auto-tries the four rotations of a failing face
before asking the user to re-scan.

The 54-sticker review grid ("adjust" step) doubles as **manual color entry**:
if the camera permission is denied, physical mode degrades gracefully to
"type in your cube".

## 3. Cube-state mapping and the missing legality validator

Scans are *center-canonical by construction*: the observed center color maps
the face to U/D/L/R/F/B via `FACE_COLORS`, so a scanned face grid is already in
the app's `State` format — no 54-char string conversion needed (that format
exists only inside the solver, `backend/pipeline/solver/lbl.py`).

The gap is validation. Today's `is_well_formed`
(`backend/pipeline/cube/facelet.py:165`) only checks 6 faces × 9 stickers ×
each color used 9 times — its own docstring says it "does not prove the state
is physically solvable". A single misread sticker pair (say a swapped red and
orange) sails through and dies later at the solver as an opaque 422. A random
color-count-valid reassembly is actually solvable with probability
**1/3 × 1/2 × 1/2 = 1/12**, so scan errors *will* produce illegal states
routinely. The new validator checks, in order:

1. **Cubie structure** — every corner is one of the 8 legal color triples and
   every edge one of the 12 legal pairs, each appearing exactly once. This is
   the check that catches most scan errors, and it points at *which* cubie
   (hence which face) is wrong.
2. **Corner orientation** — sum of corner twists ≡ 0 (mod 3).
3. **Edge orientation** — sum of edge flips ≡ 0 (mod 2).
4. **Permutation parity** — corner and edge permutation parities match.

Implementation plan, following the repo's verbatim-port convention:

- `frontend/src/lib/physical/legality.ts` — pure TS, <1ms. Running locally
  enables instant feedback and the **rotation auto-fix** loop (try the 4
  rotations of a failing face, accept the unique legal combination).
- `backend/pipeline/cube/legality.py` — verbatim Python mirror,
  cross-validated by a Node↔Python test like `facelet.py` already is. Wire it
  into `/solve` and `/narrate/*` in place of the weak `is_well_formed`-only
  gate, so *any* caller gets a face-specific 4xx instead of a solver 422.
- **No `POST /scan/validate` endpoint** — a network round-trip for pure math
  buys nothing.

Existing references for the math and error taxonomy: min2phase's `verify`
error codes, `kociemba.solve()`'s exceptions, and Jaap's Puzzle Page (see
Sources).

## 4. Vision approaches compared

| Approach | Cost | Latency | Accuracy | Payload | Verdict |
|---|---|---|---|---|---|
| Classical CV in-browser (canvas sampling + LAB nearest-centroid) | $0 | per-frame, instant | ~99% with calibration (qbr) | ~0 (no new deps) | **Primary** |
| Qwen-VL (qwen3-vl-plus, JSON mode) | <$0.01 per full 6-face scan | ~1–4 s per image (estimate) | unbenchmarked for color grids | none (server-side) | **Fallback / disambiguator** |
| Tiny in-browser ML (onnxruntime-web / TF.js) | $0 | sub-30ms WebGPU, 100–300ms wasm | high, but only needed for localization | 5–10 MB model | **Not in v1** |
| OpenCV.js | $0 | fast | same as classical CV | ~8–10 MB wasm | **Skip** — plain canvas suffices |

### 4.1 Classical CV (primary)

The mainstream, proven approach — reference implementation is
[qbr](https://github.com/kkoomen/qbr) (Python/OpenCV, ~99% claimed with
calibration); the UX reference is
[Ruwix's web scanner](https://ruwix.com/cube-solver/scan/) (fixed 3×3 overlay,
align and capture). Pipeline per capture:

1. Grab a frame to canvas; sample each of the 9 cells as the **median of an
   inner ROI patch** (5–9 px), not a single pixel — defeats specular
   highlights on glossy stickers.
2. Convert RGB → LAB; classify by **CIEDE2000 nearest-centroid** against the
   **six captured face centers**, which serve as per-session color anchors.
   The centers *are* the calibration — no separate calibration step, and the
   anchors self-adjust to this cube and this lighting.
3. Refine with **k-means over all 54 samples** (6 clusters seeded by the
   anchors). Classifying *relatively* rather than against absolute HSV
   thresholds sidesteps auto-white-balance drift between faces.
4. Emit a per-sticker confidence (distance ratio between the best and
   second-best centroid). Low-confidence cells are highlighted in the adjust
   grid and are what the Qwen-VL fallback gets asked about.

Known failure pairs to design for: **red vs. orange** (#1 by a wide margin)
and **white vs. yellow under warm light** (#2). Mitigations: the relative
classification above, a hue-ordering heuristic within the k-means clusters,
and the assist endpoint.

### 4.2 Qwen-VL (fallback / disambiguator)

- **Model:** `qwen3-vl-plus` via the existing DashScope compatible-mode client
  (`llm_narrator.get_client()` — vision models ride the same OpenAI SDK with
  image content parts). JSON mode (`response_format={"type":"json_object"}`)
  is supported on qwen3-vl-plus/flash and qwen-vl-max, which directly supports
  "return the 3×3 grid as JSON".
- **Cost:** ~$0.20 / 1M input tokens; images tokenize at roughly one token per
  28×28 px patch, so a downscaled face photo is a few hundred tokens and a
  full 6-face scan lands **well under $0.01**. Cost is a non-issue.
- **Why not primary:** latency (~1–4 s per image — estimate, no vendor SLA)
  makes it unfit for the live loop, and — the decisive point — **no published
  benchmark exists for VLM cube-face color extraction**. Color under varying
  illumination is a known VLM weak spot, and one hallucinated cell makes the
  state unsolvable. Purpose-built scanners report 98–100%; that is the bar to
  beat before trusting a VLM as the source of truth. Run our own eval before
  ever promoting it.
- **Role:** called only for low-confidence stickers or a legality failure the
  rotation auto-fix couldn't resolve, then cross-checked by the validator.

### 4.3 In-browser ML (explicitly deferred)

Color classification is trivial without ML; the only ML-worthy subproblem is
sticker/grid **localization** under free-hand angles — and the fixed-overlay
UX removes that need. If the overlay proves too finicky in practice, the
escalation path is a quantized MobileNet-class detector via onnxruntime-web
(5–10 MB, sub-30ms on WebGPU; Safari still lacks stable WebGPU, so a wasm
fallback at 100–300 ms/frame must be planned). Not before Phase 4.

## 5. State ingestion: `cubeStore.loadState(state)`

**Recommended: load the scanned state directly into the live cube.** The
"cubelet reconstruction" worry is a false alarm:

- The demo cube already does exactly this: `seedFromState` = cancel animation
  → rebuild solved geometry → `paintCubeFromState` (the full
  facelet-index↔sticker mapping lives in
  `frontend/src/lib/scene/paint-from-state.ts`).
- `CubeMesh.svelte` already binds a `reset: rebuildCube` control into
  `cubeStore`.
- The logical cubelet model (`scene/cubelets.ts`) never reads colors — it is
  consulted only for position-based classification (corner/edge highlights)
  and layer grouping for animation. Painting stickers is enough.

Concrete seam: extend `CubeAnimatorControls` with `seedFromState(state)`
(implemented in `CubeMesh.svelte` as cancel + rebuild + paint), and add to
`cubeStore`:

```ts
loadState(state: State): void
// sets this.state = cloneState(state), calls controls.seedFromState,
// notifies NEW loadSubscribers (onLoadState)
```

The `onLoadState` subscription is load-bearing: **challenge anti-cheat must
treat it like `onReset`/`onScramble`** and cancel any live digital run —
otherwise `loadState` is a day-one cheat vector for the existing leaderboard
(scan a solved cube mid-run).

Rejected alternatives:

- *Solve backend-side and replay `invert(solution)` as an animated scramble* —
  LBL solutions run ~80–120 moves, so ingestion becomes a 30-second animation,
  requires the backend just to load state, and fails outright if the solver
  rejects. The planner's invert-trick remains available *as data* for the
  reference cube and review without animating anything.
- *Physical cube as sole source of truth (digital twin purely decorative)* —
  forfeits the entire move-event architecture that coaching, review, and
  challenge subscribe to. We keep its UX framing only: while a physical
  session is active the on-screen cube is a **read-only mirror** —
  drag/keyboard/scramble/reset are suppressed behind a
  `physicalStore.active` guard so digital input can never diverge the mirror
  from reality.

## 6. Scan-on-pause hints and move inference

The "sweet spot" question — can we track the cube live? — has a clear answer
from the literature: **continuous move *decoding* from video is not solved**.
The best documented pipeline (YOLOv8 + LSTM/ConvLSTM over frame sequences)
reaches ~94% on only **three** move types (R, U, F); full 18-move recognition
does not exist off the shelf. Frame differencing, by contrast, is cheap and
reliable at 30 fps — so it is used only to detect **stillness** and trigger a
capture, never to decode moves. No WebGPU, no workers, no wasm in v1.

The loop: user turns the cube freely → holds it steady toward the camera (or
taps) → the visible face is re-captured → state diff → move inference →
synthetic move events.

**Move inference** (`frontend/src/lib/physical/infer-moves.ts`, pure TS,
reusing `applyMove`/`cloneState`/`statesEqual` from `cube/state.ts`):

1. **Canonicalize first.** Scans are center-canonical; the digital state may
   not be — the solver's translation table can emit `x/y/z` and `M/E/S`,
   which displace centers. Apply the unique whole-cube rotation returning the
   digital state's centers to identity before diffing. Side effect: the user
   reorienting their physical cube between scans becomes invisible — exactly
   right.
2. **Search.** BFS from the last known state over 12 face quarter-turns + 6
   slice moves, canonicalizing candidates before comparison. Depth 1 (18
   candidates) covers the common case; depth 2 (~324) covers half-turns and
   quick pairs; depth 3 (~6k, still ~1ms) behind a config flag for fast
   turners.
3. **Tie-break by expected moves.** Coaching compares move *strings*, and
   distinct sequences collide as states (`M` ≡ canonicalized `R L'`,
   `U D` ≡ `D U`). Rank equal-state candidates by longest match against the
   active lesson/walkthrough `expectedMoves` continuation — the same
   `trailingPrefixLength` orientation coaching itself uses. Signature:
   `inferMoves(prev, scanned, expectedNext: string[]): string[] | null`.
4. **Apply.** Feed the result through `cubeStore.applyMoves(inferred)`: the
   mirror animates, `handleMoveComplete` fires per move, and every existing
   subscriber — lesson engine, walkthrough advancement, review capture,
   challenge solved-check — receives ordinary move events. **Coaching
   (`education/coaching.ts`) stays byte-for-byte untouched.**
5. **Unreachable diff** → `drifted`: prompt a full 6-face re-scan →
   `loadState`, offering "re-plan from here" (regenerate the walkthrough from
   the new state) vs. "I'll undo my turns".

Inference is trivial array work (<1ms) — hint latency is bounded by scan time,
not compute. That is the sweet spot: no GPU pipeline, no per-frame model, and
the deterministic solver/coach stack does what it already does.

## 7. Scan session state machine and module layout

A new `physicalStore` (`frontend/src/lib/stores/physical.svelte.ts`) is a
reactive façade over a pure, unit-testable FSM — the same
framework-free-engine + `.svelte.ts`-façade pattern the `education/*` engines
use.

```
frontend/src/lib/physical/
  camera.ts         getUserMedia lifecycle, facingMode, mirroring policy
  sampler.ts        canvas frame grab, 9-cell median ROI sampling
  color-classify.ts RGB→LAB, CIEDE2000 vs. center anchors, k-means, confidence
  legality.ts       structural + twist/flip/parity validator (§3)
  infer-moves.ts    canonicalize + BFS + expectedMoves tie-break (§6)
  scan-machine.ts   the FSM below
```

```
idle → camera-init → scanning(face k of 6: F,R,B,L,U,D)
     → adjust      (54-sticker review grid, tap-to-correct; qwen-vl assist;
                    doubles as manual entry when camera is denied)
     → validating  (legality; auto-try 4 rotations of a failing face)
     → ready       (cubeStore.loadState fired; mirror = physical cube)
     → tracking    awaiting-turn → capturing (hold-steady / tap) → inferring
                   → advanced (synthetic moves applied) ⟲ awaiting-turn
                   → drifted → resync (full re-scan) → ready
     → ended       (camera released)
```

Placement: **inside `/play`, not a new route.** A new HudBar tab "Camera"
opens `PhysicalPanel.svelte` for setup; a persistent floating
`PhysicalCameraWindow.svelte` (sibling of `DemoCubeWindow`) hosts live video +
overlay while the panel is closed. Critically, the physical session is **not**
added to the `closeOthers()` one-experience-at-a-time union in
`play/+page.svelte` — it is an *input mode* that coexists with
lessons/practice/walkthroughs, persisting the way `challengeStore` does.

## 8. Integration with each section

### 8.1 Regular play
HudBar gains the Camera tab + panel; the camera window mounts in
`play/+page.svelte`; `cubeStore` gains `loadState`/`onLoadState`; drag,
keyboard, scramble, and reset are suppressed while `physicalStore.active`
(TouchMovePad hidden). The on-screen cube mirrors the physical one, read-only.
Scene, animator, and everything else: untouched.

### 8.2 Lessons and coaching
Synthetic moves arrive via `cubeStore.onMove`, which `lessonStore` /
`practiceStore` already subscribe to — coaching logic unchanged. Two notes:
a re-scan may inject 2–3 moves at once, so "Expected X, but got Y" fires after
the batch rather than mid-turn (acceptable for scan-on-pause; document it);
and lesson steps that instruct whole-cube rotations (`x/y/z`) can't be
observed by center-canonical scans (rotations are invisible by design), so
those steps get a manual-confirm gate in physical mode.

### 8.3 Walkthroughs — the one real change
`WalkthroughEngine.play()/next()/previous()` currently **drive the live
cube**, which would desync the mirror from the physical cube. Add a
**follow mode** (`mode: 'drive' | 'follow'`) to
`frontend/src/lib/education/walkthrough.ts`: engine playback redirects to the
demo/reference cube (`demoStore` already implements the full `WalkthroughApi`
surface plus `seed()`), while the live mirror advances *only* from inferred
moves; a beat advances when the inferred history covers its moves (the same
`trailingPrefixLength` test). This is the largest single change outside
`physical/`.

### 8.4 Qwen narration / ExplorePanel
Works as-is: `ExplorePanel` already calls
`generateWalkthrough({ state: cubeStore.getState(), ... })`, and after
`loadState` that state *is* the physical cube. The planner's
`start_from_current=True` + `invert(solution)`-as-data intro beat is precisely
correct for a cube that "already holds the scramble". UX framing: narration
text addresses the **physical** cube; the reference cube demonstrates each
beat; the mirror confirms the user actually did it. Backend untouched.

### 8.5 Challenge Me
**Exclude physical mode from ranked challenge in v1.** The
scan-a-nearly-solved-cube exploit is unanswerable while the start state is
client-supplied. The v2 path (Phase 4) is a **server-issued scramble
protocol**: `/challenge/start` returns a scramble, the user applies it
physically, and the first scan must equal `apply(scramble, solved)` —
server-verified — before the clock runs; even then, keep a **separate physical
leaderboard**, since scan latency makes times incomparable with digital runs.
Required on day one regardless: `onLoadState` cancels any live digital run
(§5).

### 8.6 Review (PR #33, `feat/review`)
Composes cleanly with zero changes: the generated walkthrough carries
`invert(solution)` in beat 0, so `recordSolve`'s
`startFromCurrent && beats.length >= 2` gate passes, and `compileReview`
replays from solved and asserts `solvedAtEnd` — true exactly when the user
followed the solution through on their physical cube. Deviations or a
drift-resync (which re-plans from a new state) compile to `null`; v1 accepts
that review captures clean follow-throughs only, same as digital. Optional
non-breaking extension: `moveTimesMs?: number[]` on `Beat`, fed from scan
timestamps, unlocking pace analytics in `ReviewPage` later (`compile.ts`
ignores unknown fields today).

## 9. Backend additions (thin)

One new endpoint, one hardened validator; the client does all vision work and
the server holds the API key plus defense-in-depth.

```
POST /scan/assist
  request:  { faces: [{ face, imageBase64 (JPEG, ≤200KB enforced),
                        gridHint, lowConfidenceCells }],
              anchors: { face → LAB } }
  response: { faces: [{ face, cells: [{ color, confidence }] }] }   # JSON mode
```

- Reuses `llm_narrator.get_client()`; adds
  `qwen_vl_model: str = "qwen3-vl-plus"` to `backend/config.py`. Rate-limited
  per session. This is the **only** Qwen-VL touchpoint; `DASHSCOPE_API_KEY`
  never reaches the client.
- `backend/pipeline/cube/legality.py` (verbatim mirror of the TS validator)
  replaces the `is_well_formed`-only gate in `/solve` — face-specific 4xx
  errors instead of opaque solver 422s, protecting `/narrate/*` too.

## 10. What makes it outstanding — and the build order

1. **The demo is the pitch.** Scan a real cube in front of the judges and have
   Qwen walk you through solving *your* cube — no other layer of the project
   makes "grounded tutoring" this tangible. (Phase 1)
2. **Move inference feeding the existing coach.** The moment a physical turn
   makes the on-screen coach say "Next move: R", the whole deterministic
   skeleton pays off visibly. (Phase 2)
3. **The legality validator.** Invisible when it works, but it is the
   difference between "scan failed, try again" and a cryptic solver error —
   and it hardens the public API for free. (Phase 1, TS; Phase 3, Python
   mirror)
4. **Qwen-VL assist.** Keeps Qwen in the vision story at near-zero cost,
   scoped to the cases where it genuinely helps (red/orange in dim light).
   (Phase 3)
5. **Physical solves in `/review`.** Your real solve, scroll-scrubbed on the
   canvas — composes with PR #33 unchanged. (Phase 3)

### Phased roadmap

| Phase | Scope | Success criteria |
|---|---|---|
| **P1 — Scan → Solve walkthrough (MVP), ~1–1.5 wk** | `physical/` camera + sampler + classifier + legality + FSM through `ready`; `PhysicalPanel`; `cubeStore.loadState` + `onLoadState` + challenge-cancel; adjust grid; ExplorePanel on scanned state; walkthrough in read-along form (tap "done" per beat) | ≥52/54 stickers correct pre-adjust under normal indoor light; illegal states rejected with a face-specific message; `generateWalkthrough` succeeds on a scanned state; a digital challenge run cancels on `loadState` |
| **P2 — Scan-on-pause tracking, ~1 wk** | `infer-moves.ts` + tracking states; synthetic moves via `applyMoves`; walkthrough follow mode; drift → resync; hold-steady auto-capture | one full guided physical solve end-to-end with re-scans only; depth-2 inference unit tests pass incl. slice aliasing and expectedMoves tie-breaks; deliberate off-protocol turns reach `drifted` and recover |
| **P3 — Assist + capture + lessons, ~3–5 d** | `POST /scan/assist`; Python legality mirror wired into `/solve`; review capture of physical solves; lessons in physical mode (rotation steps gated manual) | red/orange cases resolved by assist in a dim-light test set; a physical solve appears and scrubs on `/review`; TS↔Py legality cross-validation test green |
| **P4 — Later tier** | ranked physical challenge (server-issued scramble, separate leaderboard); continuous-tracking exploration (worker + throttled frame diff); mobile rear-camera polish; per-move timestamps in review | — |

### Acceptance criteria mapped to the design

| Requirement (from the idea) | Where it lands |
|---|---|
| Scan each side with center color as anchor | §2 protocol + §4.1 anchors; auto-reject on center mismatch |
| Map sides to state maps | §3 — scans are center-canonical `State`s; legality validator |
| Qwen-VL as the mapping model | §4.2 — scoped to fallback/disambiguation via `POST /scan/assist` |
| Cheaper than the Qwen API | §4.1 — classical CV primary, $0, no new deps |
| Hint system on the live cube | §6 — scan-on-pause, diff → inferred moves → existing coach |
| WebGPU / parallel processing sweet spot | §6 — not needed in v1; frame diff for stillness only; ML/WebGPU deferred to §4.3 / P4 |
| Integrate with course, challenge, narration, play, review | §8.1–8.6 |

## 11. Risks and open questions

- **Camera permission UX.** Explain-before-prompt screen; `getUserMedia`
  requires a secure context (fine in prod behind Caddy; localhost is exempt in
  dev). Denial falls back to manual color entry via the adjust grid.
- **Lighting.** Per-session center anchors + k-means absorb global color
  casts; the hard pairs are red/orange and white/yellow under warm bulbs
  (CIEDE2000 + hue-ordering heuristic + VL assist). Median-of-ROI sampling
  defeats speculars; stickerless matte cubes are actually the easy case.
- **Mirrored-video gotcha.** Front cameras are conventionally previewed
  mirrored. Rule: sample from the **raw frame**, draw the overlay in raw
  coordinates, and mirror preview + overlay together only for front cameras —
  otherwise the sampled 3×3 columns silently transpose L/R.
- **Face-grid rotation.** Center anchors fix identity, not rotation — handled
  by the §2 protocol + center auto-reject + the validator's rotation auto-fix.
  Residual risk (two rotation errors composing into a legal state) is
  astronomically unlikely and would surface immediately as a walkthrough
  mismatch.
- **Solver alphabet.** `lbl.py`'s translation can emit `M/E/S/x/y/z` — hence
  canonicalization and the extended inference alphabet in §6. Open question:
  does `notation.py`'s `optimize_solution`/`cleanup` ever leave `x/y/z`
  mid-stage? (Affects follow-mode beat matching; verify with a corpus of
  solves before P2.)
- **Calibration persistence.** Should the six anchor LABs persist per device
  in localStorage as a warm start? Cheap to add; decide during P1.
- **Mobile layout.** Camera window + stage caption compete for space on small
  screens; likely the camera window takes `DemoCubeWindow`'s slot there.
  Decide during P1 with real devices.

## Sources

- [qbr — webcam Rubik's cube scanner/solver (OpenCV, CIEDE2000, calibration)](https://github.com/kkoomen/qbr)
- [Ruwix online cube scanner (fixed-overlay UX reference)](https://ruwix.com/cube-solver/scan/)
- [CubeUnstuck — cube scanner accuracy write-up (~98.96%)](https://cubeunstuck.com/articles/cube-scanner-accuracy/)
- [Rubik's Cube Move Detection — YOLOv8 + LSTM/ConvLSTM, ~94% on 3 move types](https://github.com/felikemath/Rubik-s-Cube-Move-Detection)
- [Rubik's Cube Face Detection Model — SSD-ResNet101, 98–100% tile accuracy](https://github.com/Hemant-Mulchandani/Rubiks-Cube-Face-Detection-Model)
- [Alibaba Model Studio — vision (Qwen-VL) docs](https://www.alibabacloud.com/help/en/model-studio/vision)
- [Alibaba Model Studio — structured/JSON output support matrix](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [Qwen3-VL (open-weights repo)](https://github.com/QwenLM/Qwen3-VL) · [qwen3-vl-plus pricing listing](https://www.qwencloud.com/models/qwen3-vl-plus)
- [onnxruntime-web WebGPU execution provider](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [cubejs — JS Kociemba two-phase](https://github.com/ldez/cubejs) · [min2phase (verify error codes)](https://github.com/cs0x7f/min2phase)
- [Jaap's Puzzle Page — cube group theory](https://www.jaapsch.net/puzzles/theory.htm) · [Ruwix — unsolvable cube / invalid scramble](https://ruwix.com/the-rubiks-cube/unsolvable-rubiks-cube-invalid-scramble/)

**Flagged as unverified** (re-check before implementation): qwen-vl-plus
VL-specific pricing (search results conflate it with text `qwen-plus`);
official Qwen-VL latency figures (estimates only); the exact image-token /
`vl_high_resolution_images` caps; and — most importantly — any published VLM
cube-scanning accuracy benchmark (none found; run our own eval).
