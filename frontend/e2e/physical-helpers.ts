// Shared harness for physical-cube specs: a fake camera (canvas
// captureStream) the tests paint cube faces onto, plus the scan-flow driver.
import { expect, type Page } from '@playwright/test';
import { applyMove, solvedState } from '../src/lib/cube/state';
import type { FaceKey, State } from '../src/lib/cube/state';

declare global {
	interface Window {
		__physicalStore?: {
			active: boolean;
			phase: string;
			faceIndex: number;
			verifyState: string;
			verifyHint: string | null;
			beginManual(): void;
			confirmAdjust(): void;
			endSession(): void;
		};
		__challengeStore?: { status: string; begin(): void };
		__e2eCamera?: { paint(cells: string[]): void };
	}
}

export const SCAN_ORDER: FaceKey[] = ['F', 'R', 'B', 'L', 'U', 'D'];
// A front camera's raw frame is the horizontal mirror of what the user sees,
// and the store un-mirrors samples — so the stub paints mirrored columns.
export const MIRROR = [2, 1, 0, 5, 4, 3, 8, 7, 6];

/** Deterministic scramble (mulberry32) so tests know the exact state. */
export function scrambledState(seed: number): State {
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

/** Installs the fake camera; call BEFORE page.goto. */
export async function installFakeCamera(page: Page): Promise<void> {
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

/** Present one face to the fake camera (viewer-order cells; mirrors for the stub). */
export async function presentFace(page: Page, cells: string[]): Promise<void> {
	await page.evaluate((c) => window.__e2eCamera!.paint(c), MIRROR.map((i) => cells[i]));
}

/**
 * Present a face until a condition holds — a steady-fire can land on a torn
 * mid-repaint frame and get rejected; the static canvas would then never
 * re-arm the stillness trigger, so retries re-paint (motion), like a real
 * user moving the cube.
 */
export async function presentFaceUntil(
	page: Page,
	cells: string[],
	condition: () => Promise<boolean>
): Promise<void> {
	let ok = false;
	for (let attempt = 0; attempt < 4 && !ok; attempt++) {
		await presentFace(page, cells);
		const deadline = Date.now() + 6_000;
		while (Date.now() < deadline && !ok) {
			ok = await condition();
			if (!ok) await page.waitForTimeout(250);
		}
	}
	expect(ok, 'face capture registered').toBe(true);
}

/** Drive the full 6-face scan for `target`; leaves the store in `adjust`. */
export async function scanCube(page: Page, target: State): Promise<void> {
	await page.waitForFunction(() => window.__physicalStore?.phase === 'scanning');
	for (let k = 0; k < SCAN_ORDER.length; k++) {
		const count = k + 1;
		await presentFaceUntil(page, target[SCAN_ORDER[k]], async () =>
			page.evaluate(
				([c]) =>
					window.__physicalStore!.faceIndex >= c || window.__physicalStore!.phase === 'adjust',
				[count] as const
			)
		);
	}
	await page.waitForFunction(() => window.__physicalStore?.phase === 'adjust');
}
