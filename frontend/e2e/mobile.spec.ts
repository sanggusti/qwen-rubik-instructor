import { expect, test } from '@playwright/test';
import { gotoPlay, isSolved, lessonById, openGuideTab, settle } from './helpers';
import { SCRAMBLE, SOLUTION } from '../src/lib/landing/solve-sequence';

// Runs only in the "mobile" project (iPhone emulation — touch, coarse pointer).

const LESSON = lessonById('beginner-notation');

test('touch controls: keypad turns the cube', async ({ page }) => {
	await gotoPlay(page);

	// Touch-appropriate onboarding (no keyboard shortcuts on a phone).
	await expect(page.locator('.controls-hint')).toContainText('Keypad');

	// The Keypad quick action only exists on coarse-pointer devices.
	await page.getByRole('button', { name: 'Keypad' }).tap();
	await page.locator('.keypad-bar .key-row button', { hasText: /^R$/ }).tap();
	await settle(page);
	expect(await isSolved(page)).toBe(false);

	// Prime toggle + R undoes it.
	await page.locator('.keypad-bar .prime-btn').tap();
	await page.locator('.keypad-bar .key-row button', { hasText: /^R$/ }).tap();
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
	await expect(page.locator('.stage-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);
});

test('the review canvas works on a phone', async ({ page }) => {
	// Seed a captured session (the landing sequence is a verified real solve)
	// instead of generating one — deterministic and fast.
	await page.goto('/review');
	await page.evaluate(
		([scramble, solution]) => {
			const stages: [string, number][] = [
				['cross', 21], ['first-layer-corners', 24], ['middle-layer', 37],
				['last-layer-cross', 5], ['ll-corner-position', 11],
				['ll-corner-orientation', 15], ['last-layer-edges', 53]
			];
			const beats = [{ text: 'Recreate the scramble.', moves: scramble, pace: 'fast' }];
			let off = 0;
			for (const [stage, len] of stages) {
				beats.push({ text: `Do the ${stage} moves.`, moves: solution.slice(off, off + len), stage } as never);
				off += len;
			}
			localStorage.setItem(
				'rubik-review-session',
				JSON.stringify({
					version: 1, startedAt: new Date().toISOString(), scrambleCount: 1,
					solve: {
						capturedAt: new Date().toISOString(), title: 'Solve my cube',
						description: 'Narrated solve', level: 'newbie', method: 'lbl', beats
					}
				})
			);
		},
		[SCRAMBLE, SOLUTION] as [string[], string[]]
	);
	await page.reload();

	// Nine sections (scramble + 7 checkpoints + solved), chips readable.
	await expect(page.locator('.content-section')).toHaveCount(9);
	await expect(page.locator('.content-section').first().locator('.chip')).toHaveCount(
		SCRAMBLE.length
	);

	// The tour plays from a tap and manual touch input is still possible after.
	await page.locator('.playback-btn', { hasText: 'Play' }).tap();
	await page.waitForFunction(() => document.querySelector('.review')!.scrollTop > 300);
	await page.locator('.playback-btn', { hasText: 'Pause' }).tap();

	// Summaries render at the bottom.
	await page.locator('.review-footer').scrollIntoViewIfNeeded();
	await expect(page.getByRole('heading', { name: 'Your coursepath' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible();
});
