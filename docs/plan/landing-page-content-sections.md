# Landing Page – Content Sections (Alternating Cube / Text)

**Reference:** https://stewartsmith.io/work/rubiks-cube  
**Date:** 2026-07-01  
**Branch target:** `feat/landingpage`

---

## Context

After the existing `HeroStage` (scroll-driven explosion + reassembly), the page needs 3–4 editorial sections that alternate cube-left/text-right and text-left/cube-right. Each section uses its own lightweight spinning Rubik's cube on the 3D canvas side.

These sections replace the current single `HeadlineSection.svelte`.

---

## Layout Contract

**Odd sections (1, 3):** cube on LEFT, text on RIGHT  
**Even sections (2, 4):** text on LEFT, cube on RIGHT

```
Section 1 (odd)    │ Section 2 (even)   │ Section 3 (odd)    │ Section 4 (even)
 ┌───────┬───────┐  │  ┌───────┬───────┐  │  ┌───────┬───────┐  │  ┌───────┬───────┐
 │ CUBE  │ TEXT  │  │  │ TEXT  │ CUBE  │  │  │ CUBE  │ TEXT  │  │  │ TEXT  │ CUBE  │
 └───────┴───────┘  │  └───────┴───────┘  │  └───────┴───────┘  │  └───────┴───────┘
```

On mobile (≤760px): both columns stack vertically, cube always on top.

---

## Section Content (from reference)

### Section 1 — "The Anatomy" (odd: cube left, text right)

**Heading:** ANATOMY OF A CUBE

**Body:**
> Ernő Rubik invented the Magic Cube in 1974. What looks like one object is actually 26 independent pieces — three types of cubies that each play a different role.
>
> **Centers (6)** — Fixed in place. They never move relative to each other and define which color belongs to each face.
>
> **Edges (12)** — Two-colored pieces that sit between two face centers. There are 12 of them and they can be in any of two orientations.
>
> **Corners (8)** — Three-colored pieces at each vertex. Each can be twisted into 3 orientations.

**Cube state:** Fully solved, slow idle spin (speed 0.12).

---

### Section 2 — "The Scale" (even: text left, cube right)

**Heading:** 43 QUINTILLION STATES

**Body:**
> There are 43,252,003,274,489,856,000 possible configurations of a 3×3×3 Rubik's Cube — and exactly one solved state.
>
> If you turned one cube per second and started at the Big Bang, you still wouldn't have tried every permutation today.
>
> Despite this, mathematicians proved in 2010 that any scramble can be solved in **20 moves or fewer** — a result known as God's Number.

**Cube state:** Heavily scrambled, slightly faster spin (speed 0.22).

---

### Section 3 — "The Language" (odd: cube left, text right)

**Heading:** SINGMASTER NOTATION

**Body:**
> Every move on the cube has a name. David Singmaster's notation assigns one letter to each of the six faces:
>
> **R** Right · **L** Left · **U** Up · **D** Down · **F** Front · **B** Back
>
> A letter alone means a 90° clockwise turn. A prime (R′) means counter-clockwise. A "2" (R2) means 180°.
>
> This compact language lets algorithms be written, shared, and computed. The entire solve of any scramble fits in fewer than 20 characters.

**Cube state:** Mid-solve appearance — some layers done, top scrambled — medium spin (speed 0.18).

---

### Section 4 — "The Instructor" (even: text left, cube right)

**Heading:** LEARN THE WHY, NOT JUST THE HOW

**Body:**
> Most tutorials teach you to memorize sequences. The problem: memorization breaks the moment the cube looks slightly different.
>
> QWEN Rubik Instructor teaches through **layer-by-layer logic**. Each stage introduces only the moves it needs, with AI narration that explains *why* a sequence works — so you can apply the pattern to any scramble, not just the one in the tutorial.
>
> Start with one face. Then one layer. Then the whole cube.

**CTA:** `<PlayButton label="Start Learning" />`

**Cube state:** Solved cube with gentle float animation — speed 0.08, slight y-bob.

---

## Reusable Components

### `SpinningCubeScene.svelte` (new — replaces deleted `DecorativeCubeScene`)

Minimal canvas wrapper for the section cubes. Same camera/renderer as before, accepts only `speed`:

```svelte
<!-- SpinningCubeScene.svelte -->
<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import SpinningSectionCube from './SpinningSectionCube.svelte';

  let { speed = 0.2 }: { speed?: number } = $props();

  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0);
    return r;
  }
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, 1.5]}>
    <T.PerspectiveCamera makeDefault fov={45} near={0.1} far={100}
      position={[5, 5, 7]} oncreate={(ref) => ref.lookAt(0, 0, 0)} />
    <SpinningSectionCube {speed} />
  </Canvas>
</div>

<style>
  .stage { width: 100%; height: 100%; }
</style>
```

> Note: Using `dpr={[1, 1.5]}` (instead of `[1, 2]`) for section cubes to reduce GPU cost since up to 4 canvases will be live.

### `SpinningSectionCube.svelte` (new — lightweight, time-based, no per-cubie logic)

```svelte
<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { CubeMesh } from '../scene/cube';

  let { speed = 0.2 }: { speed?: number } = $props();
  const cube = new CubeMesh();

  useTask(() => {
    const elapsed = performance.now() / 1000;
    cube.root.rotation.y = elapsed * speed;
    cube.root.rotation.x = Math.sin(elapsed / 4) * 0.18;
  });
</script>

<T is={cube.root} />
```

### `ContentSection.svelte` (new — single reusable section component)

```svelte
<!-- ContentSection.svelte -->
<script lang="ts">
  import SpinningCubeScene from './SpinningCubeScene.svelte';
  import type { Snippet } from 'svelte';

  let {
    flip = false,
    cubeSpeed = 0.18,
    children
  }: {
    flip?: boolean;
    cubeSpeed?: number;
    children: Snippet;
  } = $props();
</script>

<section class="content-section" class:flip>
  <div class="cube-col">
    <SpinningCubeScene speed={cubeSpeed} />
  </div>
  <div class="text-col glass-panel">
    {@render children()}
  </div>
</section>

<style>
  .content-section {
    min-height: 80vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-areas: 'cube text';
    align-items: center;
    gap: 48px;
    padding: 80px 48px;
  }
  .content-section.flip {
    grid-template-areas: 'text cube';
  }
  .cube-col {
    grid-area: cube;
    height: 420px;
  }
  .text-col {
    grid-area: text;
    padding: 40px;
    border-radius: 18px;
  }

  /* View-timeline fade-in for entire section */
  .content-section {
    animation: section-reveal linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 45%;
  }
  @keyframes section-reveal {
    from { opacity: 0; translate: 0 32px; }
    to   { opacity: 1; translate: 0 0; }
  }

  @supports not (animation-timeline: view()) {
    .content-section { animation: none; opacity: 1; translate: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .content-section { animation: none; opacity: 1; translate: none; }
  }

  @media (max-width: 760px) {
    .content-section,
    .content-section.flip {
      grid-template-columns: 1fr;
      grid-template-areas: 'cube' 'text';
      gap: 24px;
      padding: 48px 20px;
    }
    .cube-col { height: 280px; }
    .text-col { padding: 24px 20px; }
  }
</style>
```

---

## `LandingPage.svelte` after change

```svelte
<div class="landing" bind:this={scrollEl} {onscroll} in:fade={{ duration: 600 }}>
  <HeroStage {heroProgress} {onPlay} />

  <!-- Section 1: odd — cube left, text right -->
  <ContentSection cubeSpeed={0.12}>
    <h2 class="neon-heading">ANATOMY OF A CUBE</h2>
    <p>Ernő Rubik invented the Magic Cube in 1974...</p>
    <!-- ... -->
  </ContentSection>

  <!-- Section 2: even — text left, cube right -->
  <ContentSection flip cubeSpeed={0.22}>
    <h2 class="neon-heading">43 QUINTILLION STATES</h2>
    <!-- ... -->
  </ContentSection>

  <!-- Section 3: odd — cube left, text right -->
  <ContentSection cubeSpeed={0.18}>
    <h2 class="neon-heading">SINGMASTER NOTATION</h2>
    <!-- ... -->
  </ContentSection>

  <!-- Section 4: even — text left, cube right -->
  <ContentSection flip cubeSpeed={0.08}>
    <h2 class="neon-heading">LEARN THE WHY, NOT JUST THE HOW</h2>
    <!-- ... -->
    <PlayButton label="Start Learning" {onPlay} />
  </ContentSection>

  <ContributorsSection />
  <LandingFooter />
</div>
```

`HeadlineSection` is deleted — its content is replaced by Section 1.

---

## WebGL Context Budget

| Canvas | Component | dpr |
|---|---|---|
| Hero explosion | `ExplodingCubeScene` | [1, 2] |
| Section 1 | `SpinningCubeScene` | [1, 1.5] |
| Section 2 | `SpinningCubeScene` | [1, 1.5] |
| Section 3 | `SpinningCubeScene` | [1, 1.5] |
| Section 4 | `SpinningCubeScene` | [1, 1.5] |

5 total contexts. Most browsers allow up to 8 before recycling. Safe for desktop; on low-end mobile, use `IntersectionObserver` to pause off-screen canvases if performance issues arise (out of scope for now).

---

## Typography tokens (already in `tokens.css`)

All headings use `.neon-heading` (CSS class from global styles). Body text uses `var(--text-dim)` at `line-height: 1.65`. Sub-labels (Centers, Edges, Corners, R/L/U/D/F/B) use `color: var(--accent-b)` with `font-family: var(--font-display)`.

---

## File-by-File Change Summary

| File | Action |
|---|---|
| `SpinningCubeScene.svelte` | **Create** — lightweight canvas wrapper for section cubes |
| `SpinningSectionCube.svelte` | **Create** — time-based spin, no explode logic |
| `ContentSection.svelte` | **Create** — reusable alternating-layout section |
| `LandingPage.svelte` | Add 4 `ContentSection` instances, remove `HeadlineSection` import |
| `HeadlineSection.svelte` | **Delete** — content moved into Section 1 |

---

## Implementation Order

1. **`SpinningSectionCube.svelte`** — copy of the old `SpinningCube` logic.  
   Verify: renders a spinning cube inside a Threlte canvas.

2. **`SpinningCubeScene.svelte`** — canvas wrapper.  
   Verify: cube appears in isolation at correct size.

3. **`ContentSection.svelte`** — layout + view-timeline.  
   Verify: cube left / text right; `flip` class swaps; mobile stacks vertically.

4. **`LandingPage.svelte`** — add 4 `ContentSection` instances with content; remove `HeadlineSection`.  
   Verify: 4 sections appear sequentially; alternating layout matches the contract above.

5. **Delete `HeadlineSection.svelte`**.  
   Verify: build passes with no stale import warnings.

6. **Screenshot** via Playwright MCP — capture each of the 4 sections.
