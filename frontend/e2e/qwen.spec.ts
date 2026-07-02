import { expect, test } from '@playwright/test';
import { fastMoves, gotoPlay, isSolved, openGuideTab, pressMoves, snapshotState } from './helpers';

// These flows hit the real backend over real SSE. With no DashScope key the
// narration text is the deterministic fallback, but the plan structure and
// solver moves are the production pipeline end-to-end.

const SCRAMBLE = ['R', 'U', 'F', 'D'];

test('Qwen generates a playable lesson from the current cube', async ({ page }) => {
	await gotoPlay(page);
	await fastMoves(page);
	await pressMoves(page, SCRAMBLE);

	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-btn', { hasText: 'Lesson from my cube (Qwen)' }).click();

	// On success the generated lesson is selected and the caption takes over.
	await expect(page.locator('.stage-title')).toBeVisible({ timeout: 30_000 });
	await openGuideTab(page, 'Lessons');
	const counter = page.locator('.lsn-counter');
	await expect(counter).toHaveText(/^Step 1 of \d+$/);

	// The generated plan opens with a moves-free intro step (manual validator).
	await page.locator('.lsn-btn', { hasText: /^Mark complete$/ }).click();
	await expect(counter).toHaveText(/^Step 2 of \d+$/);

	// The lesson is playable: perform this step's expected moves and auto-advance.
	const movesText = await page.locator('.lsn-moves').innerText();
	const moves = movesText.replace(/^Moves:\s*/, '').trim().split(/\s+/);
	expect(moves.length).toBeGreaterThan(0);
	await pressMoves(page, moves);
	await expect(counter).toHaveText(/^Step 3 of \d+$/);
});

test('Solve my cube (Qwen) narrates a solve and actually solves the cube', async ({ page }) => {
	await gotoPlay(page);
	await fastMoves(page);
	await pressMoves(page, SCRAMBLE);
	const scrambled = await snapshotState(page);
	expect(await isSolved(page)).toBe(false);

	await openGuideTab(page, 'Explore');
	await page.locator('.exp-btn', { hasText: 'Solve my cube (Qwen)' }).click();

	// Generation streams over SSE, then the walkthrough auto-plays with the
	// demo window offering to apply the solution to the learner's cube.
	const applyBtn = page.locator('.demo-btn', { hasText: /^Solve my cube$/ });
	await expect(applyBtn).toBeVisible({ timeout: 30_000 });
	await expect(applyBtn).toBeEnabled();

	await applyBtn.click();
	// (Don't open the State panel here — its tab deliberately ends the
	// walkthrough, which would close the demo window before the next step.)
	await page.waitForFunction(
		() => window.__cubeStore!.isSolved && !window.__cubeStore!.isBusy,
		undefined,
		{ timeout: 60_000 }
	);

	// Reset to checkpoint restores the exact pre-apply state.
	await page.locator('.demo-btn', { hasText: /^Reset to checkpoint$/ }).click();
	await page.waitForFunction(
		(expected) =>
			!window.__cubeStore!.isBusy &&
			JSON.stringify(window.__cubeStore!.getState()) === expected,
		JSON.stringify(scrambled),
		{ timeout: 60_000 }
	);
	expect(await isSolved(page)).toBe(false);
});
