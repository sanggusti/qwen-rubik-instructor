<script lang="ts">
	import { chapters, posts } from '$lib/blog/manifest';

	const featured = posts.find((p) => p.featured)!;
	const research = posts.filter((p) => p.kind === 'research');
	const byChapter = chapters
		.map((chapter) => ({
			chapter,
			items: posts.filter((p) => p.chapter === chapter && !p.featured)
		}))
		.filter((c) => c.items.length > 0);

	const stats = [
		{ value: '747', label: 'backend tests' },
		{ value: '260 + 29', label: 'frontend unit + E2E' },
		{ value: '18', label: 'parts in 9 days' }
	];
</script>

<svelte:head>
	<title>Technical blog — Rubik Instructor</title>
	<meta
		name="description"
		content="The engineering log of Qwen Rubik Instructor: 18 posts on building an LLM cube tutor — deterministic skeleton, generative skin."
	/>
</svelte:head>

<div class="page">
	<div class="content">
		<header class="hero">
			<a class="back" href="/">← Home</a>
			<h1 class="neon-heading">THE ENGINEERING LOG</h1>
			<p class="thesis">
				Eighteen posts on turning a Rubik's cube prototype into a tutor that remembers you.
				The throughline: <strong>deterministic skeleton, generative skin</strong> — the cube math,
				the solver, and the curriculum are deterministic and tested; the LLM only ever writes
				<em>words</em> over a structure it cannot break.
			</p>
			<div class="stats">
				{#each stats as s (s.label)}
					<div class="stat glass-panel">
						<span class="stat-value">{s.value}</span>
						<span class="stat-label">{s.label}</span>
					</div>
				{/each}
			</div>
		</header>

		<a class="featured glass-panel" href="/blog/{featured.slug}">
			<span class="featured-tag">Start here</span>
			<span class="featured-title">{featured.title}</span>
			<span class="featured-blurb">{featured.blurb}</span>
		</a>

		{#each byChapter as group (group.chapter)}
			<section class="chapter">
				<h2 class="chapter-heading">{group.chapter}</h2>
				<div class="grid">
					{#each group.items as post, i (post.slug)}
						<a class="card glass-panel" style="--i: {i}" href="/blog/{post.slug}">
							<span class="card-part">Part {post.part}</span>
							<span class="card-title">{post.title}</span>
							<span class="card-blurb">{post.blurb}</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}

		<section class="chapter">
			<h2 class="chapter-heading">Design notes</h2>
			<div class="grid">
				{#each research as post, i (post.slug)}
					<a class="card glass-panel" style="--i: {i}" href="/blog/{post.slug}">
						<span class="card-part">Research</span>
						<span class="card-title">{post.title}</span>
						<span class="card-blurb">{post.blurb}</span>
					</a>
				{/each}
			</div>
		</section>
	</div>
</div>

<style>
	/* retro.css locks html/body scroll — the page owns its scroll container. */
	.page {
		height: 100dvh;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.content {
		max-width: 980px;
		margin: 0 auto;
		padding: 48px 24px 96px;
	}

	.hero {
		text-align: center;
		padding: 24px 0 8px;
	}

	.back {
		color: var(--accent-b);
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.06em;
		float: left;
	}

	.back:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: clamp(24px, 5vw, 40px);
		margin: 40px 0 16px;
		clear: both;
	}

	.thesis {
		max-width: 640px;
		margin: 0 auto;
		color: var(--text-dim);
		line-height: 1.7;
	}

	.thesis strong {
		color: var(--text);
	}

	.stats {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 16px;
		margin: 32px 0 8px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 150px;
		padding: 14px 22px;
		border-radius: 12px;
	}

	.stat-value {
		font-size: 26px;
		font-weight: 600;
		color: var(--text);
	}

	.stat-label {
		font-size: 11px;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.featured {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 40px 0 8px;
		padding: 26px 28px;
		border-radius: 14px;
		text-decoration: none;
		color: var(--text);
		border-color: var(--accent-a-dim);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.featured:hover {
		border-color: var(--accent-b-dim);
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.4),
			0 0 18px var(--accent-b-dim);
	}

	.featured-tag {
		font-family: var(--font-display);
		font-size: 11px;
		color: var(--accent-a);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.featured-title {
		font-family: var(--font-display);
		font-size: 19px;
		line-height: 1.35;
	}

	.featured-blurb {
		font-size: 14px;
		color: var(--text-dim);
		line-height: 1.6;
	}

	.chapter {
		margin-top: 56px;
	}

	.chapter-heading {
		font-family: var(--font-display);
		font-size: 15px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent-b);
		margin: 0 0 18px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 18px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 18px 20px;
		border-radius: 12px;
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
		animation: card-pop linear both;
		animation-timeline: view();
		animation-range: entry 0% entry 60%;
		animation-delay: calc(var(--i) * 60ms);
	}

	@keyframes card-pop {
		from {
			opacity: 0;
			scale: 0.9;
		}
		to {
			opacity: 1;
			scale: 1;
		}
	}

	.card:hover {
		border-color: var(--accent-b-dim);
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.4),
			0 0 18px var(--accent-b-dim);
	}

	.card-part {
		font-family: var(--font-display);
		font-size: 11px;
		color: var(--accent-a);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.card-title {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.4;
	}

	.card-blurb {
		font-size: 13px;
		color: var(--text-dim);
		line-height: 1.55;
	}

	@supports not (animation-timeline: view()) {
		.card {
			animation: none;
			opacity: 1;
			scale: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
			opacity: 1;
			scale: 1;
		}
	}

	@media (max-width: 480px) {
		.content {
			padding: 32px 16px 64px;
		}
	}
</style>
