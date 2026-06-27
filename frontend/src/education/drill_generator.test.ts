import { describe, it, expect } from 'vitest';
import { selectDrills, findDrill } from './drill_generator';
import type { Drill } from './practice_types';

const CATALOG: Drill[] = [
    {
        id: 'a',
        title: 'A',
        category: 'trigger',
        difficulty: 'easy',
        prompt: 'p',
        validator: { type: 'moveSequence', moves: ['R'] }
    },
    {
        id: 'b',
        title: 'B',
        category: 'algorithm',
        difficulty: 'medium',
        prompt: 'p',
        validator: { type: 'moveSequence', moves: ['U'] }
    },
    {
        id: 'c',
        title: 'C',
        category: 'solve',
        difficulty: 'easy',
        prompt: 'p',
        validator: { type: 'cubeSolved' }
    }
];

describe('drill_generator', () => {
    it('returns all drills when no filter is given', () => {
        expect(selectDrills(CATALOG)).toHaveLength(3);
    });

    it('filters by category', () => {
        const result = selectDrills(CATALOG, { category: 'solve' });
        expect(result.map((d) => d.id)).toEqual(['c']);
    });

    it('filters by difficulty', () => {
        const result = selectDrills(CATALOG, { difficulty: 'easy' });
        expect(result.map((d) => d.id)).toEqual(['a', 'c']);
    });

    it('filters by category and difficulty together', () => {
        const result = selectDrills(CATALOG, { category: 'trigger', difficulty: 'easy' });
        expect(result.map((d) => d.id)).toEqual(['a']);
    });

    it('returns an empty list when nothing matches', () => {
        expect(selectDrills(CATALOG, { category: 'trigger', difficulty: 'hard' })).toEqual([]);
    });

    it('finds a drill by id', () => {
        expect(findDrill(CATALOG, 'b')?.title).toBe('B');
    });

    it('returns undefined for an unknown id', () => {
        expect(findDrill(CATALOG, 'nope')).toBeUndefined();
    });
});
