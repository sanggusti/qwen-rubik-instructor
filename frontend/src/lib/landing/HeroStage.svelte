<script lang="ts">
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

<!-- The cube itself lives in the page-level LandingScene canvas; this stage
     only provides the scroll runway and the text overlays. -->
<div class="hero-stage">
  <div class="hero-sticky">
    <!-- Title overlay — visible at the top, fades out as explosion begins -->
    <div
      class="hero-overlay"
      style="opacity: {titleOpacity}; pointer-events: {titleOpacity > 0.05 ? 'auto' : 'none'}"
      aria-hidden={titleOpacity < 0.05}
    >
      <p class="eyebrow">QWEN RUBIK INSTRUCTOR</p>
      <h1 class="neon-heading">They said an LLM couldn't solve a Rubik's Cube.</h1>
      <p class="tagline">We made it solve one. Then we made it teach you.</p>
      <PlayButton label="Play Me!" {onPlay} />
    </div>

    <!-- Split-view overlay — cube sits left (via Three.js), text appears right -->
    <div
      class="split-overlay"
      style="opacity: {splitOpacity}; pointer-events: {splitOpacity > 0.5 ? 'auto' : 'none'}"
      aria-hidden={splitOpacity < 0.05}
    >
      <div class="split-text glass-panel">
        <h2 class="neon-heading split-heading">THE INTERNET MOSTLY AGREED</h2>
        <p>
          Language models can't really do this. Builders tried — moves drifted, state fell
          apart, the cube "solved" itself into nonsense.
        </p>
        <ul class="receipts">
          <li>
            <a
              href="https://www.linkedin.com/posts/chapagainanusheel_tried-building-a-rubick-cube-solver-and-injected-ugcPost-7415202857299419136-OQ7I/"
              target="_blank"
              rel="noreferrer">A solver attempt that drifted out of sync with its own cube</a
            >
          </li>
          <li>
            <a href="https://news.ycombinator.com/item?id=47881036" target="_blank" rel="noreferrer"
              >Hacker News on why LLMs lose track of the state</a
            >
          </li>
          <li>
            <a
              href="https://www.linkedin.com/posts/phillip-mortimer_rubikscube-genai-share-7253491928489512961-3tpt/"
              target="_blank"
              rel="noreferrer">GenAI vs. the cube — entertaining, but not correct</a
            >
          </li>
        </ul>
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

  /* Title overlay — centered, sits above the canvas. The radial scrim keeps
     the copy readable when the cube spins behind it. */
  .hero-overlay {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    text-align: center;
    max-width: min(90vw, 720px);
    padding: 44px 56px;
    border-radius: 32px;
    background: radial-gradient(
      closest-side,
      rgba(7, 3, 13, 0.85),
      rgba(7, 3, 13, 0.55) 65%,
      transparent
    );
    /* Smooth out single-frame opacity jumps from scroll events */
    will-change: opacity;
  }

  .hero-overlay .eyebrow {
    font-family: var(--font-mono);
    font-size: clamp(11px, 2.5vw, 13px);
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent-b);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.9);
  }

  .hero-overlay h1 {
    font-size: clamp(22px, 4.5vw, 40px);
    line-height: 1.2;
  }

  .hero-overlay .tagline {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: clamp(13px, 3vw, 16px);
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.9);
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

  .receipts {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 12px;
    padding: 0;
  }

  .receipts a {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent-b);
    text-decoration: none;
  }

  .receipts a::before {
    content: '▸ ';
  }

  .receipts a:hover {
    text-shadow: 0 0 8px var(--accent-b-dim);
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
    .hero-overlay {
      padding: 32px 24px;
    }
  }
</style>
