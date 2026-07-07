// Guided tracking (M2): stage checkpoints verify the physical cube against
// the mirror by presenting faces to the (fake) camera; a deviation triggers
// diff-explain with undo guidance and the recheck path recovers.
import { expect, test } from '@playwright/test';
import { applyMove, cloneState } from '../src/lib/cube/state';
import type { State } from '../src/lib/cube/state';
import { canonicalizeCenters } from '../src/lib/physical/legality';
import { fastMoves, gotoPlay, openGuideTab, settle } from './helpers';
import { installFakeCamera, presentFaceUntil, scanCube, scrambledState } from './physical-helpers';

/** The mirror state, canonicalized like a real camera observation would be. */
async function mirrorState(page: import('@playwright/test').Page): Promise<State> {
	const raw = (await page.evaluate(() => window.__cubeStore!.getState())) as State;
	const canon = canonicalizeCenters(raw);
	expect(canon).not.toBeNull();
	return canon!;
}

test('checkpoint verify passes, catches a deviation, and recovers', async ({ page }) => {
	test.setTimeout(180_000);
	await installFakeCamera(page);
	await gotoPlay(page);

	const target = scrambledState(7);
	await openGuideTab(page, 'Camera');
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);
	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');
	await fastMoves(page);

	await page.getByTestId('solve-physical').click();
	await page.waitForSelector('.stage.is-open', { timeout: 60_000 });
	const start = page.locator('.stage-btn', { hasText: 'Start →' });
	if (await start.isVisible()) await start.click();

	// Confirm the first stage chunk so the mirror has advanced.
	const done = page.locator('.stage-btn', { hasText: 'I did these on my cube' });
	await expect(done).toBeVisible();
	await done.click();
	await settle(page);

	// --- Checkpoint pass: present two matching sides -------------------------
	const check = page.locator('.stage-btn', { hasText: 'Check my cube' });
	await expect(check).toBeVisible();
	await check.click();
	await page.waitForFunction(() => window.__physicalStore!.verifyState === 'collecting');

	const predicted = await mirrorState(page);
	await presentFaceUntil(page, predicted.F, async () =>
		page.evaluate(
			() =>
				window.__physicalStore!.verifyState !== 'collecting' ||
				document.querySelectorAll('.cam-flash.ok').length > 0
		)
	);
	// Second, different side (motion between presentations re-arms stillness).
	await presentFaceUntil(page, predicted.U, async () =>
		page.evaluate(() => window.__physicalStore!.verifyState === 'passed')
	);
	await page.getByTestId('verify-continue').click();
	await page.waitForFunction(() => window.__physicalStore!.verifyState === 'idle');

	// --- Deviation: the "physical cube" has an extra U turn ------------------
	const deviated = cloneState(predicted);
	applyMove(deviated, 'U');
	const observedDeviated = canonicalizeCenters(deviated)!;

	await check.click();
	await page.waitForFunction(() => window.__physicalStore!.verifyState === 'collecting');
	await presentFaceUntil(page, observedDeviated.F, async () =>
		page.evaluate(() => window.__physicalStore!.verifyState === 'mismatch')
	);

	// Diff-explain names the undo move.
	const hint = await page.evaluate(() => window.__physicalStore!.verifyHint);
	expect(hint).toContain("U'");

	// --- Recovery: "I fixed it" and present matching sides -------------------
	await page.getByTestId('verify-recheck').click();
	await page.waitForFunction(() => window.__physicalStore!.verifyState === 'collecting');
	await presentFaceUntil(page, predicted.F, async () =>
		page.evaluate(
			() =>
				window.__physicalStore!.verifyState !== 'collecting' ||
				document.querySelectorAll('.cam-flash.ok').length > 0
		)
	);
	await presentFaceUntil(page, predicted.U, async () =>
		page.evaluate(() => window.__physicalStore!.verifyState === 'passed')
	);
	await page.getByTestId('verify-continue').click();

	// The repair ladder's last resort is available on mismatch (not clicked
	// here — it regenerates a walkthrough); its wiring is covered by the
	// re-plan store test in unit land. End the session cleanly.
	await page.evaluate(() => window.__physicalStore!.endSession());
	await page.waitForFunction(() => window.__physicalStore!.active === false);
});
