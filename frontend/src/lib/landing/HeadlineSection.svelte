<script lang="ts">
  import DecorativeCubeScene from './DecorativeCubeScene.svelte';
</script>

<section class="headline">
  <div class="headline-cube"><DecorativeCubeScene speed={0.12} /></div>
  <div class="headline-copy glass-panel">
    <h2 class="neon-heading">WHAT IS A RUBIK'S CUBE?</h2>
    <p>
      A 3×3×3 twisty puzzle with six faces, each made of nine colored
      stickers. Scrambling shuffles the stickers across all six faces;
      solving means turning the layers until every face shows one color
      again.
    </p>
    <h3>How to learn</h3>
    <p>
      Start from the cube's logical state, not memorization. Lessons break
      the solve into stages — first one face, then a layer, then the whole
      cube — introducing only the moves each stage needs.
    </p>
    <h3>How to solve</h3>
    <p>
      Each stage pairs a short sequence of moves with a narrated
      explanation of why it works, so you can recognize the pattern on your
      own cube instead of just repeating steps.
    </p>
  </div>
</section>

<style>
  .headline {
    min-height: 100vh;
    min-height: 100dvh; /* mobile browsers resize the viewport as chrome shows/hides */
    scroll-snap-align: start;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 48px;
    padding: 64px 48px;
  }
  .headline-cube {
    height: 420px;
  }
  .headline-copy {
    padding: 32px;
    border-radius: 18px;
  }
  .headline-copy h2 {
    font-size: clamp(20px, 4vw, 32px);
  }
  .headline-copy h3 {
    color: var(--accent-b);
    font-family: var(--font-display);
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-top: 20px;
  }
  .headline-copy p {
    color: var(--text-dim);
    line-height: 1.6;
  }
  @media (max-width: 760px) {
    .headline {
      grid-template-columns: 1fr;
      padding: 32px 20px;
    }
    .headline-cube {
      height: 280px;
    }
    .headline-copy {
      padding: 24px 20px;
    }
  }
</style>
