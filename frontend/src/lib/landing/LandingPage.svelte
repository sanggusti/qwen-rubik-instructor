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
    height: 100dvh; /* mobile browsers resize the viewport as chrome shows/hides */
    overflow-y: auto;
    overflow-x: hidden;
    scroll-snap-type: y proximity;
  }
</style>
