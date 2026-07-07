<script lang="ts">
	import { prevNext } from '$lib/blog/manifest';
	import { readingTime, renderPost } from '$lib/blog/render';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const post = $derived(data.post);
	const html = $derived(renderPost(data.md, post.slug));
	const minutes = $derived(readingTime(data.md));
	const nav = $derived(prevNext(post.slug));

	function formatDate(iso: string): string {
		return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{post.title} — Rubik Instructor</title>
	<meta name="description" content={post.blurb} />
</svelte:head>

<div class="page">
	<article class="article">
		<header>
			<a class="back" href="/blog">← All posts</a>
			<h1 class="neon-heading">{post.title}</h1>
			<p class="byline">
				{#if post.part}Part {post.part} of 18{:else}Design note{/if}
				· {formatDate(post.date)} · {minutes} min read
			</p>
		</header>

		<!-- First-party docs checked into this repo — trusted content. -->
		<div class="article-body">{@html html}</div>

		<footer class="pager">
			{#if nav.prev}
				<a class="pager-link glass-panel" href="/blog/{nav.prev.slug}">
					<span class="pager-dir">← Previous</span>
					<span class="pager-title">{nav.prev.title}</span>
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nav.next}
				<a class="pager-link glass-panel next" href="/blog/{nav.next.slug}">
					<span class="pager-dir">Next →</span>
					<span class="pager-title">{nav.next.title}</span>
				</a>
			{/if}
		</footer>
	</article>
</div>

<style>
	/* retro.css locks html/body scroll — the page owns its scroll container. */
	.page {
		height: 100dvh;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.article {
		max-width: 760px;
		margin: 0 auto;
		padding: 48px 24px 96px;
	}

	header {
		margin-bottom: 40px;
	}

	.back {
		color: var(--accent-b);
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.06em;
	}

	.back:hover {
		text-decoration: underline;
	}

	h1 {
		margin: 20px 0 12px;
		font-size: clamp(22px, 4vw, 34px);
		line-height: 1.25;
	}

	.byline {
		margin: 0;
		color: var(--text-dim);
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.article-body {
		line-height: 1.75;
		font-size: 15.5px;
	}

	.article-body :global(h2) {
		font-family: var(--font-display);
		color: var(--accent-b);
		font-size: 1.25rem;
		letter-spacing: 0.03em;
		margin: 2.4em 0 0.8em;
	}

	.article-body :global(h3) {
		font-family: var(--font-display);
		font-size: 1rem;
		margin: 2em 0 0.6em;
	}

	.article-body :global(a) {
		color: var(--accent-b);
	}

	.article-body :global(p) {
		margin: 0 0 1.1em;
	}

	.article-body :global(img) {
		max-width: 100%;
		border-radius: 10px;
		border: 1px solid var(--panel-border);
		margin: 8px 0;
	}

	.article-body :global(blockquote) {
		margin: 1.2em 0;
		padding: 2px 18px;
		border-left: 3px solid var(--accent-a-dim);
		color: var(--text-dim);
	}

	.article-body :global(pre) {
		background: rgba(0, 0, 0, 0.45);
		border: 1px solid var(--panel-border);
		border-radius: 10px;
		padding: 14px 16px;
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.6;
	}

	.article-body :global(code) {
		font-family: var(--font-mono);
	}

	.article-body :global(:not(pre) > code) {
		background: var(--accent-b-bg);
		border-radius: 4px;
		padding: 1px 5px;
		font-size: 0.88em;
	}

	.article-body :global(table) {
		display: block;
		overflow-x: auto;
		border-collapse: collapse;
		margin: 1.2em 0;
		font-size: 13.5px;
	}

	.article-body :global(th),
	.article-body :global(td) {
		border: 1px solid var(--panel-border);
		padding: 6px 12px;
		text-align: left;
	}

	.article-body :global(th) {
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.04em;
	}

	.article-body :global(hr) {
		border: none;
		border-top: 1px solid var(--panel-border);
		margin: 2.5em 0;
	}

	/* Code tokens, mapped onto the site palette. */
	.article-body :global(.hljs-keyword),
	.article-body :global(.hljs-literal),
	.article-body :global(.hljs-built_in),
	.article-body :global(.hljs-type) {
		color: var(--accent-a);
	}

	.article-body :global(.hljs-string),
	.article-body :global(.hljs-number),
	.article-body :global(.hljs-attr),
	.article-body :global(.hljs-attribute) {
		color: var(--ok);
	}

	.article-body :global(.hljs-title),
	.article-body :global(.hljs-function),
	.article-body :global(.hljs-params) {
		color: var(--accent-b);
	}

	.article-body :global(.hljs-comment),
	.article-body :global(.hljs-meta) {
		color: var(--text-dim);
		font-style: italic;
	}

	.pager {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		margin-top: 64px;
	}

	.pager-link {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 46%;
		padding: 14px 18px;
		border-radius: 12px;
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.pager-link:hover {
		border-color: var(--accent-b-dim);
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.4),
			0 0 18px var(--accent-b-dim);
	}

	.pager-link.next {
		text-align: right;
		margin-left: auto;
	}

	.pager-dir {
		font-family: var(--font-display);
		font-size: 11px;
		color: var(--accent-b);
		letter-spacing: 0.06em;
	}

	.pager-title {
		font-size: 13px;
		color: var(--text-dim);
	}

	@media (max-width: 480px) {
		.article {
			padding: 32px 16px 64px;
		}
	}
</style>
