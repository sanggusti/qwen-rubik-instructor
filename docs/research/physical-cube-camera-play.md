# Playing with your physical cube: camera scanning, state mapping, and guided tracking

**Status:** **implemented through P3 on 2026-07-07** (branch
`feat/camera-inference`): fixture corpus + pure CV pipeline (P0), scan →
loadState → read-along MVP (P1), chunked guided tracking with checkpoints,
diff-explain and the repair ladder (P2), `/scan/assist` + the Python legality
mirror + lesson gating + review capture (P3). P4 (ranked physical challenge,
ML localization, per-chunk timestamps) remains future work. Originally
proposed earlier the same day and **revised after a three-lens feasibility
audit** (human experience, integration with every feature incl. PR #33, phone
performance): the audit killed the original per-move scan-on-pause tracking
model and replaced it with **trust-advance + checkpoint verification** (§6);
it also surfaced two required performance mitigations (§9.1, §12) and three
integration corrections (§9.3, §1, §12). PR #33 is merged, so all review
paths cited here live on `main`.
Companion diagram:
[`docs/diagrams/10-physical-cube-scan.drawio`](../diagrams/10-physical-cube-scan.drawio)
(export a same-named `.png` from draw.io when finalized, per repo convention).

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
  *data*, never replaying it on the live cube. Each solve frame also carries
  `expected_state` — the exact `State` after that stage — which the revised
  tracking model (§6) leans on heavily.
- The live cube store (`frontend/src/lib/stores/cube.svelte.ts`) changes state
  only through animated moves or reset — there is **no way today to load an
  arbitrary facelet state**. `frontend/src/lib/scene/paint-from-state.ts` +
  `demoStore.seed(state)` already paint a *reference* cube from a `State`.
- The walkthrough engine **already plays on the demo/reference cube**, not the
  live cube: `frontend/src/lib/stores/walkthrough.svelte.ts:17-23` wires the
  engine's `WalkthroughApi` to `demoStore`. The only live-cube touch points
  are the opt-in buttons `solveUserCube()` and `resetUserCubeToCheckpoint()`.
- In-lesson hints (`frontend/src/lib/education/coaching.ts`) are driven by
  **move history vs. expected moves** (`trailingPrefixLength`), not facelets.
- Review capture (merged PR #33) records the *generated walkthrough* via
  `recordSolve` and scrambles via `onScramble`
  (`frontend/src/lib/review/session.ts`) — it does not subscribe to per-move
  events.
- Qwen is called through the OpenAI SDK against DashScope's compatible-mode
  endpoint (`backend/narrative/llm_narrator.py` `get_client()`, config in
  `backend/config.py`). The same client carries vision models via image
  content parts.
- There is **zero camera groundwork**: no `getUserMedia`, workers, wasm, or
  WebGPU anywhere in the frontend. And note for the perf budget: the /play
  cube **renders continuously** today — Threlte's canvases default to
  on-demand rendering, but `CubeMesh.svelte:85` (and `DemoScene.svelte:50`)
  run permanent auto-invalidating `useTask`s whose imperative lerps Threlte
  cannot observe, so every frame invalidates.

The goal of this doc: let a learner scramble **their own physical cube**, scan
it with a webcam or phone camera, load that state into the app, and then run
every existing experience — walkthroughs, lessons, Qwen narration, hints,
review capture — against the real cube, in a way that (1) respects the human
holding the cube, (2) merges cleanly with every existing feature, and (3)
stays fast and light on phones.

---

## 1. Architectural thesis: the physical cube is an input device

Everything downstream of the cube — coaching, walkthrough playback, Qwen
narration, review capture, challenge anti-cheat — already consumes exactly two
primitives:

1. a facelet `State`, and
2. a stream of completed-move events (`cubeStore.onMove`).

So the feature is **two new producers of those primitives**, and almost
nothing else:

| New producer | What it feeds | Downstream changes |
|---|---|---|
| `cubeStore.loadState(state)` — full-state ingestion after a 6-face scan | the `State` primitive | none (one new `onLoadState` subscription for anti-cheat) |
| Expected-move batches applied on chunk confirmation (§6) — plus rare inferred diffs | the move-event primitive | none — lesson/practice coaching subscribes via `onMove`; review captures the generated walkthrough via `recordSolve`, independent of move events |

All vision code is client-side TypeScript in a new
`frontend/src/lib/physical/` module. The backend gains **one** endpoint (a
Qwen-VL proxy) and one hardened validator. Decisions confirmed up front:
laptop-first but mobile-viable; **client-side classical CV primary, Qwen-VL
fallback**; and — revised by the feasibility audit — **trust-advance with
checkpoint verification** as the tracking model, not per-move re-scanning.

## 2. UX flow and the scanning protocol

Scramble physically → guided 6-face scan → review/correct a 54-sticker grid →
legality validation → `loadState` → guided solve on the real cube.

The center sticker anchors each face's **identity** (white center ⇒ U), but it
does **not** fix the face's **rotation** — a face photographed sideways has the
same center. The protocol resolves this with a fixed grip and scan order:

1. Home grip: **white on top, green facing you**.
2. Scan the four side faces first — F, then rotate the cube `y`-style for R,
   B, L — keeping white on top the whole time.
3. Tip the cube back for U, tip forward for D.

Each scan screen shows the expected center color in the middle cell and the
adjacent-face cue on the top edge. A capture is **auto-rejected** when the
sampled center doesn't match the expected anchor — this catches wrong-face and
gross-rotation mistakes instantly. Residual rotation errors are caught by the
legality validator (§3), which auto-tries the four rotations of a failing face
before asking the user to re-scan.

**Onboarding hardening (from the UX audit):**

- **The UI never utters a face letter.** Cues are "hold the white side up,
  green side facing the camera", not "scan F". Each grip change is
  demonstrated by a small animated 3D cube performing the exact motion — the
  demo-cube infrastructure can render these. The tip-back-for-white-top /
  tip-forward steps are the known confusion hotspot; the animated cue matters
  most there.
- **Auto-capture, not tap-to-capture.** Hold-steady detection (§7's stillness
  loop) triggers the capture; the user's hands are on the cube. Per capture:
  flash the 9 classified colors onto the overlay immediately, pulse
  low-confidence cells, offer one-tap retake.
- **Audio feedback is a requirement, not polish**: shutter tick per capture,
  success chime, error buzz — the user's eyes are on the cube half the time.
- **Failure tolerance**: after 3 consecutive auto-rejects on one face,
  proactively offer manual color entry or the Qwen-VL assist for that face
  instead of looping the user against the center-mismatch wall.
- **Time budget**: 45–75 s for the first full scan (achievable only with
  auto-capture); ~30 s on repeat scans via the persisted per-device anchor
  warm-start (§12).
- The 54-sticker review grid ("adjust" step) doubles as **manual color
  entry**: if camera permission is denied, physical mode degrades gracefully
  to "type in your cube".

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

**Error-surface UX (from the audit): never say "illegal", "invalid", or
"parity" to the user.** The cubie-structure check points at the wrong cubie —
surface *that*: highlight the two suspect stickers on the 54-grid ("these two
look swapped — tap the one that's wrong"), one tap to fix, revalidate
instantly. The rotation auto-fix runs silently. Budget: a wrong scan should
cost the user **one tap**, not a re-scan.

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

**The relative design is a hard requirement, not a nicety**: iOS Safari does
not reliably expose `exposureMode` / `whiteBalanceMode` / `torch` via
`MediaTrackConstraints`, so hardware exposure or white-balance locking cannot
be part of the design (see Sources).

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

### 4.4 Test-image fixture corpus (build this before any camera UI)

`sampler.ts`, `color-classify.ts`, and `legality.ts` are pure functions, so
the entire scanning pipeline is testable in Vitest with **image fixtures and
no camera**. Assemble a corpus in `frontend/src/lib/physical/fixtures/`:

- **Real photos from the internet** — qbr's test images and other
  openly-licensed cube-face photos (varied cubes: glossy stickers,
  stickerless matte, worn stickers).
- **Own photos** — a few phone/webcam shots per face under daylight, warm
  indoor light, and dim light (the red/orange and white/yellow stress cases).
- **Generated/synthetic faces** — rendered 3×3 grids with programmatic
  lighting shifts, white-balance casts, gaussian noise, and specular blobs.
  These can be produced with plain canvas rendering (or the app's own
  Three.js cube via `paintCubeFromState` screenshots) and give exact ground
  truth labels for free.

Each fixture is an image + a 9-label ground truth. The classifier's accuracy
on this corpus is a **Phase-1 gate** (see §11): fix the pipeline against
fixtures first, then point it at a live camera. The corpus also regression-
guards later tuning (k-means seeding, hue heuristics) and gives the Qwen-VL
assist an offline eval set (§4.2's "run our own eval").

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

Follow the moves-carrying subscriber convention PR #33 established for
`onScramble` (subscribers receive the payload, here the loaded `State`).

The `onLoadState` subscription is load-bearing: **challenge anti-cheat must
treat it like `onReset`/`onScramble`** and cancel any live digital run. The
audit confirmed this cheat vector concretely: `loadState` sets state directly
(`isBusy` stays false, no reset/scramble event fires), so scanning a solved
cube mid-run would trip the `isSolved && !isBusy` solved-effect and record a
false time. The fix is a verified one-line addition next to the existing
subscriptions in `challenge.svelte.ts:21-25`.

Rejected alternatives:

- *Solve backend-side and replay `invert(solution)` as an animated scramble* —
  LBL solutions run ~80–120 moves, so ingestion becomes a 30-second animation,
  requires the backend just to load state, and fails outright if the solver
  rejects. The planner's invert-trick remains available *as data* for the
  reference cube and review without animating anything.
- *Physical cube as sole source of truth (digital twin purely decorative)* —
  forfeits the move-event architecture that coaching and challenge subscribe
  to. We keep its UX framing only: while a physical session is active the
  on-screen cube is a **read-only mirror** — drag/keyboard/scramble/reset are
  suppressed behind a `physicalStore.active` guard so digital input can never
  diverge the mirror from reality.

## 6. Guided tracking: trust-advance, checkpoint verification, diff-explain

> **Scan once. Trust by default. Verify at checkpoints. Infer only to explain
> mistakes.**

### 6.1 Why the original scan-on-pause-per-move model was killed

The first draft of this doc proposed re-scanning after every turn. The
feasibility audit killed it twice over:

- **Cadence.** An LBL solution is ~80–120 quarter-turns. A scan gesture is
  not free: stop turning → reorient to the protocol grip → hold steady ~1 s →
  wait for classify → possibly re-present. At 5–10 s each, 40–80 gestures add
  **5–13 minutes of pure scan overhead** and as many flow interruptions to a
  15–40 minute beginner solve. No one finishes that session.
- **Observability.** A single-face capture sees 9 of 54 stickers. A `B` turn
  changes **zero** F-face stickers — roughly one move in six is invisible to
  the presented face, and at BFS depth 2–3 many distinct move sequences
  collide on 9 observed stickers. The `expectedMoves` tie-break rescues
  on-script users — but off-script users are exactly the ones inference
  exists for. **Inference is reliable precisely when it's least needed.**

The fix inverts the trust model, exploiting what the app already knows: the
planner emits `expected_state` per stage, so during a followed walkthrough
**the expected state at every point is known**. Verification is `statesEqual`
(already in `cube/state.ts`) — no inference, no BFS, no depth problem.

### 6.2 The four-tier model

1. **Trust-advance micro-chunks (default — zero scans).** A solver stage is
   8–30 moves, too many to perform blind, so beats are segmented into
   **micro-chunks of 3–6 moves** (one algorithm application or one insertion;
   `SolveStage.moves` segments at algorithm boundaries). The demo cube
   demonstrates the chunk; the user performs it on the real cube; the user
   confirms (tap/space on laptop; large bottom tap-target or
   presentation-as-confirm on phone); the mirror advances by **applying the
   expected moves** via the same `cubeStore.applyMoves` batch — every
   subscriber sees ordinary move events. **The camera is asleep.**
2. **Checkpoint verification (encouraged, ~7 per solve).** At each stage
   boundary: "Show me your cube ✓". A quick **2-face presentation** (green
   front, then tip for white top — ~10–15 s in the home grip) covers 18
   stickers; compare that *subset* against the predicted state. This is
   confirmation, not decoding — partial observability is fine. Match →
   chime + confidence banner; mismatch → tier 4.
3. **On-demand "Check me / I'm lost" (anytime).** Scan 1–2 faces; on
   mismatch, run BFS **from the predicted state** at depth ≤2 with an
   error-model prior (inverted move, right-hand/left-hand face confusion,
   extra U turn — the mistakes beginners actually make). This is the only
   surviving role of `infer-moves.ts`: not "decode arbitrary moves" but
   **"explain a small deviation from a known state"** — exactly the feasible
   regime.
4. **Repair ladder (drift beyond depth 2).** (a) **Guided repair** first: the
   app knows the expected state, so show the sticker-level diff on the mirror
   and propose undo moves. (b) **Partial re-scan**: scan faces one at a time
   against the expected state, stopping as soon as the state is pinned (often
   2–3 faces — the app knows what it's looking for). (c) **Full 6-face
   re-scan last**, and afterwards **"re-plan from here" is the one-tap
   default** — never a fork question a frustrated novice must answer.

Net scan count per solve: 6 (onboarding) + 0–14 optional checkpoint
presentations + as-needed rescues. Honest framing: **move-by-move mistake
coaching ("Expected X, but got Y" mid-algorithm) does not exist in physical
mode** — coaching is chunk- and checkpoint-granular. That is acceptable, and
the doc says so out loud.

### 6.3 What survives from the original inference design

`infer-moves.ts` (pure TS, reusing `applyMove`/`cloneState`/`statesEqual`)
keeps two pieces:

- **Center canonicalization.** Scans are center-canonical; the digital state
  may not be — the solver's translation can emit `x/y/z` and `M/E/S`, which
  displace centers. Apply the unique whole-cube rotation returning centers to
  identity before any compare. Side effect: the user reorienting their
  physical cube between presentations is invisible — exactly right.
- **String-level tie-breaking.** Distinct sequences collide as states
  (`M` ≡ canonicalized `R L'`, `U D` ≡ `D U`). When diff-explain finds
  multiple explanations, rank by longest match against the walkthrough's
  `expectedMoves` continuation — the same `trailingPrefixLength` orientation
  coaching itself uses.

All compute is trivial: subset `statesEqual` and depth-≤2 BFS from a known
state are <1 ms. No WebGPU, no workers, no wasm (see §12 perf budget).

## 7. Scan session state machine and module layout

A new `physicalStore` (`frontend/src/lib/stores/physical.svelte.ts`) is a
reactive façade over a pure, unit-testable FSM — the same
framework-free-engine + `.svelte.ts`-façade pattern the `education/*` engines
use.

```
frontend/src/lib/physical/
  camera.ts         getUserMedia lifecycle (see contract below), facingMode,
                    mirroring policy
  sampler.ts        canvas frame grab, 9-cell median ROI sampling
  color-classify.ts RGB→LAB, CIEDE2000 vs. center anchors, k-means, confidence
  legality.ts       structural + twist/flip/parity validator (§3)
  infer-moves.ts    canonicalize + subset compare + depth-≤2 diff-explain (§6)
  scan-machine.ts   the FSM below
  fixtures/         test-image corpus + ground-truth labels (§4.4)
```

```
idle → camera-init → scanning(face k of 6)
     → adjust      (54-sticker review grid, tap-to-correct; qwen-vl assist;
                    doubles as manual entry when camera is denied)
     → validating  (legality; silent rotation auto-fix; suspect-sticker
                    highlight on failure)
     → ready       (cubeStore.loadState fired; mirror = physical cube)
     → guided      chunk-shown → user-confirms → advanced (expected moves
                   applied) ⟲ next chunk
                   side branches:
                     verify (stage checkpoint: camera wakes → 2-face
                             presentation → subset compare → chime/repair)
                     explain-diff ("check me": 1–2 faces → BFS ≤2 from
                             predicted state)
                     repair (guided undo → partial re-scan → full re-scan,
                             one-tap re-plan)
     → ended       (camera released)

camera sub-state, orthogonal: asleep ↔ waking(≈200–500 ms) ↔ live
```

**Camera lifecycle contract (`camera.ts`)** — this is a performance and trust
requirement, not an implementation detail:

- The camera runs **only during scan windows** (onboarding faces,
  checkpoints, rescues) — roughly 3 minutes of a 35-minute session. Between
  windows the track is **stopped entirely** (not `enabled=false`; LED
  behavior varies by platform), with a visible camera-off indicator.
  Re-acquisition takes ~200–500 ms and does not re-prompt once granted.
- Prefer **one long-lived stream** per window over repeated `getUserMedia`
  calls: WebKit mutes a prior stream's tracks when a second `getUserMedia`
  is issued, with no programmatic unmute (WebKit bug #179363).
- Stop the track on `visibilitychange`/`pagehide`; resume on return. Expect
  track-mute after backgrounding / low-power mode on iOS and recover.
- The `<video>` element must carry `playsinline autoplay muted` or the
  preview is silently black on iOS Safari.
- **Stillness detection** (the auto-capture trigger): `requestVideoFrameCallback`
  throttled to 2–5 fps, `drawImage` the 720p frame onto a **≤160×120 canvas**,
  `getImageData` on ~12k px (sub-ms), frame-diff SAD. Never full-resolution
  `getImageData` per frame — a 720p readback is ~3.7 MB GPU→CPU and stalls
  mid-range Android. Full-res sampling happens only at the 6 discrete capture
  moments. OffscreenCanvas/worker is explicitly overkill at this rate.

Placement: **inside `/play`, not a new route.** A new HudBar tab "Camera"
opens `PhysicalPanel.svelte` for setup; a `PhysicalCameraWindow.svelte` hosts
video + overlay **only during scan windows**. Critically, the physical session
is **not** added to the `closeOthers()` one-experience-at-a-time union in
`play/+page.svelte` (which unions only lesson/practice/walkthrough — verified)
— it is an *input mode* that coexists with those experiences, persisting the
way `challengeStore` does.

## 8. Human-experience spec

Distilled from the UX audit; these are requirements, not polish.

### 8.1 Phone ergonomics

Turning a cube takes both hands; a hand-held phone is impossible. Therefore:

- **Propped phone, front camera, by default.** An explicit setup step ("prop
  your phone against something and sit back", with an illustration) precedes
  camera-init. Rear camera is disqualified for guided scanning — the screen
  faces away, so the user cannot see the overlay, confidence feedback, or
  next-chunk caption. Front-camera quality is irrelevant for 9-cell
  median-ROI color sampling at 30–50 cm.
- **Auto-capture is mandatory** (hands are full); presentation-as-confirm at
  checkpoints; a large full-width bottom tap target for chunk confirms.
- **Mirroring rule** (load-bearing): sample from the **raw frame**, draw the
  overlay in raw coordinates, and mirror preview + overlay together for front
  cameras — otherwise the sampled 3×3 columns silently transpose left/right.

### 8.2 Laptop ergonomics

Cube held in both hands near the webcam, user at ~75–90 cm. Two placement
rules: (a) the camera window sits **top-center, adjacent to the physical
webcam**, so eye-line to preview ≈ eye-line to lens; (b) during guided mode,
the next-chunk text lives **inside or beside the camera/coach HUD**, not in a
separate corner — today `StageCaption` floats mid-left/bottom and
`DemoCubeWindow` docks mid-right, a three-corner visual hunt with full hands.
Build one consolidated **physical HUD strip**: camera (when awake) +
next-chunk moves + confirm affordance. And **roughly double the type size**:
`.stage-move` is 18 px and `.stage-body` 15 px — designed for 50 cm viewing,
unreadable at arm's length with a cube in your hands.

### 8.3 Screen budget (phone especially)

- **The demo/reference cube is the primary visual** — it shows what to do
  next. **Demote the live mirror to a thumbnail** (or hide it) on phone: the
  user is holding the real cube; a full-screen mirror of it is redundant
  reassurance competing for the scarcest resource.
- Merge `StageCaption` text into the demo window as one **coach card** in
  physical mode — not two floating glass panels of 15 px text.
- Camera window appears **only during scan windows**, full-width when active
  on phone (it takes the `DemoCubeWindow` bottom-sheet slot; the two are
  never shown simultaneously).
- Suppress `TouchMovePad`, the keypad HudBar button, and the
  "Drag a face to turn it" hint — actively wrong advice in physical mode.
- The read-only mirror needs an explicit affordance: users *will* drag it.
  Show a "📷 following your real cube" badge on ignored input rather than
  silently swallowing gestures.
- Mobile layout must key off `matchMedia('(pointer: coarse)')` / width
  queries as `play/+page.svelte` already does — **`SCENE_CONFIG.isMobile` is
  a static `false` constant** (`scene-config.ts:6`), not a viewport signal.

### 8.4 Audio

Shutter tick per capture, chime on checkpoint pass, gentle buzz on mismatch.
Eyes are on the cube for most of the session on both form factors.

## 9. Integration with each section

### 9.1 Regular play — with the render-budget mitigation

HudBar gains the Camera tab + panel; `cubeStore` gains
`loadState`/`onLoadState`; drag, keyboard, scramble, and reset are suppressed
while `physicalStore.active` (the guard lands in `scene/keyboard.ts` —
Space=scramble and Enter=reset have **no guard today** — and in
`CubeMesh.svelte`'s drag handling; both files were freshly touched by PR #33,
so implement on top of the merged signatures, e.g. `onScramble` now carries
`moves[]`).

**The original claim "scene, animator, and everything else: untouched" was
wrong on performance.** The /play cube renders continuously (auto-invalidating
`useTask`s in `CubeMesh.svelte:85` / `DemoScene.svelte:50` defeat Threlte's
on-demand default). While `physicalStore.active`:

- switch those tasks to `autoInvalidate: false` and call `invalidate()` only
  during animations, pointer interaction, and expected-move playback — i.e.
  realize the on-demand mode Threlte already defaults to;
- pause mirror rendering entirely during hold-steady capture windows;
- add `webglcontextlost`/`webglcontextrestored` handling to `createRenderer`
  (absent today) — camera + 1–2 WebGL contexts raises context-loss risk on
  phones.

### 9.2 Lessons and coaching

Expected-move batches arrive via `cubeStore.onMove` exactly like typed moves —
`lessonStore`/`practiceStore` subscribe there (verified) and coaching logic is
untouched. Batches animate sequentially at ~220 ms/move, so a 3–6 move chunk
plays on the mirror in ~0.7–1.3 s; the challenge solved-effect gates on
`!isBusy`, so no mid-batch misfires (verified). Chunk-granular feedback is the
norm (§6.2). Lesson steps that instruct whole-cube rotations (`x/y/z`) can't
be observed by center-canonical scans, so those steps get a manual-confirm
gate in physical mode.

### 9.3 Walkthroughs — smaller than first thought, plus one real gate

The original draft proposed a "follow mode" that "redirects engine playback to
the demo cube". **That redirect already exists**: the walkthrough engine's
`WalkthroughApi` is wired to `demoStore`
(`walkthrough.svelte.ts:17-23`) and has never driven the live cube. What
physical mode actually needs from `education/walkthrough.ts`:

- **micro-chunk segmentation** of beats (3–6 move sub-units with their own
  advance points, §6.2), and
- **advance-on-confirm**: a beat/chunk completes on user confirmation (which
  applies the expected moves to the mirror) instead of on demo playback
  finishing.

And the real live-cube hazard the first draft missed: **`solveUserCube()`**
(`walkthrough.svelte.ts:118-136`) applies the solution to the live cube *from
wherever it currently is* — once the user has turned the physical cube past
the generation state, that desyncs the mirror from reality. Physical mode must
**hide or gate `solveUserCube()` and `resetUserCubeToCheckpoint()`**,
replacing them with the repair ladder (§6.2 tier 4).

### 9.4 Qwen narration / ExplorePanel

Works as-is: `ExplorePanel` already calls
`generateWalkthrough({ state: cubeStore.getState(), ... })`, and after
`loadState` that state *is* the physical cube. The planner's
`start_from_current=True` + `invert(solution)`-as-data intro beat is precisely
correct for a cube that "already holds the scramble" (verified:
`walkthroughStore.select` seeds the demo cube from the live snapshot and never
touches the live cube). UX framing: narration text addresses the **physical**
cube; the demo cube demonstrates each chunk; the mirror confirms progress.
Backend untouched.

### 9.5 Challenge Me

**Exclude physical mode from ranked challenge in v1.** The
scan-a-nearly-solved-cube exploit is unanswerable while the start state is
client-supplied. The v2 path (Phase 4) is a **server-issued scramble
protocol**: `/challenge/start` returns a scramble, the user applies it
physically, and the first scan must equal `apply(scramble, solved)` —
server-verified — before the clock runs; even then, keep a **separate physical
leaderboard**, since scan latency makes times incomparable with digital runs.
Required on day one regardless: `onLoadState` cancels any live digital run —
a verified one-line addition beside the existing `onReset`/`onScramble`
subscriptions in `challenge.svelte.ts:21-25` (§5).

### 9.6 Review (merged PR #33)

Composes with zero changes — all verified against the merged code:

- `recordSolve`'s gate (`startFromCurrent && beats.length >= 2`,
  `frontend/src/lib/review/session.ts`) passes for a walkthrough generated
  from a scanned state, and `compileReview` replays beat 0
  (`invert(solution)`) + stage beats from solved, so `solvedAtEnd` holds
  exactly when the user followed the solution through — independent of any
  physical scramble.
- A physical session never fires `onScramble`, so `session.lastScramble`
  stays `undefined` and `scrambleCount` stays 0 — **harmless**:
  `review/+page.svelte` renders from `session.solve` only, and the compiled
  replay reads its scramble from `beats[0].moves`, not `lastScramble`.
- Optional non-breaking extension: chunk-confirmation timestamps on `Beat`
  (`moveTimesMs?: number[]` at chunk granularity) for pace analytics later;
  `compile.ts` ignores unknown fields today.

## 10. Backend additions (thin)

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

## 11. What makes it outstanding — and the build order

1. **The demo is the pitch.** Scan a real cube in front of the judges and have
   Qwen walk you through solving *your* cube — no other layer of the project
   makes "grounded tutoring" this tangible. (Phase 1)
2. **Checkpoint verification feeding the existing coach.** The moment a
   2-face presentation makes the app chime "cross complete — nice", the
   deterministic skeleton pays off visibly. (Phase 2)
3. **The legality validator.** Invisible when it works, but it is the
   difference between "these two stickers look swapped — tap to fix" and a
   cryptic solver error — and it hardens the public API for free. (Phase 1,
   TS; Phase 3, Python mirror)
4. **Qwen-VL assist.** Keeps Qwen in the vision story at near-zero cost,
   scoped to the cases where it genuinely helps (red/orange in dim light).
   (Phase 3)
5. **Physical solves in `/review`.** Your real solve, scroll-scrubbed on the
   canvas — composes with the merged review feature unchanged. (Phase 3)

### Phased roadmap

| Phase | Scope | Success criteria |
|---|---|---|
| **P0 — Fixture corpus + pure pipeline, ~2–3 d** | assemble §4.4 corpus (internet + own photos + synthetic renders); implement `sampler.ts`/`color-classify.ts`/`legality.ts` as pure functions with Vitest against fixtures | classifier ≥ 52/54 per face on the normal-light fixture set, ≥ 48/54 on stress sets with low-confidence cells correctly flagged; legality validator catches every corrupted fixture; TS test suite green with **no camera code at all** |
| **P1 — Scan → Solve walkthrough (MVP), ~1–1.5 wk** | `camera.ts` (lifecycle contract §7) + FSM through `ready`; `PhysicalPanel` + onboarding UX (§2: no face letters, animated cues, auto-capture, audio ticks); adjust grid; `cubeStore.loadState` + `onLoadState` + challenge-cancel; render-budget mitigation (§9.1); ExplorePanel on scanned state; trust-advance chunks without checkpoints (confirm-only) | full first scan ≤ 75 s under normal indoor light; suspect-sticker one-tap fix works; `generateWalkthrough` succeeds on a scanned state and a full guided solve completes with **zero scans after onboarding**; a digital challenge run cancels on `loadState`; stillness loop ≤ 3 ms/tick at 2–5 fps on a mid-range phone; camera LED off between scan windows |
| **P2 — Checkpoint verify + diff-explain + repair, ~1 wk** | stage-boundary 2-face verification (subset compare); "check me" diff-explain (BFS ≤2 from predicted state, error-model prior); repair ladder incl. partial re-scan; `solveUserCube`/reset gating; phone layout (mirror thumbnail, coach card, presentation-as-confirm) | checkpoint pass/fail correct on seeded mistakes (inverted move, wrong face, extra U); deliberate drift recovers via guided repair or ≤3-face partial re-scan without a full re-scan; propped-phone end-to-end solve completes |
| **P3 — Assist + capture + lessons, ~3–5 d** | `POST /scan/assist`; Python legality mirror wired into `/solve`; review capture of physical solves verified end-to-end; lessons in physical mode (rotation steps gated manual) | red/orange fixture stress cases resolved by assist; a physical solve appears and scrubs on `/review`; TS↔Py legality cross-validation test green |
| **P4 — Later tier** | ranked physical challenge (server-issued scramble, separate leaderboard); ML grid localization if the fixed overlay proves finicky; per-chunk timestamps in review | — |

### Acceptance criteria mapped to the design

| Requirement (from the idea) | Where it lands |
|---|---|
| Scan each side with center color as anchor | §2 protocol + §4.1 anchors; auto-reject on center mismatch |
| Map sides to state maps | §3 — scans are center-canonical `State`s; legality validator |
| Qwen-VL as the mapping model | §4.2 — scoped to fallback/disambiguation via `POST /scan/assist` |
| Cheaper than the Qwen API | §4.1 — classical CV primary, $0, no new deps |
| Hint system on the live cube | §6 — trust-advance chunks + checkpoint verify + diff-explain against known expected states |
| WebGPU / parallel processing sweet spot | §6.3/§7/§12 — sub-ms compute; rVFC 2–5 fps downscaled stillness loop; no workers/WebGPU; the real perf work is render + camera lifecycle |
| Human experience first | §6 (zero mandatory scans after onboarding), §8 (ergonomics/layout/audio), §3 (one-tap error recovery) |
| Merges with course, challenge, narration, play, review (incl. PR #33) | §9.1–9.6, all claims code-verified post-merge |
| Fast and light on phones | §7 camera contract, §9.1 render mitigation, §12 budget (~1–3 ms/tick during scan windows only) |

## 12. Risks and open questions

- **Render/battery (required mitigations, verified).** The mirror renders
  continuously today; while physical mode is active it must go truly
  on-demand, and the camera must sleep between scan windows (§7, §9.1).
  Steady-state budget with both mitigations: **~1–3 ms/tick at 2–5 fps during
  scan windows, zero recurring cost otherwise**; per-scan compute
  (LAB + CIEDE2000 + k-means(6,54) + legality + BFS ≤2) is <1 ms.
- **iOS Safari camera.** `<video playsinline autoplay muted>` or black
  preview; one long-lived stream per window (second `getUserMedia` mutes the
  first — WebKit #179363); tracks mute on backgrounding/low-power; deviceIds
  re-randomize per load; no reliable `torch`/`exposureMode`/
  `whiteBalanceMode` — hence relative classification is a requirement (§4.1).
- **Camera permission UX.** Explain-before-prompt screen; `getUserMedia`
  requires a secure context (fine in prod behind Caddy; localhost is exempt in
  dev). Denial falls back to manual color entry via the adjust grid.
- **Lighting.** Per-session center anchors + k-means absorb global color
  casts; the hard pairs are red/orange and white/yellow under warm bulbs
  (CIEDE2000 + hue-ordering heuristic + VL assist). Median-of-ROI sampling
  defeats speculars; stickerless matte cubes are actually the easy case. The
  §4.4 fixture corpus is the regression net for all of this.
- **Mirrored-video gotcha.** Sample from the raw frame, mirror preview +
  overlay together for front cameras (§8.1) — else L/R columns silently
  transpose.
- **Face-grid rotation.** Center anchors fix identity, not rotation — handled
  by the §2 protocol + center auto-reject + the validator's silent rotation
  auto-fix. Residual risk (two rotation errors composing into a legal state)
  is astronomically unlikely and would surface immediately as a checkpoint
  mismatch.
- **Solver alphabet.** `lbl.py`'s translation can emit `M/E/S/x/y/z` — hence
  canonicalization (§6.3), and chunk instructions must render slice/rotation
  moves with physical-friendly phrasing. Open question: does `notation.py`'s
  `optimize_solution`/`cleanup` ever leave `x/y/z` mid-stage? (Affects chunk
  segmentation; verify with a corpus of solves before P2.)
- **Merge surface (updated).** PR #33 is merged; this branch
  (`feat/camera-inference`) has merged `main` in. The freshly-changed files
  the feature must edit again are `scene/keyboard.ts` (suppression guard in
  the same handler whose `onScramble` signature just changed) and
  `routes/play/+page.svelte` — rebase carefully if this branch lives long.
  Adopt PR #33's moves-carrying subscriber convention for `onLoadState`.
- **Calibration persistence.** Persist the six anchor LABs per device in
  localStorage as a warm start (§2's 30 s repeat-scan budget assumes this).
- **Chunk segmentation quality.** Splitting `SolveStage.moves` into 3–6 move
  micro-chunks at "algorithm boundaries" needs a heuristic (repeated
  trigger patterns, U-alignment moves as separators). Decide during P2 with
  real solver output.

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
- [Threlte — render modes](https://threlte.xyz/docs/learn/basics/render-modes/) · [Threlte `<Canvas>` reference](https://threlte.xyz/docs/reference/core/canvas/)
- [web.dev — requestVideoFrameCallback](https://web.dev/articles/requestvideoframecallback-rvfc) · [MDN — requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [webrtcHacks — Guide to Safari WebRTC](https://webrtchacks.com/guide-to-safari-webrtc/) · [WebKit #179363 — second getUserMedia mutes prior track](https://bugs.webkit.org/show_bug.cgi?id=179363) · [WebKit #176843 — black camera stream](https://bugs.webkit.org/show_bug.cgi?id=176843)
- [MDN — MediaTrackConstraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints) · [W3C — MediaStream Image Capture](https://www.w3.org/TR/image-capture/)

**Flagged as unverified** (re-check before implementation): qwen-vl-plus
VL-specific pricing (search results conflate it with text `qwen-plus`);
official Qwen-VL latency figures (estimates only); the exact image-token /
`vl_high_resolution_images` caps; and — most importantly — any published VLM
cube-scanning accuracy benchmark (none found; the §4.4 fixture corpus doubles
as our own eval set).
