<script lang="ts">
  import type { Snippet } from 'svelte';
  import SpinningCubeScene from './SpinningCubeScene.svelte';

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
    animation: section-reveal linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 45%;
  }

  .content-section.flip {
    grid-template-areas: 'text cube';
  }

  @keyframes section-reveal {
    from {
      opacity: 0;
      translate: 0 32px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
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

  @supports not (animation-timeline: view()) {
    .content-section {
      animation: none;
      opacity: 1;
      translate: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .content-section {
      animation: none;
      opacity: 1;
      translate: none;
    }
  }

  @media (max-width: 760px) {
    .content-section,
    .content-section.flip {
      grid-template-columns: 1fr;
      grid-template-areas: 'cube' 'text';
      gap: 24px;
      padding: 48px 20px;
    }

    .cube-col {
      height: 280px;
    }

    .text-col {
      padding: 24px 20px;
    }
  }
</style>
