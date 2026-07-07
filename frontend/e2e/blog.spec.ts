import { expect, test } from '@playwright/test';

// The technical blog: landing CTA → story index → rendered articles.
// Content is bundled markdown from repo-root docs/, so these specs cover the
// glob + rewrite pipeline in a real browser without any backend dependency.

test('landing CTA leads to the blog index', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Technical blog →' }).click();
	await expect(page).toHaveURL(/\/blog$/);
	await expect(page.getByRole('heading', { name: 'THE ENGINEERING LOG' })).toBeVisible();
	// Featured card + a chapter of post cards rendered from the manifest.
	await expect(page.getByRole('link', { name: /Start here/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'The critique and the core fixes' })).toBeVisible();
});

test('an article direct-loads with lazy media and pager navigation', async ({ page }) => {
	await page.goto('/blog/architecture-and-feature-tour');
	await expect(
		page.getByRole('heading', { name: /The architecture, drawn/, level: 1 })
	).toBeVisible();
	// Doc 16 embeds ~33 screenshots/diagrams — all must be lazy.
	const firstImg = page.locator('.article-body img').first();
	await expect(firstImg).toHaveAttribute('loading', 'lazy');
	await page.getByRole('link', { name: /Next →/ }).click();
	await expect(page).toHaveURL(/\/blog\/the-final-review-canvas/);
	await page.getByRole('link', { name: '← All posts' }).click();
	await expect(page).toHaveURL(/\/blog$/);
});
