# Retro-Gaming Landing Page

## Context

`frontend/src/routes/+page.svelte` currently mounts the interactive cube tool
directly — there is no landing/marketing page. The product needs an entry
experience that sets the retro-gaming tone before the learner reaches the
tool: a hero with an auto-rotating 3D Rubik's cube and a "Play Me!" call to
action, a scroll-revealed explainer section, a contributors callout, and a
footer. The app is a client-only SPA (`ssr=false`, `prerender=true`, see
`frontend/src/routes/+layout.ts`) styled with hand-rolled CSS tokens (no
Tailwind) in a synthwave/outrun palette, and already ships a full Three.js/
Threlte cube renderer for the tool itself. The landing page should reuse that
rendering stack and the existing design-token system rather than introducing
new ones.

Decisions made with the user before this plan:
- **Single page, no new route.** `+page.svelte` toggles between `landing` and
  `app` view state. "Play Me!" swaps the landing content out for the existing
  `CubeCanvas`/`CubeMesh`/`HudBar` block, unchanged.
- **A second live Threlte canvas** for the headline section's cube (not a
  pinned/shared canvas), auto-rotating only, no orbit/drag/keyboard controls.
- **Contributors are a static hardcoded list**, no GitHub API call.

## Approach

### 1. View toggle in `+page.svelte`

Add `let view = $state<'landing' | 'app'>('landing')`. When `'landing'`,
render `<LandingPage onPlay={() => (view = 'app')} />`. When `'app'`, render
exactly the current body of `+page.svelte` (`CubeCanvas`/`CubeMesh`/
`TouchMovePad`/`StageCaption`/`HudBar`) unchanged — don't touch that block's
internals.

`retro.css` sets `body { overflow: hidden }` globally because the tool view
is a fixed-viewport HUD app. The landing page needs its own scroll, so
`LandingPage.svelte`'s root element gets `height: 100vh; overflow-y: auto;
scroll-snap-type: y proximity;` — it scrolls internally without touching the
shared global rule.

### 2. Decorative cube renderer (new, isolated from the tool's cube)

The tool's `CubeCanvas.svelte` + `CubeMesh.svelte` are wired to `cubeStore`/
`cubeViewStore` (singleton stores driving the real puzzle state) plus drag
and keyboard input — reusing them for a decorative spinner would either
fight over the store or drag in dead input-handling code. Instead add a
small, self-contained scene that reuses only the pure-geometry
`CubeMesh` class from `frontend/src/lib/scene/cube.ts` (`new CubeMesh()`
gives a fully-stickered solved cube `.root` group, no store coupling).

**New file `frontend/src/lib/landing/DecorativeCubeScene.svelte`:**
```svelte
<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T, useTask } from '@threlte/core';
  import { CubeMesh as Cube } from '../scene/cube';

  let { speed = 0.25 }: { speed?: number } = $props();
  const cube = new Cube();

  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }

  useTask((delta) => {
    cube.root.rotation.y += delta * speed;
    cube.root.rotation.x = Math.sin(performance.now() / 4000) * 0.18;
  });
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, 2]}>
    <T.PerspectiveCamera makeDefault fov={45} near={0.1} far={100} position={[5, 5, 7]} oncreate={(ref) => ref.lookAt(0, 0, 0)} />
    <T.AmbientLight intensity={1.2} />
    <T is={cube.root} />
  </Canvas>
</div>

<style>
  .stage { width: 100%; height: 100%; }
</style>
```
Used twice (hero, headline) with different `speed`/container sizing — no
OrbitControls, no drag, no keyboard, purely decorative. Verify the Threlte
`useTask(delta)` signature and `T.AmbientLight` usage against the `svelte`
MCP / Threlte docs before implementing (per CLAUDE.md, don't rely on
training-data memory for these APIs).

### 3. Color tokens — add a yellow accent, reuse everything else

`frontend/src/lib/styles/tokens.css` already defines magenta (`--accent-a`)
and cyan (`--accent-b`) following an `{accent}`, `{accent}-dim`,
`{accent}-bg` naming pattern. Add a third hue for the "Play Me!" button only
— don't change the existing two:

```css
/* arcade yellow — Play Me! button only */
--accent-y: #ffe066;
--accent-y-2: #ff9f1c;       /* gradient endpoint, deeper amber */
--accent-y-dim: rgba(255, 224, 102, 0.45);
--accent-y-bg: rgba(255, 224, 102, 0.12);
```

| Token | Hex | Use |
|---|---|---|
| `--bg-deep` / `--bg-mid` | `#07030d` / `#170a26` | page background (existing, reused) |
| `--accent-a` (magenta) | `#ff2bd6` | headings, idle chrome (existing, reused) |
| `--accent-b` (cyan) | `#00f0ff` | active/hover state, links (existing, reused) |
| `--accent-y` → `--accent-y-2` (new) | `#ffe066` → `#ff9f1c` | Play Me! button gradient + radar ping |
| `--panel-bg` / `--panel-border` | existing | contributor cards, headline panel use `.glass-panel` |
| `--font-display` | `'Orbitron'` | section headings, button label (existing, reused) |

### 4. Components

```
frontend/src/lib/landing/
├── LandingPage.svelte        — scrollable orchestrator, fade-in on mount
├── HeroSection.svelte        — 100vh: DecorativeCubeScene + headline + PlayButton
├── PlayButton.svelte         — yellow gradient button, radar-ping + press animation
├── HeadlineSection.svelte    — two-column: DecorativeCubeScene (left) / copy (right)
├── ContributorsSection.svelte— grid of contributor cards
├── contributors.ts           — static data: { name, role, avatarUrl, githubUrl }[]
└── LandingFooter.svelte      — links + copyright
```

**`LandingPage.svelte`** (fade-in on load, per-section scroll):
```svelte
<script lang="ts">
  import { fade } from 'svelte/transition';
  import HeroSection from './HeroSection.svelte';
  import HeadlineSection from './HeadlineSection.svelte';
  import ContributorsSection from './ContributorsSection.svelte';
  import LandingFooter from './LandingFooter.svelte';

  let { onPlay }: { onPlay: () => void } = $props();
</script>

<div class="landing" in:fade={{ duration: 600 }}>
  <HeroSection {onPlay} />
  <HeadlineSection />
  <ContributorsSection />
  <LandingFooter />
</div>

<style>
  .landing {
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    scroll-snap-type: y proximity;
  }
</style>
```

**`HeroSection.svelte`** layout (cube behind/beside copy, full viewport):
```svelte
<section class="hero" style="scroll-snap-align: start;">
  <div class="hero-cube"><DecorativeCubeScene speed={0.2} /></div>
  <div class="hero-copy">
    <h1 class="neon-heading">QWEN RUBIK INSTRUCTOR</h1>
    <p class="tagline">Learn to solve the cube — one move at a time.</p>
    <PlayButton label="Play Me!" {onPlay} />
  </div>
</section>

<style>
  .hero {
    position: relative;
    height: 100vh;
    display: grid;
    place-items: center;
    text-align: center;
  }
  .hero-cube {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.85;
  }
  .hero-copy {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
  .hero-copy h1 { font-size: clamp(28px, 6vw, 56px); letter-spacing: 0.08em; }
  .tagline { color: var(--text-dim); font-family: var(--font-mono); }
</style>
```

**`PlayButton.svelte`** — yellow retro gradient, radar/wave rings, press
animation. Rings are `::before`/`::after` pseudo-elements expanding +
fading on an infinite loop; `:active` shrinks the button for a tactile
press:
```svelte
<script lang="ts">
  let { label, onPlay }: { label: string; onPlay: () => void } = $props();
</script>

<button type="button" class="play-btn" onclick={onPlay}>
  <span class="ring"></span>
  <span class="ring ring-delay"></span>
  {label}
</button>

<style>
  .play-btn {
    position: relative;
    appearance: none;
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 18px;
    padding: 16px 40px;
    border-radius: 999px;
    border: 2px solid var(--accent-y);
    color: #2b1700;
    background: linear-gradient(135deg, var(--accent-y) 0%, var(--accent-y-2) 100%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5), 0 0 24px var(--accent-y-dim);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .play-btn:hover {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 36px var(--accent-y-dim);
  }
  .play-btn:active {
    transform: scale(0.94);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), 0 0 14px var(--accent-y-dim);
  }
  .ring {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 2px solid var(--accent-y);
    opacity: 0;
    z-index: -1;
    animation: radar-ping 2.2s ease-out infinite;
  }
  .ring-delay { animation-delay: 1.1s; }
  @keyframes radar-ping {
    0%   { transform: scale(1);   opacity: 0.6; }
    100% { transform: scale(1.8); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring { animation: none; opacity: 0; }
  }
</style>
```

**`HeadlineSection.svelte`** — two columns, left cube / right copy
(stack vertically on mobile):
```svelte
<section class="headline" style="scroll-snap-align: start;">
  <div class="headline-cube"><DecorativeCubeScene speed={0.12} /></div>
  <div class="headline-copy glass-panel">
    <h2 class="neon-heading">WHAT IS A RUBIK'S CUBE?</h2>
    <p>...</p>
    <h3>How to learn</h3>
    <p>...</p>
    <h3>How to solve</h3>
    <p>...</p>
  </div>
</section>

<style>
  .headline {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 48px;
    padding: 64px 48px;
  }
  .headline-cube { height: 420px; }
  .headline-copy { padding: 32px; border-radius: 18px; }
  @media (max-width: 760px) {
    .headline { grid-template-columns: 1fr; padding: 32px 20px; }
    .headline-cube { height: 280px; }
  }
</style>
```

**`ContributorsSection.svelte`** — card grid, `.glass-panel` chrome
matching `HudBar.svelte`'s existing button/panel conventions:
```svelte
<section class="contributors" style="scroll-snap-align: start;">
  <h2 class="neon-heading">CONTRIBUTORS</h2>
  <div class="grid">
    {#each contributors as c (c.name)}
      <a class="card glass-panel" href={c.githubUrl} target="_blank" rel="noreferrer">
        <img src={c.avatarUrl} alt={c.name} />
        <span class="name">{c.name}</span>
        <span class="role">{c.role}</span>
      </a>
    {/each}
  </div>
</section>
```

**`contributors.ts`**:
```ts
export interface Contributor {
  name: string;
  role: string;
  avatarUrl: string;
  githubUrl: string;
}

export const contributors: Contributor[] = [
  // { name: '...', role: '...', avatarUrl: 'https://github.com/<user>.png', githubUrl: 'https://github.com/<user>' }
];
```
Leave the array empty/commented with one example entry — the user supplies
real names; don't invent contributor identities.

**`LandingFooter.svelte`** — simple, matches `.glass-panel`/mono-font
conventions, links (GitHub repo, license) + copyright line.

### 5. Fade-in on load

Handled by `LandingPage.svelte`'s `in:fade={{ duration: 600 }}` on the root
element (Svelte's built-in `svelte/transition`, no new dependency). The
auto-rotation itself comes for free from `DecorativeCubeScene`'s `useTask`.

### 6. Responsive / mobile-friendly design

`frontend/src/app.html` already ships
`<meta name="viewport" content="width=device-width, initial-scale=1, ...">`,
so no viewport-meta change was needed. The existing codebase's only
responsive precedent was `HeadlineSection`'s single `@media (max-width:
760px)` stack-to-one-column rule and `HudBar.svelte`'s `@media (max-width:
760px)` touch-target rule — `760px` is the project's established "mobile"
breakpoint, reused here for layout changes. A second `480px` breakpoint is
used only where a phone needs a *smaller* tweak than a tablet already gets
(button padding, footer stacking, contributor card size) — not a new
convention, just a finer step under the same breakpoint family.

**Viewport height (`dvh` over `vh`).** Mobile browsers resize the viewport
as their address-bar chrome shows/hides, so a `100vh` hero/headline
section visibly jumps or clips content on scroll. Every full-viewport
section now declares `height: 100vh;` immediately followed by
`height: 100dvh;` (or `min-height` for `HeadlineSection`) — the second
declaration wins in browsers that support `dvh` and is silently ignored
(falling back to `vh`) in those that don't, so no feature query is needed:
```css
.hero {
  height: 100vh;
  height: 100dvh; /* mobile browsers resize the viewport as chrome shows/hides */
}
```
Applied to `.landing` (`LandingPage.svelte`), `.hero` (`HeroSection.svelte`),
and `.headline` (`HeadlineSection.svelte`).

**Hero legibility on portrait screens.** The decorative cube's camera is
fixed in 3D space (`position={[5, 5, 7]}`) with a vertical-locked FOV, so a
narrower/taller container (phone or tablet portrait) gives the cube less
horizontal FOV — it reads as *larger and closer*, not smaller, which
fought the heading's contrast in testing (confirmed visually at 768×1024:
the cube's bright white/orange faces sat directly behind "QWEN RUBIK
INSTRUCTOR"). Fix: dim `.hero-cube` under the `760px` breakpoint
(`opacity: 0.85` → `0.4`), and cap `.hero-copy` to `max-width: min(90vw,
640px)` with `padding: 0 20px` on `.hero` so text never touches the
viewport edge:
```css
@media (max-width: 760px) {
  .hero-cube {
    opacity: 0.4;
  }
  .hero-copy {
    gap: 14px;
  }
}
```

**Fluid type instead of fixed breakpoints for headings/body text.** Rather
than add more breakpoints, headline-scale text uses `clamp()` so it scales
continuously with viewport width:
- `.hero-copy h1`: `clamp(24px, 7vw, 56px)`
- `.tagline`: `clamp(13px, 3vw, 16px)`
- `.headline-copy h2` / `.contributors h2`: `clamp(20px, 4vw, 32px)`

**Touch targets.** `PlayButton` is already comfortably above the 44px
minimum at desktop size; under `480px` it shrinks padding/font
(`16px 40px`/`18px` → `14px 32px`/`16px`) but stays at ~44px tall — verified
by checking the rendered button height, not just eyeballing the CSS.

**Tighter spacing on small screens.**
- `HeadlineSection`: `.headline-copy` padding `32px` → `24px 20px` under
  `760px` (the section padding was already reduced there).
- `ContributorsSection`: section padding `64px 48px` → `40px 16px` and card
  width `140px` → `110px` under `480px`, so 2–3 cards fit per row instead
  of overflowing to a single narrow column.
- `LandingFooter`: switches `flex-direction: row` → `column` under `480px`
  (was already `flex-wrap`, but row-wrap left the copyright line and nav
  links awkwardly justified on a 320–375px screen) with reduced
  margin/padding to match.

**Verified breakpoints** (via the `playwright` MCP, see Verification
below): 375×667 (phone), 768×1024 (tablet portrait), 1440×900 (desktop).
The 768px check is what caught the hero contrast issue above — confirms
testing strictly at the `760px`/`480px` CSS breakpoints isn't enough; the
3D scene's apparent framing changes continuously with aspect ratio, not in
steps, so a tablet-portrait spot check was necessary even though it shares
a breakpoint with phones.

## Files touched

- **Modify** `frontend/src/routes/+page.svelte` — add `view` state, branch
  between `LandingPage` and the existing tool block.
- **Modify** `frontend/src/lib/styles/tokens.css` — add `--accent-y` /
  `--accent-y-2` / `--accent-y-dim` / `--accent-y-bg`.
- **Create** `frontend/src/lib/landing/LandingPage.svelte`
- **Create** `frontend/src/lib/landing/HeroSection.svelte`
- **Create** `frontend/src/lib/landing/PlayButton.svelte`
- **Create** `frontend/src/lib/landing/HeadlineSection.svelte`
- **Create** `frontend/src/lib/landing/ContributorsSection.svelte`
- **Create** `frontend/src/lib/landing/contributors.ts`
- **Create** `frontend/src/lib/landing/LandingFooter.svelte`
- **Create** `frontend/src/lib/landing/DecorativeCubeScene.svelte`
- **Create** `frontend/src/lib/landing/SpinningCube.svelte` — see Phase 2
  deviation note below (`useTask` must run inside a `<Canvas>` child).

Responsive follow-up modified `HeroSection.svelte`, `PlayButton.svelte`,
`HeadlineSection.svelte`, `ContributorsSection.svelte`, `LandingFooter.svelte`,
and `LandingPage.svelte` again — see §6 above and Phase 6 below. No new
files; `frontend/src/app.html`'s viewport meta tag was already correct.

Existing files explicitly **not** touched: `CubeCanvas.svelte`,
`CubeMesh.svelte`, `animator.ts`, `cube.svelte.ts` store, `retro.css`'s
global `body { overflow: hidden }` rule.

## Verification

1. Per CLAUDE.md: before implementing, call the `svelte` MCP
   `get-documentation` for any Svelte 5 rune/transition API used (`$state`,
   `svelte/transition` fade) that isn't already in this codebase's patterns.
2. After writing each `.svelte` file, run `svelte-autofixer` on it.
3. `cd frontend && npm run check` — type/template errors.
4. `npm run dev`, then use the `playwright` MCP against
   `http://localhost:5173`:
   - Confirm landing page loads with fade-in, cube auto-rotates in hero.
   - Press "Play Me!" — confirm press/scale animation, radar rings visible,
     and clicking swaps to the existing tool view (cube + HudBar) with no
     console errors.
   - Scroll down — confirm headline section (two columns, second rotating
     cube) and contributors/footer render.
   - Resize to a narrow viewport — confirm headline collapses to one column
     and rings respect `prefers-reduced-motion`.
   - Take a screenshot of the hero and headline sections for the golden path.
   - Check at minimum 375×667 (phone), 768×1024 (tablet portrait), and
     1440×900 (desktop) — the 3D scene's framing shifts continuously with
     aspect ratio, so the CSS breakpoints alone don't guarantee every size
     in between looks right; the tablet spot-check is what surfaced the
     hero contrast issue fixed in §6.
5. `npm run test` (vitest) — confirm no existing component tests regress.

## Phases & TODO checklist

All phases complete and verified (2026-06-30).

### Phase 0 — Setup
- [x] Call `svelte` MCP `get-documentation` for `svelte/transition`,
      `in-and-out`, `$state`, `$props` (per CLAUDE.md). Threlte's `useTask`
      isn't covered by this doc set — matched the existing `CubeMesh.svelte`
      usage pattern instead (elapsed-time driven, no delta param).

### Phase 1 — Tokens
- [x] Added `--accent-y`, `--accent-y-2`, `--accent-y-dim`, `--accent-y-bg`
      to `frontend/src/lib/styles/tokens.css` (additive only).

### Phase 2 — Decorative cube renderer
- [x] Created `frontend/src/lib/landing/DecorativeCubeScene.svelte`
      (reuses `CubeMesh` from `scene/cube.ts`, no store/controls coupling,
      no light — cube materials are unlit `MeshBasicMaterial`).
- [x] **Deviation found during verification:** Threlte's `useTask` throws
      `useScheduler can only be used in a child component to <Canvas>` if
      called in the same component that renders `<Canvas>`. Split the
      rotation logic into a new `frontend/src/lib/landing/SpinningCube.svelte`
      (rendered as a child inside `<Canvas>`, holds the `useTask` call),
      mirroring how `CubeMesh.svelte` is a child of `CubeCanvas.svelte`.
      `DecorativeCubeScene.svelte` now only owns `<Canvas>` + camera.
- [x] Ran `svelte-autofixer` on both files — clean.

### Phase 3 — Landing components
- [x] Created `PlayButton.svelte`, `HeroSection.svelte`,
      `HeadlineSection.svelte`, `contributors.ts` (seeded with the real
      maintainer, `sanggusti`), `ContributorsSection.svelte`,
      `LandingFooter.svelte`, `LandingPage.svelte` as specified above.
- [x] Ran `svelte-autofixer` on every file — clean.

### Phase 4 — Wire into the app
- [x] `frontend/src/routes/+page.svelte`: added
      `view = $state<'landing' | 'app'>('landing')`, branches between
      `LandingPage` and the unmodified tool block.
- [x] Confirmed `CubeCanvas.svelte`, `CubeMesh.svelte`, `animator.ts`,
      `cube.svelte.ts`, and `retro.css`'s global `overflow: hidden` rule
      are untouched.

### Phase 5 — Verification
- [x] `npm run check` — 0 errors, 0 warnings (1312 files).
- [x] `npm run dev` + `playwright` MCP: fade-in on load, hero cube
      auto-rotates, "Play Me!" radar-ping rings visible, click swaps to the
      tool view with zero console errors.
- [x] Scroll check: headline (two-column @1440px, second rotating cube),
      contributors card (real avatar), footer (GitHub/MIT License links)
      all render correctly — screenshots reviewed.
- [x] Narrow-viewport check (562px): headline collapses to one column as
      designed.
- [x] `npm run test` (vitest) — 202/202 passed, 16/16 files, no regressions.

### Phase 6 — Responsive / mobile-friendly pass (2026-06-30)
- [x] Added `100dvh` fallback (after `100vh`) to `.landing`, `.hero`,
      `.headline` so mobile address-bar chrome doesn't clip/jump content.
- [x] `HeroSection.svelte`: `padding: 0 20px` on `.hero`, `.hero-copy`
      capped to `max-width: min(90vw, 640px)`, `h1`/`tagline` switched to
      `clamp()`, and `.hero-cube` dimmed to `opacity: 0.4` under `760px`.
- [x] `PlayButton.svelte`: smaller padding/font under `480px`, still
      clears the 44px touch-target minimum.
- [x] `HeadlineSection.svelte`: `h2` switched to `clamp()`,
      `.headline-copy` padding tightened under `760px`.
- [x] `ContributorsSection.svelte`: `h2` switched to `clamp()`, section
      padding and card width reduced under `480px`.
- [x] `LandingFooter.svelte`: stacks to `flex-direction: column` under
      `480px` with reduced margin/padding.
- [x] Ran `svelte-autofixer` on all six edited files — clean.
- [x] `npm run check` — 0 errors, 0 warnings (1313 files).
- [x] `playwright` MCP check at 375×667, 768×1024, 1440×900 — zero console
      errors at every size.
- [x] **Found and fixed during verification:** at 768×1024 the hero cube's
      bright faces sat directly behind "QWEN RUBIK INSTRUCTOR", hurting
      contrast (the fixed-position 3D camera frames the cube larger on
      narrower/taller viewports). Widened the cube-dimming breakpoint from
      `480px` to the project's standard `760px` and dropped opacity to
      `0.4`; re-verified at both 375px and 768px after the fix.
- [x] `npm run test` (vitest) — 202/202 passed, no regressions.
