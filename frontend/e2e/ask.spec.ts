import { expect, test } from '@playwright/test';
import { WALKTHROUGHS, gotoPlay, lessonById, openGuideTab } from './helpers';

const LESSON = lessonById('beginner-notation');

test('the learner can ask Qwen a question mid-lesson', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();
	await expect(page.locator('.stage-title')).toHaveText(LESSON.title);

	const input = page.getByLabel('Ask Qwen');
	const askBtn = page.locator('.stage-ask-btn');

	// Empty question: submit stays disabled.
	await expect(askBtn).toBeDisabled();

	await input.fill('What does the R move mean?');
	await expect(askBtn).toBeEnabled();
	await askBtn.click();

	// Fallback mode still answers deterministically over the real backend.
	await expect(page.locator('.stage-answer')).not.toBeEmpty();
	await expect(page.locator('.stage-answer')).not.toContainText("Couldn't ask:");
});

test('the ask input is available during a walkthrough', async ({ page }) => {
	await gotoPlay(page);
	await openGuideTab(page, 'Explore');
	await page.locator('.exp-item', { hasText: WALKTHROUGHS[0].title }).click();
	// Close the modal so the caption (with the ask form) is unobstructed.
	await page.getByRole('button', { name: 'Close', exact: true }).click();

	await expect(page.locator('.stage-title')).toHaveText(WALKTHROUGHS[0].title);
	await page.getByLabel('Ask Qwen').fill('Why do centres never move?');
	await page.locator('.stage-ask-btn').click();
	await expect(page.locator('.stage-answer')).not.toBeEmpty();
	await expect(page.locator('.stage-answer')).not.toContainText("Couldn't ask:");
});
