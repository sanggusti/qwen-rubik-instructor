<script lang="ts">
  import DecorativeCubeScene from './DecorativeCubeScene.svelte';
  import PlayButton from './PlayButton.svelte';

  let { onPlay }: { onPlay: () => void } = $props();
</script>

<section class="hero">
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
    height: 100dvh; /* mobile browsers resize the viewport as chrome shows/hides */
    scroll-snap-align: start;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 0 20px;
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
    max-width: min(90vw, 640px);
  }
  .hero-copy h1 {
    font-size: clamp(24px, 7vw, 56px);
    letter-spacing: 0.08em;
  }
  .tagline {
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: clamp(13px, 3vw, 16px);
  }
  @media (max-width: 760px) {
    .hero-cube {
      opacity: 0.4; /* portrait viewports frame the cube larger/closer (narrower
        horizontal FOV at a fixed camera position) — dim it more so it
        doesn't fight the headline for contrast */
    }
    .hero-copy {
      gap: 14px;
    }
  }
</style>
