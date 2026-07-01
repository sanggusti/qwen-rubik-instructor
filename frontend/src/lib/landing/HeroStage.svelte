<script lang="ts">
  import ExplodingCubeScene from './ExplodingCubeScene.svelte';
  import PlayButton from './PlayButton.svelte';

  let { heroProgress, onPlay }: { heroProgress: number; onPlay: () => void } = $props();

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Title fades out as the explosion begins (p 0.28 → 0.50).
  const titleOpacity = $derived(1 - clamp((heroProgress - 0.28) / 0.22, 0, 1));
  // Split-view (cube left + text right) fades in during reassembly (p 0.75 → 0.95).
  const splitOpacity = $derived(clamp((heroProgress - 0.75) / 0.2, 0, 1));
</script>

<div class="hero-stage">
  <div class="hero-sticky">
    <ExplodingCubeScene explodeProgress={heroProgress} />

    <!-- Title overlay — visible at the top, fades out as explosion begins -->
    <div
      class="hero-overlay"
      style="opacity: {titleOpacity}; pointer-events: {titleOpacity > 0.05 ? 'auto' : 'none'}"
      aria-hidden={titleOpacity < 0.05}
    >
      <h1 class="neon-heading">QWEN RUBIK INSTRUCTOR</h1>
      <p class="tagline">Learn to solve the cube — one move at a time.</p>
      <PlayButton label="Play Me!" {onPlay} />
    </div>

    <!-- Split-view overlay — cube sits left (via Three.js), text appears right -->
    <div
      class="split-overlay"
      style="opacity: {splitOpacity}; pointer-events: {splitOpacity > 0.5 ? 'auto' : 'none'}"
      aria-hidden={splitOpacity < 0.05}
    >
      <div class="split-text glass-panel">
        <h2 class="neon-heading split-heading">WHAT IS A RUBIK'S CUBE?</h2>
        <p>
          A 3×3×3 twisty puzzle. Six faces, 27 cubies, 43 quintillion scrambled states — one
          solved state.
        </p>
        <p>
          Every lesson starts from logic, not memory. You learn <em>why</em> each move works, so
          you can reproduce it on any scramble.
        </p>
        <div class="split-cta">
          <PlayButton label="Start Learning" {onPlay} />
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .hero-stage {
    height: 300dvh;
  }

  .hero-sticky {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  /* Title overlay — centered, sits above the canvas */
  .hero-overlay {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    text-align: center;
    max-width: min(90vw, 640px);
    /* Smooth out single-frame opacity jumps from scroll events */
    will-change: opacity;
  }

  .hero-overlay .tagline {
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: clamp(13px, 3vw, 16px);
  }

  /* Split-view — right column holds the glass-panel text; cube is in Three.js on left */
  .split-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    padding: 0 48px;
    will-change: opacity;
  }

  .split-text {
    grid-column: 2;
    padding: 32px;
    border-radius: 18px;
  }

  .split-heading {
    font-size: clamp(18px, 3.5vw, 28px);
    margin-bottom: 12px;
  }

  .split-text p {
    color: var(--text-dim);
    line-height: 1.65;
    margin-bottom: 12px;
  }

  .split-cta {
    margin-top: 20px;
  }

  /* Reduced-motion: skip the animation entirely, show split-view by default */
  @media (prefers-reduced-motion: reduce) {
    .hero-stage {
      height: 100dvh;
    }
    .hero-overlay {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .split-overlay {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  }

  @media (max-width: 760px) {
    .split-overlay {
      grid-template-columns: 1fr;
      padding: 0 20px;
      align-items: flex-end;
      padding-bottom: 40px;
    }
    .split-text {
      grid-column: 1;
      padding: 24px 20px;
    }
    .hero-stage {
      height: 250dvh;
    }
  }
</style>
