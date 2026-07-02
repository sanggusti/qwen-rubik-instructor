import { expect, test } from '@playwright/test';
import { WALKTHROUGHS, gotoPlay, openGuideTab } from './helpers';

// 'anatomy': move-free beats, so playback timing depends only on dwell times.
const ANATOMY = WALKTHROUGHS.find((w) => w.id === 'anatomy')!;
const TRIGGER = WALKTHROUGHS.find((w) => w.id === 'trigger')!;

test('walkthrough narration and beats can be stepped deterministically', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Explore');
	await page.locator('.exp-item', { hasText: ANATOMY.title }).click();
	await expect(page.locator('.exp-counter')).toHaveText(`Beat 1 of ${ANATOMY.beats.length}`);

	// Step beats with the player controls instead of waiting out dwell timers.
	await page.locator('.exp-btn', { hasText: /^Next$/ }).click();
	await expect(page.locator('.exp-counter')).toHaveText(`Beat 2 of ${ANATOMY.beats.length}`);

	await page.locator('.exp-btn', { hasText: /^Prev$/ }).click();
	await expect(page.locator('.exp-counter')).toHaveText(`Beat 1 of ${ANATOMY.beats.length}`);

	// Stop rewinds to the first beat (the walkthrough stays selected).
	await page.locator('.exp-btn', { hasText: /^Next$/ }).click();
	await page.locator('.exp-btn', { hasText: /^Stop$/ }).click();
	await expect(page.locator('.exp-counter')).toHaveText(`Beat 1 of ${ANATOMY.beats.length}`);
});

test('Play streams narration into the stage caption and auto-advances', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Explore');
	await page.locator('.exp-item', { hasText: ANATOMY.title }).click();

	// Play collapses the dock; the caption takes over with typewriter narration.
	await page.locator('.exp-btn', { hasText: /^Play$/ }).click();
	await expect(page.locator('.stage-title')).toHaveText(ANATOMY.title);

	// The timer-driven playback advances beat by beat on its own and holds on
	// the final beat's narration.
	await expect(page.locator('.stage-body')).toContainText('corner home', { timeout: 30_000 });
});

test('a walkthrough with moves animates the demo cube', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Explore');
	await page.locator('.exp-item', { hasText: TRIGGER.title }).click();
	await expect(page.locator('.demo-window')).toBeVisible();

	// Beat 2 carries the R U R' U' moves — its chips render in the demo window.
	await page.locator('.exp-btn', { hasText: /^Next$/ }).click();
	await expect(page.locator('.exp-counter')).toHaveText(`Beat 2 of ${TRIGGER.beats.length}`);
	await expect(page.locator('.exp-move-chip').first()).toHaveText('R');
});
