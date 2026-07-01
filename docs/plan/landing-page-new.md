# Landing Page – Scroll-Driven Cube Explosion Redesign

**Reference:** [Recreating Apple's Vision Pro Animation in CSS](https://css-tricks.com/recreating-apples-vision-pro-animation-in-css/)  
**Date:** 2026-07-01  
**Branch target:** `feat/landingpage`

---

## Narrative Arc (what the user experiences)

| Scroll position | What happens |
|---|---|
| At top (0%) | Full-screen Rubik's cube spins slowly. Title + CTA overlay visible. |
| Scrolling 0→40% | Cube continues spinning. Title starts to fade. |
| Scrolling 40→70% | **Explosion:** 27 cubies fly outward in all directions, each along its own lattice vector. |
| Scrolling 70→100% | **Reassembly:** cubies converge back together, but now shifted left. Right half fades in explanation text. |
| Past sticky runway | `HeadlineSection` scrolls in naturally below (detailed text, no second cube). |

---

## Current State

```
LandingPage.svelte          — scroll-snap container, fade-in on mount
  HeroSection.svelte        — 100dvh, Three.js cube in background, headline + CTA
    DecorativeCubeScene.svelte → SpinningCube.svelte (whole CubeMesh, static spin)
  HeadlineSection.svelte    — two-column: cube left, glass-panel explainer right
  ContributorsSection.svelte— flex-wrap grid of contributor cards
  LandingFooter.svelte      — footer
```

Existing Three.js structure to reuse:
- `CubeMesh` in `scene/cube.ts` — already builds 27 `cubie` objects, each a `THREE.Group` at lattice `(x, y, z)` ∈ {-1,0,1}³
- `CUBIE_SIZE = 1`, `CUBIE_GAP = 0.02`, so `step = 1.02`
- `Threlte` (`@threlte/core`) is already installed and in use

---

## Architecture Change

```
LandingPage.svelte             — remove scroll-snap; track scrollTop, derive heroProgress
  HeroStage.svelte    (new)   — 300vh runway, sticky canvas, receives heroProgress
    ExplodingCubeScene.svelte (new)  — Canvas wrapper, passes explodeProgress to ExplodingCube
      ExplodingCube.svelte    (new)  — Three.js: per-cubie position driven by explodeProgress
    .hero-overlay              — title + CTA, CSS opacity tied to progress
    .split-overlay             — two-column: [cube left | text right], fades in at end of runway
  HeadlineSection.svelte      — remove its DecorativeCubeScene; keep glass-panel text + view-timeline
  ContributorsSection.svelte  — add view-timeline stagger on cards
  LandingFooter.svelte        — unchanged
```

---

## Scroll Progress Plumbing

The existing `LandingPage.svelte` div is already the scroll root (`overflow-y: auto`). We extend it:

```svelte
<!-- LandingPage.svelte -->
<script lang="ts">
  let scrollEl = $state<HTMLDivElement | null>(null);
  let heroProgress = $state(0); // 0→1 over the hero runway

  function onscroll() {
    if (!scrollEl) return;
    // heroRunwayHeight = 300dvh − 100dvh = 200dvh of "extra" scroll room
    const runway = scrollEl.clientHeight * 2; // 200dvh worth of pixels
    heroProgress = Math.min(scrollEl.scrollTop / runway, 1);
  }
</script>

<div class="landing" bind:this={scrollEl} {onscroll}>
  <HeroStage {heroProgress} {onPlay} />
  <HeadlineSection />
  <ContributorsSection />
  <LandingFooter />
</div>
```

`heroProgress` (0→1) is the single value that drives all Three.js animation. No IntersectionObserver, no requestAnimationFrame polling.

---

## `HeroStage.svelte` (new — replaces `HeroSection.svelte`)

```
.hero-stage       { height: 300dvh; }          /* scroll runway */
.hero-sticky      { position: sticky; top: 0; height: 100dvh; }
  ExplodingCubeScene (fills sticky panel)
  .hero-overlay   (title + CTA, fades out as progress→0.4)
  .split-overlay  (two-column, fades in as progress→0.8..1.0)
```

All overlay layers use CSS `opacity` bound directly to `heroProgress` via inline style — no animation-timeline needed because we're already reading JS scroll state to drive Three.js.

```svelte
<!-- HeroStage.svelte excerpt -->
<script lang="ts">
  let { heroProgress, onPlay }: { heroProgress: number; onPlay: () => void } = $props();

  // Fade title out between progress 0.3–0.5
  const titleOpacity = $derived(1 - clamp((heroProgress - 0.3) / 0.2, 0, 1));
  // Fade split-view in between progress 0.75–0.95
  const splitOpacity = $derived(clamp((heroProgress - 0.75) / 0.2, 0, 1));

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }
</script>

<div class="hero-stage">
  <div class="hero-sticky">
    <ExplodingCubeScene explodeProgress={heroProgress} />

    <div class="hero-overlay" style="opacity: {titleOpacity}">
      <h1 class="neon-heading">QWEN RUBIK INSTRUCTOR</h1>
      <p class="tagline">Learn to solve the cube — one move at a time.</p>
      <PlayButton label="Play Me!" {onPlay} />
    </div>

    <div class="split-overlay" style="opacity: {splitOpacity}; pointer-events: {splitOpacity > 0.5 ? 'auto' : 'none'}">
      <!-- left column is the WebGL canvas (already filling background) -->
      <div class="split-text glass-panel">
        <h2 class="neon-heading">WHAT IS A RUBIK'S CUBE?</h2>
        <p>A 3×3×3 twisty puzzle. Six faces, 27 cubies, 43 quintillion scrambled states — one solved state.</p>
        <p>Every lesson starts from logic, not memory. You learn <em>why</em> each move works, so you can reproduce it on any scramble.</p>
        <PlayButton label="Start Learning" {onPlay} />
      </div>
    </div>
  </div>
</div>
```

```css
/* HeroStage.svelte <style> */
.hero-stage { height: 300dvh; }

.hero-sticky {
  position: sticky;
  top: 0;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
}

.hero-overlay {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
  max-width: min(90vw, 640px);
  z-index: 2;
  transition: opacity 60ms linear; /* matches ~1 frame for smoothness */
}

.split-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  padding: 0 48px;
  z-index: 2;
  pointer-events: none;
}

.split-text {
  padding: 32px;
  border-radius: 18px;
  grid-column: 2; /* right column; cube canvas is left via WebGL */
}

@media (max-width: 760px) {
  .split-overlay { grid-template-columns: 1fr; }
  .split-text { grid-column: 1; }
}
```

---

## `ExplodingCubeScene.svelte` (new)

Thin wrapper identical to `DecorativeCubeScene.svelte` but passes `explodeProgress` instead of `speed`:

```svelte
<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import ExplodingCube from './ExplodingCube.svelte';

  let { explodeProgress = 0 }: { explodeProgress?: number } = $props();

  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0);
    return r;
  }
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, 2]}>
    <T.PerspectiveCamera makeDefault fov={45} near={0.1} far={100}
      position={[5, 5, 7]} oncreate={(ref) => ref.lookAt(0, 0, 0)} />
    <ExplodingCube {explodeProgress} />
  </Canvas>
</div>

<style>
  .stage { width: 100%; height: 100%; position: absolute; inset: 0; }
</style>
```

---

## `ExplodingCube.svelte` (new — core animation logic)

```svelte
<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { CubeMesh, CUBIE_SIZE, CUBIE_GAP } from '../scene/cube';
  import * as THREE from 'three';

  let { explodeProgress = 0 }: { explodeProgress?: number } = $props();

  const cube = new CubeMesh();
  const step = CUBIE_SIZE + CUBIE_GAP;

  // Capture each cubie's home (assembled) position and explosion direction.
  const cubieData = cube.cubies.map(({ mesh, coord }) => {
    const home = new THREE.Vector3(coord.x * step, coord.y * step, coord.z * step);
    // Direction: normalized lattice coord. Core cubie (0,0,0) gets a small fixed push.
    const dir = coord.lengthSq() > 0
      ? coord.clone().normalize()
      : new THREE.Vector3(0.3, 0.5, 0.2).normalize();
    return { mesh, home, dir };
  });

  // Assembled position offset for the "split view" phase — cube sits left of center.
  const LEFT_SHIFT = new THREE.Vector3(-2.0, 0, 0);

  function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  useTask(() => {
    const p = explodeProgress;

    // Slow continuous spin on the whole group (slows during explosion).
    const spinSpeed = 1 - clamp((p - 0.3) / 0.3, 0, 1); // 1→0 as explosion ramps up
    cube.root.rotation.y += 0.005 * spinSpeed;
    cube.root.rotation.x = Math.sin(performance.now() / 4000) * 0.18 * spinSpeed;

    // Phase 1: explode (p 0.4 → 0.7, normalized t 0 → 1)
    const explodeT = easeInOut(clamp((p - 0.4) / 0.3, 0, 1));
    const EXPLODE_DIST = 4.5; // units each cubie travels outward

    // Phase 2: reassemble left (p 0.7 → 0.95, normalized u 0 → 1)
    const reassembleU = easeInOut(clamp((p - 0.7) / 0.25, 0, 1));

    for (const { mesh, home, dir } of cubieData) {
      // Exploded position = home + dir * EXPLODE_DIST * explodeT
      const exploded = home.clone().addScaledVector(dir, EXPLODE_DIST * explodeT);

      // Reassembled-left position
      const assembledLeft = home.clone().add(LEFT_SHIFT);

      // Blend: during phase 1 we go home→exploded; during phase 2 exploded→assembledLeft
      const target = new THREE.Vector3().lerpVectors(exploded, assembledLeft, reassembleU);
      (mesh as THREE.Group).position.copy(target);
    }
  });
</script>

<T is={cube.root} />
```

**Why this math works:**
- At `p=0`: `explodeT=0`, `reassembleU=0` → all cubies at `home`. Normal cube.
- At `p=0.55`: `explodeT=1`, `reassembleU=0` → all cubies fully exploded. Root spin stopped.
- At `p=0.95`: `explodeT=1`, `reassembleU=1` → all cubies at `assembledLeft`. Cube appears on left side.
- Corner cubies (e.g. `(1,1,1)`, dir = `(0.57, 0.57, 0.57)`) travel 4.5 × 0.57 ≈ 2.6 units on each axis.
- Face-center cubies (e.g. `(1,0,0)`, dir = `(1,0,0)`) travel 4.5 units straight right.

---

## `HeadlineSection.svelte` (update)

Remove the second `DecorativeCubeScene` (redundant — the user already saw the cube in the hero). Replace with a view-timeline CSS fade-in on the copy:

```css
/* HeadlineSection.svelte */
.headline {
  /* keep existing two-column grid, just no cube in left column */
  grid-template-columns: 1fr;  /* single column now */
  max-width: 720px;
  margin: 0 auto;
}

.headline-copy {
  animation: slide-up linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 50%;
}

@keyframes slide-up {
  from { opacity: 0; translate: 0 40px; }
  to   { opacity: 1; translate: 0 0; }
}
```

The left cube column is dropped. Content condenses to a centered single column with the glass-panel explainer — the hero already gave the user an eyeful of the 3D cube.

---

## `ContributorsSection.svelte` (minor update)

Add `--i` CSS variable per card to stagger their view-timeline entry:

```svelte
{#each contributors as c, i (c.name)}
  <a class="card glass-panel" style="--i: {i}" href={c.githubUrl} ...>
```

```css
.card {
  animation: card-pop linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 60%;
  animation-delay: calc(var(--i) * 80ms);
}
@keyframes card-pop {
  from { opacity: 0; scale: 0.85; }
  to   { opacity: 1; scale: 1; }
}
```

---

## `LandingPage.svelte` (update)

```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
  import HeroStage from './HeroStage.svelte';          // replaces HeroSection
  import HeadlineSection from './HeadlineSection.svelte';
  import ContributorsSection from './ContributorsSection.svelte';
  import LandingFooter from './LandingFooter.svelte';

  let { onPlay }: { onPlay: () => void } = $props();

  let scrollEl = $state<HTMLDivElement | null>(null);
  let heroProgress = $state(0);

  function onscroll() {
    if (!scrollEl) return;
    // Runway = 300dvh total − 100dvh viewport = 200dvh of scroll room
    const runway = scrollEl.clientHeight * 2;
    heroProgress = Math.min(scrollEl.scrollTop / runway, 1);
  }
</script>

<div class="landing" bind:this={scrollEl} {onscroll} in:fade={{ duration: 600 }}>
  <HeroStage {heroProgress} {onPlay} />
  <HeadlineSection />
  <ContributorsSection />
  <LandingFooter />
</div>

<style>
  .landing {
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
    /* scroll-snap removed — sticky runway takes over */
  }
</style>
```

---

## Reduced-Motion Fallback

```css
/* In HeroStage.svelte <style> */
@media (prefers-reduced-motion: reduce) {
  .hero-overlay { opacity: 0 !important; }   /* hide — split view shows by default */
  .split-overlay { opacity: 1 !important; pointer-events: auto !important; }
}
```

In `ExplodingCube.svelte`, check at task start:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Pin all cubies at assembledLeft immediately, skip animation
  for (const { mesh, home } of cubieData) {
    (mesh as THREE.Group).position.copy(home.clone().add(LEFT_SHIFT));
  }
  return; // exit task early
}
```

---

## File-by-File Change Summary

| File | Action |
|---|---|
| `LandingPage.svelte` | Remove `scroll-snap-type`; add `scrollEl` binding + `heroProgress` state |
| `HeroSection.svelte` | **Delete** — replaced by `HeroStage.svelte` |
| `HeroStage.svelte` | **Create** — 300dvh runway, sticky panel, overlay layers |
| `ExplodingCubeScene.svelte` | **Create** — Canvas wrapper, pipes `explodeProgress` |
| `ExplodingCube.svelte` | **Create** — per-cubie explosion + reassemble logic using existing `CubeMesh` |
| `HeadlineSection.svelte` | Remove `DecorativeCubeScene`; collapse to single column; add view-timeline |
| `ContributorsSection.svelte` | Add `--i` CSS var per card; add `card-pop` keyframes |
| `DecorativeCubeScene.svelte` | **Delete** — `ExplodingCubeScene` replaces its only remaining use |
| `SpinningCube.svelte` | **Delete** — `ExplodingCube` replaces its only remaining use |

---

## Implementation Order

1. **`LandingPage.svelte`** — remove scroll-snap, add `heroProgress` scroll tracking.  
   Verify: `console.log(heroProgress)` logs 0→1 as you scroll through the top 200dvh.

2. **`ExplodingCube.svelte`** — write the cubie animation logic, hard-code `explodeProgress=0.55` to verify explosion looks right before wiring scroll.  
   Verify: cubies visually spread apart at correct distances; corners go diagonal.

3. **`ExplodingCubeScene.svelte`** — canvas wrapper passing `explodeProgress` through.  
   Verify: swapping `explodeProgress` prop changes the 3D state.

4. **`HeroStage.svelte`** — build sticky scaffold + overlay layers; wire `heroProgress` from parent.  
   Verify: title fades out during scroll 30–50%; split-view (text right) fades in at 75–95%.

5. **`HeadlineSection.svelte`** — remove cube canvas, collapse to single column, add view-timeline.  
   Verify: no second Three.js canvas; text animates in when scrolled into view.

6. **`ContributorsSection.svelte`** — add stagger.  
   Verify: cards pop in sequentially; delay order matches array order.

7. **Reduced-motion fallback** — add `prefers-reduced-motion` blocks to both CSS and TS.  
   Verify: OS accessibility → reduce motion → split view visible immediately, no flash.

8. **Screenshot golden path** via Playwright MCP at `http://localhost:5173` — capture hero (top), mid-explosion, and split-view states.
