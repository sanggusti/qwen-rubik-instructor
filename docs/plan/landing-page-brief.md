# Landing Page — Engineering Brief

> Hand this to whoever builds the landing page. It's a complete brief: the story, the copy, the engineering approach, and how to verify it.

## Context

We're submitting **Qwen Rubik Instructor** to the [Global AI Hackathon Series with Qwen Cloud](https://qwencloud-hackathon.devpost.com/) under **Track 1: MemoryAgent** (submission deadline **Jul 9, 2026**). The app today is a single-page interactive cube tutor at `/` — there's no front door that tells the story or sells the idea.

The story we're telling:

> *People said an LLM can't solve a Rubik's Cube. We made it solve one — verifiably — and then made it teach you how, in plain language, adapting as you learn.*

The landing page is net-new and becomes the homepage; the existing cube app moves to `/play`. It reuses the project's existing Three.js cube so the hero is the real product, not a mockup. Done well, it strengthens two scored rubric dimensions (**Presentation & Documentation 15%**, **Problem Value & Impact 25%**) and doubles as content for the optional **Blog Post prize** and the **<3-min demo video**.

### Decisions locked
- **Deliverable:** full build inside `frontend/` (SvelteKit), not a separate site or design-only.
- **Routing:** landing at `/`; move the current app to `/play`.
- **3D:** reuse the existing Three.js cube, driven by scroll.
- **Footer:** minimal (links + credits), no team "About us" block.

### Hackathon rubric (context — the landing page is not judged on its own, but feeds these)
- Innovation & AI Creativity — 30%
- Technical Depth & Engineering — 30%
- Problem Value & Impact — 25%
- Presentation & Documentation — 15%
- Required in submission: public repo + OSS license, text description, **Architecture Diagram**, **proof of Alibaba Cloud deployment**, **<3-min demo video**, track ID. (The landing page is the natural home for the architecture diagram + demo-video embed.)

---

## The story (scroll narrative — actual copy to use)

Seven pinned "scenes." The cube stays on screen (sticky full-viewport canvas) and reacts to scroll while text overlays fade in/out. Tone: confident, retro-arcade, short lines. Reuse the existing synthwave voice (Orbitron display font, magenta/cyan neon).

**Scene 0 — Hero (solved cube, slow idle spin)**
- Eyebrow: `QWEN RUBIK INSTRUCTOR`
- H1: **"They said an LLM couldn't solve a Rubik's Cube."**
- Sub (reveals on first scroll): *"We made it solve one. Then we made it teach you."*
- Scroll cue ▼

**Scene 1 — The doubt (cube scrambles as you scroll)**
- **"The internet mostly agreed: language models can't really do this."**
- *Builders tried. Moves drifted, state fell apart, the cube "solved" itself into nonsense.*
- Three short paraphrased-and-attributed callouts linking the receipts (do **not** paste their text verbatim — paraphrase + link):
  - [LinkedIn — Anusheel Chapagain](https://www.linkedin.com/posts/chapagainanusheel_tried-building-a-rubick-cube-solver-and-injected-ugcPost-7415202857299419136-OQ7I/)
  - [Hacker News thread](https://news.ycombinator.com/item?id=47881036)
  - [LinkedIn — Phillip Mortimer](https://www.linkedin.com/posts/phillip-mortimer_rubikscube-genai-share-7253491928489512961-3tpt/)

**Scene 2 — Respect the cube (cube rotates, then "explodes" into cubies à la stewartsmith.io)**
- **"First, respect the cube."**
- Animated counter rolling up to: **`43,252,003,274,489,856,000`**
- *"43 quintillion arrangements. Exactly one is solved."*
- Anatomy beat (pulled from `backend/narrative/planner.py` `_ANATOMY_FRAMES`): *"26 cubies orbit a fixed frame — 6 centers that never move, 12 edges, 8 corners, one hidden core."*
- (Note: the 43-quintillion figure is a true, on-brand fact we're **adding** — it is not currently in the codebase.)

**Scene 3 — The fix: a verified solver (cube solves itself, layer by layer, on scroll)**
- **"So we stopped asking the AI to guess."**
- *"A deterministic layer-by-layer solver finds the answer. Every solution is replayed on the cube and proven solved before you ever see it."*
- Proof-point (from `docs/04-debloating-the-solve-human-followable-moves.md`): *"One 13-move scramble first produced a 246-move salad with 32 whole-cube spins. We optimized it into something a human can actually follow."*

**Scene 4 — The voice: Qwen (narration streams in beside the solving cube)**
- **"Then we handed the teaching to Qwen."**
- *"The solver is always right. Qwen makes it make sense — narrating each move live over a streaming connection, in a style tuned to your level."*
- Visual: faux SSE narration lines typing in next to the cube (mirrors the real `/narrate/*` stream).

**Scene 5 — It teaches like a tutor (MemoryAgent angle — our track)**
- **"It teaches like a tutor, not a robot."**
- Bullets: guided lessons · practice drills · ask Qwen anything mid-solve · "get unstuck" rescue.
- *"It remembers what you struggle with — and forgets what you've mastered, resurfacing it weeks later when review is due."* (the forgetting-curve memory in `frontend/src/lib/education/profile.ts` — this is our Track 1 story.)

**Scene 6 — CTA (cube snaps to solved, glows)**
- **"Ready to solve yours?"**
- Primary button → **`/play`**: `Start solving →`
- Secondary links: Watch the demo · GitHub repo

**Footer (minimal)**
- Links: GitHub repo · Hackathon page · Demo video · `/play`
- Credit line: *"Built with Qwen on Alibaba Cloud · 3D by Three.js / Threlte"*

---

## Technical approach (engineering)

### 1. Route refactor — move app to `/play`, scaffold landing at `/`
- Move the contents of `frontend/src/routes/+page.svelte` (the `<CubeCanvas>` + `TouchMovePad` + `StageCaption` + `HudBar` composition) into a new **`frontend/src/routes/play/+page.svelte`**. No logic changes — the stores it uses (`lessonStore`, `practiceStore`, `walkthroughStore`) are imported by path and unaffected.
- Create a new **`frontend/src/routes/+page.svelte`** = the landing page.
- `frontend/src/routes/+layout.svelte` (the retro shell: fonts + global styles) is shared and stays as-is — it will now wrap both routes. Confirm the global `100vh` cube stage styles don't fight the scrolling landing layout; scope landing styles to the landing component.
- The app uses `@sveltejs/adapter-static` as an **SPA**. Confirm SPA fallback is configured (`fallback` in the adapter, or `prerender`/`ssr` settings) so `/play` resolves on direct load and refresh. **Consult the `svelte` MCP `get-documentation` for `kit/routing` and the adapter-static SPA pattern before implementing** (per `CLAUDE.md`).
- Grep for hardcoded `href="/"` / internal links that assumed the app lived at root (e.g. in `HudBar`, favicon/guide links) and repoint anything that should now go to `/play`.

### 2. Make the existing cube reusable for a scroll hero
- The hero reuses `frontend/src/lib/scene/CubeCanvas.svelte` + `CubeMesh.svelte` — **without** the HUD/pads.
- Add an **`interactive` prop (default `true`)** to `CubeCanvas.svelte`. On the landing page pass `interactive={false}` to disable `OrbitControls` user input (and the drag/keyboard controls in `CubeMesh`), since scroll drives the camera/cube there. Keep this surgical — a prop, not a fork.
- Build a thin **`LandingCube.svelte`** wrapper that mounts the canvas in a `position: sticky; height: 100vh` container behind the scrolling text sections.

### 3. Drive the cube from scroll
- **Precompute one good scramble + its verified solution** so the hero is real, not faked. Two options (pick the simpler that looks good):
  - call the existing backend `/solve` once at build/dev time and hardcode the resulting move list, **or**
  - generate via the existing `frontend/src/lib/cube/scramble.ts` + the move/state utilities and store the sequence as a constant.
- Map **scroll progress (0→1) to a frame in the sequence**: scenes 1–2 play the scramble; scene 3 plays the solution; scene 6 lands on solved. Reuse `frontend/src/lib/scene/animator.ts` (quarter-turn tweens) and the scene state in `frontend/src/lib/scene/state.ts` to apply/step moves — do not write a new cube engine.
- For the "explode into cubies" beat (Scene 2), interpolate each cubie group's distance from center by scroll progress (the cube is 27 `THREE.Group`s in `scene/cube.ts`) — mirrors the stewartsmith.io effect.
- **Scroll/pinning tooling:** recommend **GSAP `ScrollTrigger`** scoped to the landing route only — it's the de-facto tool for Apple-style pinned scrubbing and handles scrub + snap cleanly. (Native `IntersectionObserver` + a scroll-progress rune store is the dependency-free fallback, but pinned scrubbing is fiddly to get smooth by hand.) Initialize/destroy it in `onMount`/cleanup so it never leaks into the `/play` route.

### 4. Polish & guardrails
- Reuse design tokens from `frontend/src/lib/styles/tokens.css` (`--font-display` Orbitron, `--accent-a` magenta `#ff2bd6`, `--accent-b` cyan `#00f0ff`, deep-space bg) and `retro.css` so the page matches the app exactly.
- **`prefers-reduced-motion`:** disable scroll-scrubbing/pinning, render a static solved cube, and let the scene copy flow as a normal vertical page. CTA still works.
- **Mobile:** the existing `SCENE_CONFIG.isMobile` path already lowers pixel-ratio/antialias; verify the pinned canvas performs on a coarse-pointer viewport and that text sections remain readable over the cube.
- Keep all new copy/UI in **English** (rubric requirement).

---

## Task breakdown

1. **Route move** → app to `/play`, scaffold empty `/` landing; verify `/play` is fully functional (lessons, drills, Qwen solve) and direct-loads/refreshes. → verify: app works at `/play`, no dead `/` links.
2. **`interactive` prop** on `CubeCanvas` + `LandingCube.svelte` sticky hero. → verify: cube renders on `/`, no orbit/drag input there; `/play` interaction unchanged.
3. **Scroll driver**: precomputed scramble→solve mapped to scroll progress; explode beat. → verify: scrubbing scroll scrambles then solves the cube smoothly both directions.
4. **Scenes 0–6 content + overlays** with the copy above; animated 43-quintillion counter. → verify: each scene reveals on scroll, copy matches, links resolve.
5. **CTA + minimal footer** → `/play`, repo, demo video, hackathon, credits. → verify: `Start solving →` navigates to a working `/play`.
6. **Reduced-motion + mobile fallbacks.** → verify: reduced-motion shows static cube + flowing content; mobile viewport is smooth and readable.
7. **Svelte hygiene**: run `svelte-autofixer` (svelte MCP) on every new/edited `.svelte` file; keep Vitest green.

---

## Verification (end-to-end)

- Start the app: `npm run dev` in `frontend/` (Node 23 — repo is `engine-strict`). Optionally run the backend if Scene 4 pulls a live narration sample; otherwise the hero uses the precomputed sequence and needs no backend.
- Manual: load `/`, scroll top→bottom — confirm scramble→solve, scene reveals, counter, CTA. Click CTA → `/play` loads and is fully interactive. Direct-load `/play` and refresh — no 404.
- **Playwright MCP** (`http://localhost:5173`): screenshot the hero, a mid-scroll solving frame, and the CTA scene to confirm the golden path renders; test a mobile viewport; toggle reduced-motion and confirm the static fallback.
- **svelte MCP**: `svelte-autofixer` clean on all new `.svelte` files; `get-documentation` consulted for `kit/routing` + adapter-static before the route move.
- `npm run build` succeeds (static SPA) and the built `/` + `/play` both load from the bundle.

## Out of scope
- Architecture diagram and demo-video production (separate submission deliverables — the footer just links to them).
- Backend changes. The landing hero should run without the backend.
- Any "About us"/team section.