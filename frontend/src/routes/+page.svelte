<script lang="ts">
  import { goto } from '$app/navigation';
  import LandingPage from '$lib/landing/LandingPage.svelte';
</script>

<svelte:head>
  <title>Rubik Instructor — Learn to Solve the Cube with AI</title>
  <meta property="og:url" content="https://rubik-instructor.vercel.app/" />
  <link rel="canonical" href="https://rubik-instructor.vercel.app/" />
</svelte:head>

<LandingPage onPlay={() => goto('/play')} />
