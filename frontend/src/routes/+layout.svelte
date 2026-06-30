<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles/tokens.css';
	import '$lib/styles/retro.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}
