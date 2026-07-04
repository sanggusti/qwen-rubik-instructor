<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles/tokens.css';
	import '$lib/styles/retro.css';
	import { authStore } from '$lib/auth/store.svelte';

	let { children } = $props();

	// Capture the OAuth redirect (`/play?token=<uuid>`) once, persist the token
	// and strip it from the URL so it never lands in history or gets re-adopted.
	$effect(() => {
		const url = new URL(window.location.href);
		const token = url.searchParams.get('token');
		if (url.searchParams.has('authError')) {
			url.searchParams.delete('authError');
			history.replaceState(null, '', url);
			authStore.lastError = 'Sign-in was cancelled or failed.';
		}
		if (token) {
			url.searchParams.delete('token');
			history.replaceState(null, '', url);
			void authStore.adoptToken(token);
		} else {
			void authStore.init();
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}
