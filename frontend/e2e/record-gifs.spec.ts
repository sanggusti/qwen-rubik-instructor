// GIF recording tool (not a test): drives the physical-cube flows with a
// fake camera whose feed is REAL webcam footage — a frame from qbr
// (github.com/kkoomen/qbr, MIT): a hand holding a cube up to a laptop camera
// — with the protocol face's sticker colors composited over the cube's face.
// Playwright records the run; scripts/make-physical-gifs.sh converts the
// videos to docs/images/*.gif with ffmpeg.
//
// Run:  RECORD_GIFS=1 npx playwright test e2e/record-gifs.spec.ts --project=desktop
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { State } from '../src/lib/cube/state';
import { canonicalizeCenters } from '../src/lib/physical/legality';
import { gotoPlay, openGuideTab, settle } from './helpers';
import { presentFaceUntil, scanCube, scrambledState } from './physical-helpers';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAME_B64 = readFileSync(join(HERE, 'assets-qbr-frame.b64'), 'utf8').replace(/\s/g, '');

test.skip(!process.env.RECORD_GIFS, 'GIF recording tool — run with RECORD_GIFS=1');

test.use({
	viewport: { width: 1280, height: 720 },
	video: { mode: 'on', size: { width: 1280, height: 720 } }
});

// Fake camera fed by the real qbr webcam frame, zoomed so the cube's face
// fills the sampler's central grid; paint(cells) recolors the 9 stickers.
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
				// 800px qbr frame: cube-face center ~(396,296), side ~199px.
				// Zoom so the face fills the central 264px sampling grid.
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
		// Keep video frames flowing while visually still (sub-threshold toggle).
		let flip = false;
		setInterval(() => {
			ctx.fillStyle = flip ? '#121214' : '#141416';
			ctx.fillRect(0, 0, 2, 2);
			flip = !flip;
			// Redraw stickers occasionally in case the image finished late.
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

test('record: scan a real cube into the app', async ({ page }) => {
	test.setTimeout(240_000);
	await installFootageCamera(page);
	await gotoPlay(page);
	await page.waitForTimeout(1000);

	const target = scrambledState(42);
	await openGuideTab(page, 'Camera');
	await page.waitForTimeout(1200);
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);
	await page.waitForTimeout(1500); // linger on the adjust grid
	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');
	await page.waitForTimeout(2500); // show the loaded mirror
});

test('record: guided solve with a checkpoint', async ({ page }) => {
	test.setTimeout(240_000);
	await installFootageCamera(page);
	const t0 = Date.now();
	await gotoPlay(page);

	const target = scrambledState(42);
	await openGuideTab(page, 'Camera');
	await page.getByTestId('start-scan').click();
	await scanCube(page, target);
	await page.getByTestId('confirm-adjust').click();
	await page.waitForFunction(() => window.__physicalStore?.phase === 'ready');

	// Everything before this point is trimmed from the GIF.
	writeFileSync(join(HERE, '..', 'test-results', 'gif2-offset.txt'), String((Date.now() - t0) / 1000));

	await page.getByTestId('solve-physical').click();
	await page.waitForSelector('.stage.is-open', { timeout: 60_000 });
	await page.waitForTimeout(1200);
	const start = page.locator('.stage-btn', { hasText: 'Start →' });
	if (await start.isVisible()) await start.click();
	await page.waitForTimeout(1200);

	// Confirm two chunks at natural animation speed.
	const done = page.locator('.stage-btn', { hasText: 'I did these on my cube' });
	for (let i = 0; i < 2; i++) {
		await expect(done).toBeVisible();
		await done.click();
		await settle(page);
		await page.waitForTimeout(900);
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
	await page.waitForTimeout(1500);
	await page.getByTestId('verify-continue').click();
	await page.waitForTimeout(1500);

	// Bonus beat for the ending: the next chunk is on screen.
	await expect(done).toBeVisible();
	await page.waitForTimeout(1000);
});
