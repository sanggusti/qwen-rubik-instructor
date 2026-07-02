import { expect, test } from '@playwright/test';
import { gotoPlay, isSolved, lessonById, openGuideTab, pressMoves } from './helpers';

const LESSON = lessonById('beginner-notation');

// Simulate the backend being unreachable; the app must surface a friendly
// error and stay fully usable (all static content is client-side).
test.beforeEach(async ({ page }) => {
	await page.route('**://localhost:8000/**', (route) => route.abort());
	await page.route('**://127.0.0.1:8000/**', (route) => route.abort());
});

test('Qwen generate buttons fail gracefully when the backend is down', async ({ page }) => {
	await gotoPlay(page);

	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-btn', { hasText: 'Lesson from my cube (Qwen)' }).click();
	await expect(page.locator('.lsn-hint', { hasText: "Couldn't generate:" })).toBeVisible();

	await openGuideTab(page, 'Explore');
	await page.locator('.exp-btn', { hasText: 'Solve my cube (Qwen)' }).click();
	await expect(page.locator('.exp-hint', { hasText: "Couldn't generate:" })).toBeVisible();
});

test('asking Qwen fails gracefully when the backend is down', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();

	await page.getByLabel('Ask Qwen').fill('help?');
	await page.locator('.stage-ask-btn').click();
	await expect(page.locator('.stage-answer')).toContainText("Couldn't ask:");
});

test('the app stays playable and learnable offline', async ({ page }) => {
	await gotoPlay(page);

	// The cube still turns.
	await pressMoves(page, ['R']);
	expect(await isSolved(page)).toBe(false);

	// Static lessons still open and validate real moves.
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-btn', { hasText: /^Mark complete$/ }).click();
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await expect(page.locator('.lsn-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);
});
