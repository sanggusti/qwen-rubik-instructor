import { expect, test } from '@playwright/test';
import { gotoPlay } from './helpers';

// Fails first and loudly if headless WebGL is broken — everything else
// depends on the cube canvas mounting and binding its controls.

test('landing page renders and Play Me! opens the cube app', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Play Me!' }).click();
	await expect(page).toHaveURL(/\/play$/);
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Guide' })).toBeVisible();
	await page.waitForFunction(() => !!window.__cubeStore);
});

test('cube app is interactive when opened directly', async ({ page }) => {
	await gotoPlay(page);
	await expect(page.locator('canvas').first()).toBeVisible();
	// First-visit controls hint shows until the learner makes a move.
	await expect(page.locator('.controls-hint')).toBeVisible();
});
