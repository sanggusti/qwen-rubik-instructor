import type { LessonProgress } from './lesson_types';

// Minimal storage contract so progress logic can be unit-tested without a DOM.
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const KEY_PREFIX = 'rubik-lesson:';

function keyFor(lessonId: string): string {
    return KEY_PREFIX + lessonId;
}

function emptyProgress(): LessonProgress {
    return { completedStepIds: [] };
}

function defaultStorage(): StorageLike | null {
    try {
        return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    } catch {
        return null;
    }
}

export function loadProgress(
    lessonId: string,
    storage: StorageLike | null = defaultStorage()
): LessonProgress {
    if (!storage) return emptyProgress();
    let raw: string | null = null;
    try {
        raw = storage.getItem(keyFor(lessonId));
    } catch {
        return emptyProgress();
    }
    if (!raw) return emptyProgress();
    try {
        const parsed = JSON.parse(raw) as Partial<LessonProgress>;
        return {
            completedStepIds: Array.isArray(parsed.completedStepIds) ? parsed.completedStepIds : [],
            currentStepId: typeof parsed.currentStepId === 'string' ? parsed.currentStepId : undefined,
            completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined
        };
    } catch {
        return emptyProgress();
    }
}

export function saveProgress(
    lessonId: string,
    progress: LessonProgress,
    storage: StorageLike | null = defaultStorage()
): void {
    if (!storage) return;
    try {
        storage.setItem(keyFor(lessonId), JSON.stringify(progress));
    } catch {
        // Storage may be unavailable or full; progress simply isn't persisted.
    }
}

export function clearProgress(
    lessonId: string,
    storage: StorageLike | null = defaultStorage()
): void {
    if (!storage) return;
    try {
        storage.removeItem(keyFor(lessonId));
    } catch {
        // Ignore.
    }
}