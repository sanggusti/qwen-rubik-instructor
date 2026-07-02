<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    flip = false,
    children
  }: {
    flip?: boolean;
    children: Snippet;
  } = $props();
</script>

<!-- The cube column is an empty spacer: the persistent LandingScene cube
     (fixed canvas behind the content) travels into this gap. -->
<section class="content-section" class:flip>
  <div class="cube-col" aria-hidden="true"></div>
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
