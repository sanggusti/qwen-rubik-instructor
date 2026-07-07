// Physical-cube mode: fake-camera scan -> adjust -> loadState -> read-along
// walkthrough. The camera is stubbed with a canvas captureStream painted per
// protocol face, so the whole pipeline (stillness detection, sampling,
// anchored classification, legality, loadState) runs for real in the browser.
import { expect, test, type Page } from '@playwright/test';
import { applyMove, solvedState } from '../src/lib/cube/state';
import type { FaceKey, State } from '../src/lib/cube/state';
import { fastMoves, gotoPlay, openGuideTab, settle } from './helpers';

declare global {
	interface Window {
		__physicalStore?: {
			active: boolean;
			phase: string;
			faceIndex: number;
			beginManual(): void;
			confirmAdjust(): void;
			endSession(): void;
		};
		__challengeStore?: { status: string; begin(): void };
		__e2eCamera?: { paint(cells: string[]): void };
	}
}

// Deterministic scramble (mulberry32) so the test knows the exact state.
function scrambledState(seed: number): State {
	let a = seed;
	const rnd = (): number => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
	const s = solvedState();
	for (let i = 0; i < 25; i++) applyMove(s, MOVES[Math.floor(rnd() * MOVES.length)]);
	return s;
}

const SCAN_ORDER: FaceKey[] = ['F', 'R', 'B', 'L', 'U', 'D'];
// A front camera's raw frame is the horizontal mirror of what the user sees,
// and the store un-mirrors samples — so the stub paints mirrored columns.
const MIRROR = [2, 1, 0, 5, 4, 3, 8, 7, 6];

// Installs a fake camera: getUserMedia returns a canvas captureStream and
// window.__e2eCamera.paint(cells) shows a cube face in the sampled region.
async function installFakeCamera(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 640;
		canvas.height = 480;
		const ctx = canvas.getContext('2d')!;
		const RGB: Record<string, [number, number, number]> = {
			U: [245, 245, 245],
			D: [240, 210, 40],
			L: [255, 120, 30],
			R: [200, 30, 40],
			F: [30, 160, 70],
			B: [30, 90, 200]
		};
		function paint(cells: string[]): void {
			ctx.fillStyle = '#121214';
			ctx.fillRect(0, 0, 640, 480);
			// Same geometry the sampler uses: centered square, 55% of min side.
			const side = 480 * 0.55;
			const cell = side / 3;
			const ox = (640 - side) / 2;
			const oy = (480 - side) / 2;
			cells.forEach((c, i) => {
				const [r, g, b] = RGB[c] ?? [0, 0, 0];
				ctx.fillStyle = `rgb(${r},${g},${b})`;
				ctx.fillRect(ox + (i % 3) * cell + 2, oy + Math.floor(i / 3) * cell + 2, cell - 4, cell - 4);
			});
		}
		paint(Array(9).fill('U'));
		// Keep video frames flowing while visually still: toggle one corner
		// pixel (outside the grid, far below the stillness threshold).
		let flip = false;
		setInterval(() => {
			ctx.fillStyle = flip ? '#121214' : '#141416';
			ctx.fillRect(0, 0, 2, 2);
			flip = !flip;
		}, 120);
		(window as unknown as Record<string, unknown>).__e2eCamera = { paint };
		navigator.mediaDevices.getUserMedia = async () =>
			(canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
	});
}

test('scan a physical cube, load it, and read along to solved', async ({ page }) => {
	test.setTimeout(180_000);
	await installFakeCamera(page);
	await gotoPlay(page);

	const target = scrambledState(42);

	await openGuideTab(page, 'Camera');
	await page.getByTestId('start-scan').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'scanning');

	for (let k = 0; k < SCAN_ORDER.length; k++) {
		const cells = target[SCAN_ORDER[k]];
		const mirrored = MIRROR.map((i) => cells[i]);
		// A steady-fire can land on a torn mid-repaint frame and get rejected;
		// the static canvas would then never re-arm the stillness trigger. Real
		// users move the cube — the harness re-paints (motion) and retries.
		let advanced = false;
		for (let attempt = 0; attempt < 4 && !advanced; attempt++) {
			await page.evaluate((c) => window.__e2eCamera!.paint(c), mirrored);
			advanced = await page
				.waitForFunction(
					([count]) =>
						window.__physicalStore!.faceIndex >= count ||
						window.__physicalStore!.phase === 'adjust',
					[k + 1] as const,
					{ timeout: 6_000 }
				)
				.then(
					() => true,
					() => false
				);
		}
		expect(advanced, `face ${SCAN_ORDER[k]} captured`).toBe(true);
	}

	await page.waitForFunction(() => window.__physicalStore?.phase === 'adjust');
	// The scan window is over: the camera track must be stopped (LED off) and
	// the preview unmounted.
	await expect(page.locator('[data-testid="physical-window"] video')).toHaveCount(0);

	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');

	// The mirror now holds exactly the scanned state.
	const loaded = await page.evaluate(() => window.__cubeStore!.getState());
	expect(loaded).toEqual(target);

	// Keep the ~100-move read-along quick (and easy on parallel workers).
	await fastMoves(page);

	// Generate the walkthrough (fallback narration in e2e) and read along.
	await page.getByTestId('solve-physical').click();
	await page.waitForSelector('.stage.is-open', { timeout: 60_000 });

	// Advance from the intro beat, then confirm each stage's moves.
	const start = page.locator('.stage-btn', { hasText: 'Start →' });
	if (await start.isVisible()) await start.click();
	const done = page.locator('.stage-btn', { hasText: 'I did these on my cube' });
	for (let i = 0; i < 12; i++) {
		if (!(await done.isVisible())) break;
		await done.click();
		await settle(page);
	}
	await page.waitForFunction(() => window.__cubeStore!.isSolved, undefined, { timeout: 30_000 });
});

test('manual entry works and loadState cancels a live challenge run', async ({ page }) => {
	await gotoPlay(page);

	// Start a (tokenless) challenge run: scramble settles -> status running.
	await page.evaluate(() => window.__challengeStore!.begin());
	await settle(page);
	await page.waitForFunction(() => window.__challengeStore!.status === 'running');

	// Load a state via the manual physical flow — anti-cheat must cancel.
	await page.evaluate(() => {
		window.__physicalStore!.beginManual();
		window.__physicalStore!.confirmAdjust();
	});
	await page.waitForFunction(() => window.__challengeStore!.status === 'idle');
	await page.waitForFunction(() => window.__physicalStore!.phase === 'ready');

	// Manual entry starts from solved, so the mirror is solved.
	expect(await page.evaluate(() => window.__cubeStore!.isSolved)).toBe(true);
	await page.evaluate(() => window.__physicalStore!.endSession());
	await page.waitForFunction(() => window.__physicalStore!.active === false);
});
