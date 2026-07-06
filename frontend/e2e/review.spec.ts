import { expect, test } from '@playwright/test';
import { fastMoves, gotoPlay, openGuideTab, pressMoves } from './helpers';

// The /review canvas replays the captured Qwen solve (real backend, fallback
// narration) as a scroll-scrubbed page: scramble → checkpoints → solved, with
// full move notation for reproducing the solve on a physical cube.

const SCRAMBLE = ['R', 'U', 'F', 'D'];

interface ReviewCompiledHook {
	fullSequence: string[];
	sections: { kind: string; title: string; moves: string[] }[];
	solvedAtEnd: boolean;
}

test('empty state points back to the play screen', async ({ page }) => {
	await page.goto('/review');
	await expect(page.getByRole('heading', { name: 'Nothing to review yet' })).toBeVisible();
	await expect(page.locator('.empty-cta')).toHaveAttribute('href', '/play');
});

test('a Qwen solve is captured and replayable on /review', async ({ page }) => {
	await gotoPlay(page);
	await fastMoves(page);
	await pressMoves(page, SCRAMBLE);

	await openGuideTab(page, 'Explore');
	await page.locator('.exp-btn', { hasText: 'Solve my cube (Qwen)' }).click();

	// Generation streams over SSE; the demo window's actions appear once done.
	const reviewBtn = page.locator('.demo-btn', { hasText: 'Review session' });
	await expect(reviewBtn).toBeVisible({ timeout: 30_000 });
	await reviewBtn.click();

	// The review page compiles the captured session (dev-only hook).
	await page.waitForURL('**/review');
	await page.waitForFunction(() => '__reviewCompiled' in window && !!window.__reviewCompiled);
	const compiled = (await page.evaluate(
		() => (window as unknown as { __reviewCompiled: ReviewCompiledHook }).__reviewCompiled
	))!;

	// Scramble → at least one checkpoint → solved, and the sequence provably
	// lands solved (compile replays it through the cube model).
	expect(compiled.sections[0].kind).toBe('scramble');
	expect(compiled.sections.at(-1)!.kind).toBe('solved');
	expect(compiled.sections.filter((s) => s.kind === 'checkpoint').length).toBeGreaterThan(0);
	expect(compiled.solvedAtEnd).toBe(true);

	// One page section per compiled section, with the scramble's notation chips
	// readable for a physical cube.
	await expect(page.locator('.content-section')).toHaveCount(compiled.sections.length);
	const scrambleChips = page.locator('.content-section').first().locator('.chip');
	await expect(scrambleChips).toHaveCount(compiled.sections[0].moves.length);

	// The summary sections sit below the replay.
	await page.locator('.review-footer').scrollIntoViewIfNeeded();
	await expect(page.getByRole('heading', { name: 'Your coursepath' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible();
});
