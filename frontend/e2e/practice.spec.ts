import { expect, test } from '@playwright/test';
import { drillById, gotoPlay, isSolved, openGuideTab, pressMoves, settle } from './helpers';

const SEXY = drillById('sexy-move');
const SOLVE_ONE = drillById('solve-one-move');

async function startDrill(page: import('@playwright/test').Page, title: string): Promise<void> {
	await gotoPlay(page);
	await openGuideTab(page, 'Practice');
	await page.locator('.prc-item', { hasText: title }).click();
	// Selecting collapses the dock (and applies any setup moves).
	await settle(page);
	await openGuideTab(page, 'Practice');
}

test('complete a multi-round drill with scoring and best time', async ({ page }) => {
	await startDrill(page, SEXY.title);
	await expect(page.locator('.prc-counter')).toHaveText(`Round 1 of ${SEXY.rounds} · Score 0`);

	await pressMoves(page, SEXY.expectedMoves!);
	await expect(page.locator('.prc-counter')).toHaveText(`Round 2 of ${SEXY.rounds} · Score 1`);

	await pressMoves(page, SEXY.expectedMoves!);
	await expect(page.locator('.prc-feedback.correct')).toContainText(
		`Drill complete ✓ Score ${SEXY.rounds}/${SEXY.rounds}`
	);

	// Personal best persisted.
	const best = await page.evaluate((id) => localStorage.getItem(`rubik-best:${id}`), SEXY.id);
	expect(Number(best)).toBeGreaterThan(0);
});

test('a wrong move is flagged and the drill stays completable', async ({ page }) => {
	await startDrill(page, SEXY.title);

	await pressMoves(page, ['F']);
	await expect(page.locator('.prc-feedback.wrong')).toBeVisible();

	// Recover: the round completes once history ends with the expected moves.
	await pressMoves(page, SEXY.expectedMoves!);
	await expect(page.locator('.prc-counter')).toHaveText(`Round 2 of ${SEXY.rounds} · Score 1`);
});

test('a setup-based drill evaluates cubeSolved', async ({ page }) => {
	await startDrill(page, SOLVE_ONE.title);
	expect(await isSolved(page)).toBe(false);

	await pressMoves(page, SOLVE_ONE.expectedMoves!);
	await expect(page.locator('.prc-feedback.correct')).toContainText('Drill complete ✓');
	expect(await isSolved(page)).toBe(true);
});
