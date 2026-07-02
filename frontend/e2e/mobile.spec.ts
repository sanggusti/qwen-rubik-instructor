import { expect, test } from '@playwright/test';
import { gotoPlay, isSolved, lessonById, openGuideTab, settle } from './helpers';

// Runs only in the "mobile" project (iPhone emulation — touch, coarse pointer).

const LESSON = lessonById('beginner-notation');

test('touch controls: keypad turns the cube', async ({ page }) => {
	await gotoPlay(page);

	// Touch-appropriate onboarding (no keyboard shortcuts on a phone).
	await expect(page.locator('.controls-hint')).toContainText('Keypad');

	// The Keypad quick action only exists on coarse-pointer devices.
	await page.getByRole('button', { name: 'Keypad' }).tap();
	await page.locator('.touch-move-pad .grid button', { hasText: /^R$/ }).tap();
	await settle(page);
	expect(await isSolved(page)).toBe(false);

	// Prime toggle + R undoes it.
	await page.locator('.touch-move-pad .prime').tap();
	await page.locator('.touch-move-pad .grid button', { hasText: /^R$/ }).tap();
	await settle(page);
	expect(await isSolved(page)).toBe(true);
});

test('lesson caption clears the open keypad', async ({ page }) => {
	await gotoPlay(page);
	await page.getByRole('button', { name: 'Keypad' }).tap();

	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).tap();

	// The caption lifts above the keypad so the step text and its actions
	// stay readable and tappable while the keypad is open.
	await expect(page.locator('.stage.raised')).toBeVisible();
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).tap();
	await openGuideTab(page, 'Lessons');
	await expect(page.locator('.lsn-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);
});
