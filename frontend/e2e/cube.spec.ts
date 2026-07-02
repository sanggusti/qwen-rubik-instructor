import { expect, test } from '@playwright/test';
import { fastMoves, gotoPlay, isSolved, openGuideTab, pressMoves, settle } from './helpers';

test('keyboard moves update the State panel history and solved indicator', async ({ page }) => {
	await gotoPlay(page);
	// History only records while the State panel is mounted, so open it first.
	await openGuideTab(page, 'State');
	await expect(page.locator('.solved-yes')).toHaveText('yes');

	await pressMoves(page, ['R']);
	await expect(page.locator('.history')).toHaveText('R');
	await expect(page.locator('.solved-no')).toHaveText('no');
	// The first move dismisses the controls hint.
	await expect(page.locator('.controls-hint')).toHaveCount(0);

	await pressMoves(page, ["R'"]);
	await expect(page.locator('.history')).toHaveText("R R'");
	await expect(page.locator('.solved-yes')).toHaveText('yes');
});

test('Scramble and Reset buttons work', async ({ page }) => {
	await gotoPlay(page);
	await fastMoves(page);

	await page.locator('.dock-action', { hasText: /^Scramble$/ }).click();
	await settle(page);
	expect(await isSolved(page)).toBe(false);

	await page.locator('.dock-action', { hasText: /^Reset$/ }).click();
	await settle(page);
	expect(await isSolved(page)).toBe(true);

	// Solved state is also visible to the learner in the State panel.
	await openGuideTab(page, 'State');
	await expect(page.locator('.solved-yes')).toHaveText('yes');
});

test('Enter key resets the cube', async ({ page }) => {
	await gotoPlay(page);
	await pressMoves(page, ['R', 'U']);
	expect(await isSolved(page)).toBe(false);

	await page.keyboard.press('Enter');
	await settle(page);
	expect(await isSolved(page)).toBe(true);
});
