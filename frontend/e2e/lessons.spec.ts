import { expect, test } from '@playwright/test';
import { gotoPlay, lessonById, openGuideTab, pressMoves, settle } from './helpers';

// Since the guide revamp (PR #29) the lesson runs entirely in the stage
// caption (.stage-*); the Lessons panel only lists and selects lessons.

const LESSON = lessonById('beginner-notation');

async function startLesson(page: import('@playwright/test').Page): Promise<void> {
	await gotoPlay(page);
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();
	// Selecting collapses the dock; the stage caption takes over.
	await expect(page.locator('.stage-title')).toHaveText(LESSON.title);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 1 of ${LESSON.steps.length}`);
}

test('complete a lesson end-to-end with real move validation', async ({ page }) => {
	await startLesson(page);

	// Step 1 is manual.
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();
	await expect(page.locator('.stage-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);

	// Steps 2-4 validate the learner's actual moves and auto-advance.
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);

	await pressMoves(page, LESSON.steps[2].expectedMoves!);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 4 of ${LESSON.steps.length}`);

	await pressMoves(page, LESSON.steps[3].expectedMoves!);
	await expect(page.locator('.stage-status')).toHaveText('Lesson complete ✓');
});

test('manual steps can be completed from the stage caption', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();

	// The caption offers Mark complete directly — the learner doesn't have to
	// rediscover the Lessons panel to continue.
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();
	await expect(page.locator('.stage-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);
});

test('lesson progress persists and resumes after reload', async ({ page }) => {
	await startLesson(page);
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);

	const stored = await page.evaluate((id) => localStorage.getItem(`rubik-lesson:${id}`), LESSON.id);
	expect(stored).toBeTruthy();

	await page.reload();
	await gotoPlay(page);
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);
});

test('a wrong move triggers coaching and the lesson stays completable', async ({ page }) => {
	await startLesson(page);
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();

	// Step 2 expects R; do U instead.
	await pressMoves(page, ['U']);
	await expect(page.locator('.stage-coaching-item.mistake')).toBeVisible();
	await expect(page.locator('.stage-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);

	// Recover via Back to checkpoint, then do the expected move.
	await page.locator('.stage-btn', { hasText: /^Back to checkpoint$/ }).click();
	await settle(page);
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);
});

test('Show me how opens the demo window without derailing the lesson', async ({ page }) => {
	await startLesson(page);
	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();

	await page.locator('.stage-btn', { hasText: /^Show me how$/ }).click();
	await expect(page.locator('.demo-window')).toBeVisible();
	await expect(page.locator('.demo-eyebrow')).toContainText('Show me how');
	await page.getByRole('button', { name: 'Close demo' }).click();
	await expect(page.locator('.demo-window')).toHaveCount(0);

	// The lesson still validates moves afterwards.
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);
});
