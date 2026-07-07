// Footage recording tool (not a test): key flows on the iPhone 13 layout.
// The filename ends in mobile.spec.ts so the "mobile" project picks it up.
//
//   RECORD_FOOTAGE=1 npx playwright test e2e/record-footage-mobile.spec.ts --project=mobile --workers=1
//
// Uncommitted: recording harness only, not part of the e2e suite.
import { expect, test, type Page } from '@playwright/test';
import { SCRAMBLE, SOLUTION } from '../src/lib/landing/solve-sequence';
import { gotoPlay, lessonById, openGuideTab, settle } from './helpers';

test.skip(!process.env.RECORD_FOOTAGE, 'Footage recording tool — run with RECORD_FOOTAGE=1');

// No explicit size: it defaults to the device viewport (390×664), avoiding
// gray letterboxing below the page.
test.use({
	video: { mode: 'on' }
});

/** Smooth eased scroll of a container to `top` over `ms`. */
async function tweenScroll(page: Page, selector: string, top: number, ms: number): Promise<void> {
	await page.evaluate(
		([sel, target, dur]) =>
			new Promise<void>((resolve) => {
				const el = document.querySelector(sel as string)!;
				const from = el.scrollTop;
				const t0 = performance.now();
				const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
				function step(now: number): void {
					const p = Math.min(1, (now - t0) / (dur as number));
					el.scrollTop = from + ((target as number) - from) * ease(p);
					if (p < 1) requestAnimationFrame(step);
					else resolve();
				}
				requestAnimationFrame(step);
			}),
		[selector, top, ms] as const
	);
}

test('m1 landing story on a phone', async ({ page }) => {
	test.setTimeout(300_000);
	await page.goto('/');
	await page.waitForSelector('.landing canvas');
	await page.waitForTimeout(3000);

	const stops = await page.evaluate(() => {
		const el = document.querySelector('.landing')!;
		const vh = el.clientHeight;
		const sections = Array.from(el.querySelectorAll('.content-section')) as HTMLElement[];
		const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2 - vh / 2);
		return [...centers, el.scrollHeight - vh];
	});
	for (const top of stops) {
		await tweenScroll(page, '.landing', top, 2200);
		await page.waitForTimeout(1500);
	}
	await page.waitForTimeout(1200);
	await tweenScroll(page, '.landing', 0, 2600);
	await page.waitForTimeout(1000);
	await page.getByRole('button', { name: 'Play Me!' }).tap();
	await page.waitForURL(/\/play$/);
	await page.waitForFunction(() => !!window.__cubeStore?.controls);
	await page.waitForTimeout(2500);
});

test('m2 touch keypad play', async ({ page }) => {
	test.setTimeout(300_000);
	await gotoPlay(page);
	await page.waitForTimeout(2500); // touch onboarding hint

	await page.getByRole('button', { name: 'Keypad' }).tap();
	await page.waitForTimeout(1200);

	const key = (label: string) =>
		page.locator('.keypad-bar .key-row button', { hasText: new RegExp(`^${label}$`) });

	// Sexy move from the keypad, then undo it with the prime toggle.
	for (const k of ['R', 'U']) {
		await key(k).tap();
		await settle(page);
	}
	await page.locator('.keypad-bar .prime-btn').tap();
	await page.waitForTimeout(500);
	for (const k of ['R', 'U']) {
		await key(k).tap();
		await settle(page);
	}
	await page.waitForTimeout(800);
	await page.locator('.keypad-bar .prime-btn').tap();
	await page.waitForTimeout(500);
	for (const k of ['U', 'R']) {
		await key(k).tap();
		await settle(page);
	}
	await page.locator('.keypad-bar .prime-btn').tap();
	for (const k of ['U', 'R']) {
		await key(k).tap();
		await settle(page);
	}
	await page.waitForTimeout(2000);
});

test('m3 lesson caption over the keypad', async ({ page }) => {
	test.setTimeout(300_000);
	const LESSON = lessonById('beginner-notation');
	await gotoPlay(page);
	await page.getByRole('button', { name: 'Keypad' }).tap();
	await page.waitForTimeout(1000);

	await openGuideTab(page, 'Lessons');
	await page.waitForTimeout(1500);
	await page.locator('.lsn-item', { hasText: LESSON.title }).tap();
	await expect(page.locator('.stage.raised')).toBeVisible();
	await page.waitForTimeout(2500); // read step 1 above the keypad

	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).tap();
	await expect(page.locator('.stage-counter')).toHaveText(`Step 2 of ${LESSON.steps.length}`);
	await page.waitForTimeout(1500);

	// Do step 2's expected move from the keypad (R).
	for (const move of LESSON.steps[1].expectedMoves!) {
		const prime = move.endsWith("'");
		if (prime) await page.locator('.keypad-bar .prime-btn').tap();
		await page
			.locator('.keypad-bar .key-row button', { hasText: new RegExp(`^${move[0]}$`) })
			.tap();
		await settle(page);
		if (prime) await page.locator('.keypad-bar .prime-btn').tap();
	}
	await expect(page.locator('.stage-counter')).toHaveText(`Step 3 of ${LESSON.steps.length}`);
	await page.waitForTimeout(2500);
});

test('m4 review replay on a phone', async ({ page }) => {
	test.setTimeout(300_000);
	await page.addInitScript(
		([scramble, solution]) => {
			const stages: [string, number][] = [
				['cross', 21],
				['first-layer-corners', 24],
				['middle-layer', 37],
				['last-layer-cross', 5],
				['ll-corner-position', 11],
				['ll-corner-orientation', 15],
				['last-layer-edges', 53]
			];
			const beats = [{ text: 'Recreate the scramble.', moves: scramble, pace: 'fast' }];
			let off = 0;
			for (const [stage, len] of stages) {
				beats.push({
					text: `Do the ${stage} moves.`,
					moves: solution.slice(off, off + len),
					stage
				} as never);
				off += len;
			}
			localStorage.setItem(
				'rubik-review-session',
				JSON.stringify({
					version: 1,
					startedAt: new Date().toISOString(),
					scrambleCount: 1,
					solve: {
						capturedAt: new Date().toISOString(),
						title: 'Solve my cube',
						description: 'Narrated solve',
						level: 'newbie',
						method: 'lbl',
						beats
					}
				})
			);
		},
		[SCRAMBLE, SOLUTION] as [string[], string[]]
	);
	await page.goto('/review');
	await expect(page.locator('.content-section').first()).toBeVisible();
	await page.waitForTimeout(2500);

	await page.locator('.playback-btn', { hasText: 'Play' }).tap();
	await page.waitForFunction(() => document.querySelector('.review')!.scrollTop > 400);
	await page.waitForTimeout(10_000);
	await page.locator('.playback-btn', { hasText: 'Pause' }).tap();
	await page.waitForTimeout(1200);
	await page.locator('.playback-btn', { hasText: 'Resume' }).tap();
	await page.waitForTimeout(10_000);
	await page.locator('.playback-btn', { hasText: 'Pause' }).tap();

	// Smooth pan to the footer summaries — an instant jump reads as a freeze.
	await tweenScroll(
		page,
		'.review',
		await page.evaluate(() => {
			const el = document.querySelector('.review')!;
			return el.scrollHeight - el.clientHeight;
		}),
		3500
	);
	await page.waitForTimeout(2500);
	await page.locator('.playback-btn', { hasText: 'Restart' }).tap();
	await page.waitForTimeout(2000);
});
