// Physical-cube mode: fake-camera scan -> adjust -> loadState -> read-along
// walkthrough. The camera is stubbed with a canvas captureStream painted per
// protocol face, so the whole pipeline (stillness detection, sampling,
// anchored classification, legality, loadState) runs for real in the browser.
import { expect, test } from '@playwright/test';
import { fastMoves, gotoPlay, openGuideTab, settle } from './helpers';
import { installFakeCamera, scanCube, scrambledState } from './physical-helpers';

test('scan a physical cube, load it, and read along to solved', async ({ page }) => {
	test.setTimeout(180_000);
	await installFakeCamera(page);
	await gotoPlay(page);

	const target = scrambledState(42);

	await openGuideTab(page, 'Camera');
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);

	// The scan window is over: the camera track must be stopped (LED off) and
	// the preview unmounted.
	await expect(page.locator('[data-testid="physical-window"] video')).toHaveCount(0);

	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');

	// The mirror now holds exactly the scanned state.
	const loaded = await page.evaluate(() => window.__cubeStore!.getState());
	expect(loaded).toEqual(target);

	// Keep the ~100-move read-along quick (and easy on parallel workers).
	await fastMoves(page);

	// Generate the walkthrough (fallback narration in e2e) and read along.
	await page.getByTestId('solve-physical').click();
	await page.waitForSelector('.stage.is-open', { timeout: 60_000 });

	// Advance from the intro beat, then confirm each chunk of each stage.
	const start = page.locator('.stage-btn', { hasText: 'Start →' });
	if (await start.isVisible()) await start.click();
	const done = page.locator('.stage-btn', { hasText: 'I did these on my cube' });
	for (let i = 0; i < 60; i++) {
		if (!(await done.isVisible())) break;
		await done.click();
		await settle(page);
	}
	await page.waitForFunction(() => window.__cubeStore!.isSolved, undefined, { timeout: 30_000 });

	// The physical solve was captured for /review (same recordSolve path as
	// digital) and compiles into a scrubbable session.
	await page.goto('/review');
	await page.waitForFunction(
		() => !!(window as unknown as { __reviewCompiled?: unknown }).__reviewCompiled
	);
	expect(await page.locator('.content-section').count()).toBeGreaterThan(1);
});

test('manual entry works and loadState cancels a live challenge run', async ({ page }) => {
	await gotoPlay(page);

	// Start a (tokenless) challenge run: scramble settles -> status running.
	await page.evaluate(() => window.__challengeStore!.begin());
	await settle(page);
	await page.waitForFunction(() => window.__challengeStore!.status === 'running');

	// Load a state via the manual physical flow — anti-cheat must cancel.
	await page.evaluate(() => {
		window.__physicalStore!.beginManual();
		window.__physicalStore!.confirmAdjust();
	});
	await page.waitForFunction(() => window.__challengeStore!.status === 'idle');
	await page.waitForFunction(() => window.__physicalStore!.phase === 'ready');

	// Manual entry starts from solved, so the mirror is solved.
	expect(await page.evaluate(() => window.__cubeStore!.isSolved)).toBe(true);
	await page.evaluate(() => window.__physicalStore!.endSession());
	await page.waitForFunction(() => window.__physicalStore!.active === false);
});
