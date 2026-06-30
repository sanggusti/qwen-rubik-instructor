# From a Vite SPA to SvelteKit: a rewrite the engines made safe

*Part 8 of a series on turning a Rubik's cube prototype into a learn-with-LLM tutor.*

## A rewrite is where good architecture cashes out

For seven parts the frontend was a vanilla-TypeScript single-page app: a Vite
build, a hand-wired `main.ts` entry, and DOM panels assembled imperatively. It
worked. But every new panel meant more by-hand wiring — query the element, attach
the listener, toggle the class, remember to tear it down — and the "only one
experience runs at a time" rule lived as a `closeOthers()` function that manually
reached into each panel. The cube was a joy; the UI around it was becoming a chore.

So the app was rewritten onto **SvelteKit** (Svelte 5 runes, Threlte for the 3D,
the static-SPA adapter). The interesting part of this post isn't that we picked
Svelte. It's *why the rewrite was cheap* — and the answer is a boundary the
project had been defending since Part 3.

## The boundary that made it a skin-swap, not a rewrite

This series has one throughline: **deterministic skeleton, generative skin.** The
cube math, the solver, the curriculum, and the move-grounding are deterministic
and tested; the LLM only ever writes *words* over a structure it can't break.

A UI framework migration is the same idea wearing different clothes. The cube
model and the learning engines were already **framework-agnostic** — by design,
not by luck:

```text
lib/cube/        # cube state model, events, scramble — no Svelte/Three imports
lib/education/   # lesson / practice / walkthrough engines, validators, profile
lib/api/         # narrate.ts — the SSE client
```

None of that knows what renders it. `LessonEngine`, `PracticeEngine`, the
`profile` memory with its Part-6 forgetting curve, the move-grounded `narrate.ts`
client — all of it is plain TypeScript that takes a cube API and returns state.
So the rewrite touched only the **skin**: the imperative DOM panels became Svelte
components, and the hand-wired listeners became runes-backed stores. The skeleton
ported verbatim. The engines that took seven parts to get right were never at
risk, because nothing in them had to change.

You can see the seam in the new `+page.svelte`, which still carries the old rule
under a new mechanism:

```ts
// Only one experience runs at a time, so the stage caption has a single owner.
// …same rule as the legacy main.ts's closeOthers.
function closeOthers(keep: 'lesson' | 'practice' | 'walkthrough' | 'none'): void {
  if (keep !== 'lesson') lessonStore.closeLesson();
  if (keep !== 'practice') practiceStore.closeDrill();
  if (keep !== 'walkthrough') walkthroughStore.close();
}
```

Same invariant, now expressed against reactive stores instead of DOM queries. The
`*.svelte.ts` stores are the *only* new layer — a thin runes glue between the
untouched engines and the components:

```text
lib/stores/cube.svelte.ts   # exposes applyMoves / scramble / reset / getState / onMove
lib/stores/lesson.svelte.ts # wraps LessonEngine; nothing engine-specific leaks up
```

Three.js got the same treatment: instead of an imperative renderer, the cube is a
declarative **Threlte** scene (`CubeCanvas` + `CubeMesh`), with the genuinely
imperative bits — the move animator, drag controls, keyboard input — kept as plain
controllers the component mounts. Declarative where it helps, imperative where the
animation demands it.

## Why SvelteKit, and the one config wrinkle

The app has no SEO need and *must* run client-side — it needs `window` and WebGL,
and it's meant to drop into a host page as a static bundle. SvelteKit gives that
cleanly with two lines in the root layout:

```ts
// +layout.ts
export const ssr = false;       // the cube needs the browser
export const prerender = true;  // emit a static shell
```

paired with `@sveltejs/adapter-static`. Runes mode is forced on for app code (not
`node_modules`) so the whole tree is Svelte 5 idiom. `npm run build` writes a
static site you can serve from anywhere — the same "clean target for the backend
to drive" property the cube always had, now true of the whole front end.

## Verified — and the bring-up archaeology

Per Part 1's doctrine, *verify before you trust*. After the rewrite merged, the
honest first question was: does it even run? It did not — and the three reasons are
worth recording, because they're the exact rocks the next person will trip on.

**The dependency tree was a ghost.** `node_modules` still held the *pre-rewrite*
packages — Vite 5, three 0.166, no `svelte` at all. The lockfile had moved on; the
installed tree hadn't. A clean `rm -rf node_modules .svelte-kit && npm install`
fixed it. Lesson: a framework swap invalidates the installed tree even when `git`
looks clean.

**Node was in the unsupported gap.** The toolchain wants
`^20.19 || ^22.12 || >=24`, and the machine had Node **23.10.0** — newer than the
floor, older than the ceiling, and odd-numbered, so excluded. With
`engine-strict=true` in `.npmrc`, install hard-failed. The toolchain runs fine on
23 at runtime, so a scoped `npm_config_engine_strict=false` unblocked the QA pass;
the real fix is a supported Node.

**A strict env import with no value.** The build died on:

```text
"PUBLIC_BACKEND_URL" is not exported by "$env/static/public"
```

`narrate.ts` reads the backend URL through SvelteKit's **static** env module,
which only exports variables that exist at build time. There was no
`frontend/.env`, so the symbol didn't exist, so the import was a compile error —
in dev *and* build. One file fixed it:

```bash
# frontend/.env (gitignored)
PUBLIC_BACKEND_URL=http://localhost:8000
```

(The repo-root `.env` is the *backend's* — it holds `DASHSCOPE_API_KEY` and is read
by `config.py`. Vite reads its env from `frontend/`. Two `.env` files, two owners;
conflating them is the trap.)

With those three cleared: **202 frontend tests green**, a clean static build, and a
real browser drive — spin the cube, scramble, generate a Qwen lesson, watch it
stream in and animate. The rewrite is real, and the engines that make it a tutor
came across untouched.

## The throughline

Part 4 made a correct solve *followable*. Part 7 made the grader *honest*. This
part made the front end *maintainable* — and it was cheap for the same reason those
were tractable: the parts that are hard to get right (cube math, engines, memory,
move-grounding) were quarantined behind an interface, so the parts that change
often (the rendered skin) can be swapped without touching them. Deterministic
skeleton, generative skin — it turns out the rule that keeps an LLM tutor
trustworthy is also the rule that lets you rewrite the UI in a weekend.
