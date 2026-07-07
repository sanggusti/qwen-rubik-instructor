// Footage recording tool (not a test): drives every major flow at learner
// pace while Playwright records video. Desktop companion of
// record-footage-mobile.spec.ts; modeled on record-gifs.spec.ts.
//
// Run against pre-started real-key servers (backend :8000, vite :5173):
//   RECORD_FOOTAGE=1 npx playwright test e2e/record-footage.spec.ts --project=desktop --workers=1
//
// Uncommitted: recording harness only, not part of the e2e suite.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { State } from '../src/lib/cube/state';
import { canonicalizeCenters } from '../src/lib/physical/legality';
import { SCRAMBLE, SOLUTION } from '../src/lib/landing/solve-sequence';
import { gotoPlay, lessonById, drillById, openGuideTab, pressMoves, settle } from './helpers';
import { presentFaceUntil, scanCube, scrambledState } from './physical-helpers';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAME_B64 = readFileSync(join(HERE, 'assets-qbr-frame.b64'), 'utf8').replace(/\s/g, '');

// Seeded by scratchpad/seed_member.py into backend data/footage.db.
const AUTH_TOKEN = process.env.FOOTAGE_AUTH_TOKEN ?? '';

test.skip(!process.env.RECORD_FOOTAGE, 'Footage recording tool — run with RECORD_FOOTAGE=1');

test.use({
	viewport: { width: 1920, height: 1080 },
	video: { mode: 'on', size: { width: 1920, height: 1080 } }
});

/** Smooth eased scroll of a container to `top` over `ms` — cinematic pans. */
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

// Fake camera fed by the real qbr webcam frame (hand holding a cube), same as
// record-gifs.spec.ts — copied, not imported, so that file's tests don't load.
async function installFootageCamera(page: Page): Promise<void> {
	await page.addInitScript((b64: string) => {
		const canvas = document.createElement('canvas');
		canvas.width = 640;
		canvas.height = 480;
		const ctx = canvas.getContext('2d')!;
		const RGB: Record<string, [number, number, number]> = {
			U: [242, 240, 235],
			D: [235, 205, 45],
			L: [250, 125, 35],
			R: [200, 35, 45],
			F: [40, 155, 75],
			B: [35, 90, 195]
		};
		const img = new Image();
		let cells: string[] = Array(9).fill('U');
		function draw(): void {
			if (img.complete && img.naturalWidth > 0) {
				ctx.drawImage(img, 155, 115, 482, 362, 0, 0, 640, 480);
			} else {
				ctx.fillStyle = '#1a1a1c';
				ctx.fillRect(0, 0, 640, 480);
			}
			const side = 264;
			const cell = side / 3;
			const ox = (640 - side) / 2;
			const oy = (480 - side) / 2;
			cells.forEach((c, i) => {
				const [r, g, b] = RGB[c] ?? [0, 0, 0];
				const x = ox + (i % 3) * cell + 5;
				const y = oy + Math.floor(i / 3) * cell + 5;
				ctx.fillStyle = `rgb(${r},${g},${b})`;
				ctx.beginPath();
				ctx.roundRect(x, y, cell - 10, cell - 10, 10);
				ctx.fill();
			});
		}
		img.onload = draw;
		img.src = 'data:image/jpeg;base64,' + b64;
		draw();
		let flip = false;
		setInterval(() => {
			ctx.fillStyle = flip ? '#121214' : '#141416';
			ctx.fillRect(0, 0, 2, 2);
			flip = !flip;
			if (flip) draw();
		}, 120);
		(window as unknown as Record<string, unknown>).__e2eCamera = {
			paint(next: string[]) {
				cells = next;
				draw();
			}
		};
		navigator.mediaDevices.getUserMedia = async () =>
			(canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
	}, FRAME_B64);
}

/** Seed the captured-solve session /review replays (verified real solve). */
async function seedReviewSession(page: Page): Promise<void> {
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
}

const invert = (moves: string[]): string[] =>
	[...moves].reverse().map((m) => (m.endsWith("'") ? m[0] : `${m}'`));

test('01 landing story', async ({ page }) => {
	test.setTimeout(300_000);
	await page.goto('/');
	await page.waitForSelector('.landing canvas');
	await page.waitForTimeout(3500); // hero beat

	// Pan through each story section, dwelling so the cube scrub reads.
	const stops = await page.evaluate(() => {
		const el = document.querySelector('.landing')!;
		const vh = el.clientHeight;
		const sections = Array.from(el.querySelectorAll('.content-section')) as HTMLElement[];
		const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2 - vh / 2);
		return [...centers, el.scrollHeight - vh];
	});
	for (const top of stops) {
		await tweenScroll(page, '.landing', top, 2600);
		await page.waitForTimeout(1800);
	}
	await page.waitForTimeout(1500); // leaderboard + footer beat

	// Back to the hero and into the app.
	await tweenScroll(page, '.landing', 0, 3000);
	await page.waitForTimeout(1200);
	await page.getByRole('button', { name: 'Play Me!' }).click();
	await page.waitForURL(/\/play$/);
	await page.waitForFunction(() => !!window.__cubeStore?.controls);
	await page.waitForTimeout(3000);
});

test('02 free play', async ({ page }) => {
	test.setTimeout(300_000);
	await gotoPlay(page);
	await page.waitForTimeout(2500); // controls hint beat

	// Sexy move twice and undo it — visible, deliberate turns.
	await pressMoves(page, ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'"]);
	await page.waitForTimeout(1000);
	await pressMoves(page, ['U', 'R', "U'", "R'", 'U', 'R', "U'", "R'"]);
	await page.waitForTimeout(1200);

	// Scramble, admire, reset.
	await page.keyboard.press('Space');
	await settle(page);
	await page.waitForTimeout(1800);
	await page.keyboard.press('Enter');
	await settle(page);
	await page.waitForTimeout(1800);
});

test('03 lesson with Ask Qwen', async ({ page }) => {
	test.setTimeout(300_000);
	const LESSON = lessonById('beginner-notation');
	await gotoPlay(page);
	await page.waitForTimeout(1000);
	await openGuideTab(page, 'Lessons');
	await page.waitForTimeout(1500); // browse the catalog
	await page.locator('.lsn-item', { hasText: LESSON.title }).click();
	await expect(page.locator('.stage-title')).toHaveText(LESSON.title);
	await page.waitForTimeout(2200); // read step 1

	await page.locator('.stage-btn', { hasText: /^Mark complete$/ }).click();
	await page.waitForTimeout(1500);

	// Step 2 with the demo window ("Show me how") beat.
	await page.locator('.stage-btn', { hasText: /^Show me how$/ }).click();
	await expect(page.locator('.demo-window')).toBeVisible();
	await page.waitForTimeout(3500);
	await page.getByRole('button', { name: 'Close demo' }).click();
	await pressMoves(page, LESSON.steps[1].expectedMoves!);
	await page.waitForTimeout(1200);

	// Ask Qwen mid-lesson (real narration).
	await page.getByLabel('Ask Qwen').fill('What does the R move mean?');
	await page.waitForTimeout(600);
	await page.locator('.stage-ask-btn').click();
	await expect(page.locator('.stage-answer')).not.toBeEmpty({ timeout: 60_000 });
	await page.waitForTimeout(5000); // read the answer

	await pressMoves(page, LESSON.steps[2].expectedMoves!);
	await page.waitForTimeout(800);
	await pressMoves(page, LESSON.steps[3].expectedMoves!);
	await expect(page.locator('.stage-status')).toHaveText('Lesson complete ✓');
	await page.waitForTimeout(2500);
});

test('04 practice drill', async ({ page }) => {
	test.setTimeout(300_000);
	const SEXY = drillById('sexy-move');
	await gotoPlay(page);
	await openGuideTab(page, 'Practice');
	await page.waitForTimeout(1500); // browse drills
	await page.locator('.prc-item', { hasText: SEXY.title }).click();
	await settle(page);
	await openGuideTab(page, 'Practice');
	await expect(page.locator('.prc-counter')).toHaveText(`Round 1 of ${SEXY.rounds} · Score 0`);
	await page.waitForTimeout(1500);

	await pressMoves(page, SEXY.expectedMoves!);
	await expect(page.locator('.prc-counter')).toHaveText(`Round 2 of ${SEXY.rounds} · Score 1`);
	await page.waitForTimeout(1200);
	await pressMoves(page, SEXY.expectedMoves!);
	await expect(page.locator('.prc-feedback.correct')).toContainText('Drill complete ✓');
	await page.waitForTimeout(3000);
});

test('05 Qwen solves my cube', async ({ page }) => {
	test.setTimeout(300_000);
	await gotoPlay(page);
	await pressMoves(page, ['R', 'U', 'F', 'D', "L'", 'B', 'U', "R'"]);
	await page.waitForTimeout(1000);

	await openGuideTab(page, 'Explore');
	await page.waitForTimeout(1800); // browse walkthroughs
	await page.locator('.exp-btn', { hasText: 'Solve my cube (Qwen)' }).click();

	// SSE generation streams, then the walkthrough auto-plays in the demo
	// window; let the narration breathe before applying it to the cube.
	const applyBtn = page.locator('.demo-btn', { hasText: /^Solve my cube$/ });
	await expect(applyBtn).toBeVisible({ timeout: 120_000 });
	await page.waitForTimeout(6000);
	await applyBtn.click();
	await page.waitForFunction(() => window.__cubeStore!.isSolved && !window.__cubeStore!.isBusy, undefined, {
		timeout: 120_000
	});
	await page.waitForTimeout(2500);

	// Hand off to the review canvas.
	await page.locator('.demo-btn', { hasText: 'Review session' }).click();
	await page.waitForURL('**/review');
	await page.waitForTimeout(3000);
});

test('06 camera scan', async ({ page }) => {
	test.setTimeout(300_000);
	await installFootageCamera(page);
	await gotoPlay(page);
	await page.waitForTimeout(1000);

	const target = scrambledState(42);
	await openGuideTab(page, 'Camera');
	await page.waitForTimeout(1500);
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);
	await page.waitForTimeout(2000); // linger on the adjust grid
	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');
	await page.waitForTimeout(3000); // show the loaded mirror
});

test('07 guided physical solve with checkpoint', async ({ page }) => {
	test.setTimeout(300_000);
	await installFootageCamera(page);
	await gotoPlay(page);

	const target = scrambledState(42);
	await openGuideTab(page, 'Camera');
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);
	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');
	await page.waitForTimeout(1500);

	await page.getByTestId('solve-physical').click();
	await page.waitForSelector('.stage.is-open', { timeout: 60_000 });
	await page.waitForTimeout(1500);
	const start = page.locator('.stage-btn', { hasText: 'Start →' });
	if (await start.isVisible()) await start.click();
	await page.waitForTimeout(1500);

	// Confirm two chunks at natural animation speed.
	const done = page.locator('.stage-btn', { hasText: 'I did these on my cube' });
	for (let i = 0; i < 2; i++) {
		await expect(done).toBeVisible();
		await done.click();
		await settle(page);
		await page.waitForTimeout(1200);
	}

	// Checkpoint: present two matching sides of the mirror state.
	await page.locator('.stage-btn', { hasText: 'Check my cube' }).click();
	await page.waitForFunction(() => window.__physicalStore!.verifyState === 'collecting');
	const predicted = canonicalizeCenters(
		(await page.evaluate(() => window.__cubeStore!.getState())) as State
	)!;
	await presentFaceUntil(page, predicted.F, async () =>
		page.evaluate(
			() =>
				window.__physicalStore!.verifyState !== 'collecting' ||
				document.querySelectorAll('.cam-flash.ok').length > 0
		)
	);
	await presentFaceUntil(page, predicted.U, async () =>
		page.evaluate(() => window.__physicalStore!.verifyState === 'passed')
	);
	await page.waitForTimeout(1800);
	await page.getByTestId('verify-continue').click();
	await page.waitForTimeout(1500);

	await expect(done).toBeVisible();
	await page.waitForTimeout(1500);
});

test('08 authenticated challenge run', async ({ page }) => {
	test.setTimeout(300_000);
	expect(AUTH_TOKEN, 'FOOTAGE_AUTH_TOKEN must be set (see seed_member.py)').toBeTruthy();
	await page.addInitScript((token: string) => {
		localStorage.setItem('rubik-auth-token', token);
	}, AUTH_TOKEN);
	await gotoPlay(page);
	await page.waitForTimeout(2000);

	// Capture the challenge scramble so the run can be genuinely solved.
	await page.evaluate(() => {
		const w = window as unknown as Record<string, unknown>;
		w.__scrambleMoves = null;
		(window.__cubeStore as unknown as { onScramble(fn: (m: string[]) => void): void }).onScramble(
			(m) => ((window as unknown as Record<string, unknown>).__scrambleMoves = m)
		);
	});
	await page.locator('.challenge-desktop').click();
	await page.waitForFunction(
		() => (window as unknown as Record<string, unknown>).__scrambleMoves !== null
	);
	await settle(page); // scramble animation done — the timer is running
	await page.waitForTimeout(1500);

	const scramble = (await page.evaluate(
		() => (window as unknown as Record<string, unknown>).__scrambleMoves
	)) as string[];
	await pressMoves(page, invert(scramble));

	// Confetti, then the leaderboard modal with the recorded run.
	await page.waitForSelector('.leaderboard-modal', { timeout: 30_000 });
	await expect(page.locator('.leaderboard-modal')).toContainText('sanggusti', {
		timeout: 15_000
	});
	await page.waitForTimeout(4500);
	await page.locator('.leaderboard-modal button', { hasText: 'Play Again' }).click();
	await page.waitForTimeout(1500);
});

test('09 profile, level and state panels', async ({ page }) => {
	test.setTimeout(300_000);
	await gotoPlay(page);
	await pressMoves(page, ['R', 'U', "F'", 'D']);

	await openGuideTab(page, 'Lessons'); // catalog with recommendations
	await page.waitForTimeout(2500);
	await openGuideTab(page, 'Level');
	await page.waitForTimeout(1800);
	await page.locator('.exp-btn', { hasText: 'Intermediate' }).click();
	await page.waitForTimeout(1200);
	await openGuideTab(page, 'Level');
	await page.locator('.exp-btn', { hasText: 'Newbie' }).click();
	await page.waitForTimeout(1000);

	await openGuideTab(page, 'State'); // face map + move history
	await page.waitForTimeout(3500);
	await pressMoves(page, ["D'", 'F', "U'", "R'"]);
	await openGuideTab(page, 'State');
	await page.waitForTimeout(3000);
});

test('10 review replay', async ({ page }) => {
	test.setTimeout(300_000);
	await seedReviewSession(page);
	await page.goto('/review');
	await expect(page.locator('.content-section').first()).toBeVisible();
	await page.waitForTimeout(2500);

	// Auto-tour, pause, resume — then browse the footer summaries.
	await page.locator('.playback-btn', { hasText: 'Play' }).click();
	await page.waitForFunction(() => document.querySelector('.review')!.scrollTop > 600);
	await page.waitForTimeout(12_000);
	await page.locator('.playback-btn', { hasText: 'Pause' }).click();
	await page.waitForTimeout(1500);
	await page.locator('.playback-btn', { hasText: 'Resume' }).click();
	await page.waitForTimeout(12_000);
	await page.locator('.playback-btn', { hasText: 'Pause' }).click();

	await tweenScroll(
		page,
		'.review',
		await page.evaluate(() => {
			const el = document.querySelector('.review')!;
			return el.scrollHeight - el.clientHeight;
		}),
		4000
	);
	await page.waitForTimeout(3000); // coursepath + practice summaries
	await page.locator('.playback-btn', { hasText: 'Restart' }).click();
	await page.waitForTimeout(2000);
});
