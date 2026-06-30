import { describe, it, expect } from 'vitest';
import { loadProgress, saveProgress, clearProgress, type StorageLike } from './lesson_progress';
import type { LessonProgress } from './lesson_types';

function fakeStorage(): StorageLike & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k)! : null),
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k)
    };
}

describe('lesson progress store', () => {
    it('returns empty progress when nothing is stored', () => {
        const store = fakeStorage();
        expect(loadProgress('lesson-a', store)).toEqual({ completedStepIds: [] });
    });

    it('saves and loads progress round-trip', () => {
        const store = fakeStorage();
        const progress: LessonProgress = {
            completedStepIds: ['s1', 's2'],
            currentStepId: 's3'
        };
        saveProgress('lesson-a', progress, store);
        expect(loadProgress('lesson-a', store)).toEqual(progress);
    });

    it('namespaces progress per lesson', () => {
        const store = fakeStorage();
        saveProgress('lesson-a', { completedStepIds: ['a'] }, store);
        saveProgress('lesson-b', { completedStepIds: ['b'] }, store);
        expect(loadProgress('lesson-a', store).completedStepIds).toEqual(['a']);
        expect(loadProgress('lesson-b', store).completedStepIds).toEqual(['b']);
    });

    it('clears progress for a lesson', () => {
        const store = fakeStorage();
        saveProgress('lesson-a', { completedStepIds: ['a'] }, store);
        clearProgress('lesson-a', store);
        expect(loadProgress('lesson-a', store)).toEqual({ completedStepIds: [] });
    });

    it('falls back to empty progress on corrupt data', () => {
        const store = fakeStorage();
        store.map.set('rubik-lesson:lesson-a', '{not valid json');
        expect(loadProgress('lesson-a', store)).toEqual({ completedStepIds: [] });
    });

    it('tolerates a malformed completedStepIds field', () => {
        const store = fakeStorage();
        store.map.set('rubik-lesson:lesson-a', JSON.stringify({ completedStepIds: 'nope' }));
        expect(loadProgress('lesson-a', store).completedStepIds).toEqual([]);
    });

    it('treats a null storage as a no-op', () => {
        expect(() => saveProgress('lesson-a', { completedStepIds: [] }, null)).not.toThrow();
        expect(loadProgress('lesson-a', null)).toEqual({ completedStepIds: [] });
    });
});
