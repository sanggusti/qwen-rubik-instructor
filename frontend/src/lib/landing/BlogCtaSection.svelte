<section class="content-section flip blog-cta">
	<div class="cube-col" aria-hidden="true"></div>
	<div class="text-col glass-panel">
		<h2 class="neon-heading section-heading">READ THE BUILD LOG</h2>
		<p class="intro">
			Eighteen posts on how this tutor was built — the memory, the solver, the rewrite, the
			deployment. Deterministic skeleton, generative skin.
		</p>
		<a class="cta" href="/blog">Technical blog →</a>
	</div>
</section>

<style>
	/* Grid mirrors ContentSection.svelte so the parked cube lines up. */
	.content-section {
		min-height: 60vh;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-areas: 'cube text';
		align-items: center;
		gap: 48px;
		padding: 80px 48px;
	}
	.content-section.flip {
		grid-template-areas: 'text cube';
	}
	.cube-col {
		grid-area: cube;
		height: 420px;
	}
	.text-col {
		grid-area: text;
		padding: 40px;
		border-radius: 18px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 14px;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		letter-spacing: 0.1em;
	}
	.intro {
		margin: 0;
		color: var(--text-dim);
		line-height: 1.7;
	}
	.cta {
		margin-top: 4px;
		padding: 12px 24px;
		border: 1px solid var(--accent-b-dim);
		border-radius: 10px;
		text-decoration: none;
		font-family: var(--font-display);
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--accent-b);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.cta:hover {
		border-color: var(--accent-b);
		box-shadow: 0 0 18px var(--accent-b-dim);
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
	}
</style>
