import type { Locator, Page } from '@playwright/test';
import { LESSON_CATALOG } from '../src/lib/education/lesson_catalog';
import { PRACTICE_DRILLS } from '../src/lib/education/practice_drills';
import { WALKTHROUGHS } from '../src/lib/education/walkthroughs';

export { LESSON_CATALOG, PRACTICE_DRILLS, WALKTHROUGHS };

// Shape of the DEV-only hook installed by src/routes/play/+page.svelte.
// `controls` is the store's private animator binding — non-null once
// CubeMesh has mounted and keyboard/drag input is live.
interface CubeStoreHook {
	isBusy: boolean;
	isSolved: boolean;
	getState(): Record<string, string[]>;
	setMoveDuration(ms?: number): void;
	onMove(fn: () => void): () => void;
	controls: unknown;
}

declare global {
	interface Window {
		__cubeStore?: CubeStoreHook;
		__moveCount?: number;
	}
}

export type State = Record<string, string[]>;

/** Navigate to /play and wait until the cube is interactive (controls bound). */
export async function gotoPlay(page: Page): Promise<void> {
	await page.goto('/play');
	await page.waitForFunction(() => {
		const s = window.__cubeStore;
		return !!s && !!s.controls;
	});
	// Per-move counter so pressMoves can wait deterministically for each
	// quarter-turn to complete (isBusy alone can be missed between polls).
	await page.evaluate(() => {
		window.__moveCount = 0;
		window.__cubeStore!.onMove(() => {
			window.__moveCount! += 1;
		});
	});
}

/** Wait for the animation queue to drain. */
export async function settle(page: Page): Promise<void> {
	await page.waitForFunction(() => window.__cubeStore!.isBusy === false);
}

/**
 * Perform moves in app notation ("R", "R'", "M", "x") via the window keyboard
 * listener, waiting for each move's animation to complete so per-move
 * validators (lessons, drills) see them in order.
 */
export async function pressMoves(page: Page, moves: string[]): Promise<void> {
	// If focus is on a button inside the HUD modal, its keydown handler stops
	// propagation and the window-level move listener never fires — blur first.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
	for (const move of moves) {
		const before = await page.evaluate(() => window.__moveCount!);
		const letter = move[0].toLowerCase();
		await page.keyboard.press(move.endsWith("'") ? `Shift+${letter}` : letter);
		await page.waitForFunction((n) => window.__moveCount! > n, before);
	}
	await settle(page);
}

/** Open the Guide dock (if needed) and click a tab, returning its modal. */
export async function openGuideTab(
	page: Page,
	tab: 'Lessons' | 'Practice' | 'Explore' | 'Camera' | 'State' | 'Level'
): Promise<Locator> {
	// An open modal's backdrop covers the tab rail — dismiss it first.
	const close = page.locator('.modal-close');
	if (await close.isVisible()) await close.click();
	const guide = page.getByRole('button', { name: 'Guide' });
	if ((await guide.getAttribute('aria-expanded')) !== 'true') await guide.click();
	await page.locator('.hud-tab', { hasText: new RegExp(`^${tab}$`) }).click();
	return page.locator('.modal');
}

export function isSolved(page: Page): Promise<boolean> {
	return page.evaluate(() => window.__cubeStore!.isSolved);
}

export function snapshotState(page: Page): Promise<State> {
	return page.evaluate(() => window.__cubeStore!.getState());
}

/** Speed up cube animations so long sequences don't run at learner pace. */
export async function fastMoves(page: Page, ms = 20): Promise<void> {
	await page.evaluate((d) => window.__cubeStore!.setMoveDuration(d), ms);
}

export function lessonById(id: string) {
	const lesson = LESSON_CATALOG.find((l) => l.id === id);
	if (!lesson) throw new Error(`unknown lesson: ${id}`);
	return lesson;
}

export function drillById(id: string) {
	const drill = PRACTICE_DRILLS.find((d) => d.id === id);
	if (!drill) throw new Error(`unknown drill: ${id}`);
	return drill;
}
