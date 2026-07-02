import { expect, test } from '@playwright/test';
import { fastMoves, gotoPlay, openGuideTab, pressMoves } from './helpers';

// Real-Qwen smoke, excluded by default (see grepInvert in playwright.config.ts).
// Run with E2E_LIVE=1 against a manually started keyed backend:
//   cd backend && .venv/bin/uvicorn main:app --port 8000   # reads repo-root .env
//   E2E_LIVE=1 npx playwright test e2e/live.spec.ts
test('@live Qwen generates a lesson and answers a question', async ({ page }) => {
	test.setTimeout(180_000);
	await gotoPlay(page);
	await fastMoves(page);
	await pressMoves(page, ['R', 'U', 'F', 'D']);

	await openGuideTab(page, 'Lessons');
	await page.locator('.lsn-btn', { hasText: 'Lesson from my cube (Qwen)' }).click();
	await expect(page.locator('.stage-title')).toBeVisible({ timeout: 150_000 });

	await page.getByLabel('Ask Qwen').fill('What should I focus on in this step?');
	await page.locator('.stage-ask-btn').click();
	await expect(page.locator('.stage-answer')).not.toBeEmpty({ timeout: 60_000 });
	await expect(page.locator('.stage-answer')).not.toContainText("Couldn't ask:");
});
