<script lang="ts">
  import { goto } from '$app/navigation';
  import LandingPage from '$lib/landing/LandingPage.svelte';
</script>

<LandingPage onPlay={() => goto('/play')} />
