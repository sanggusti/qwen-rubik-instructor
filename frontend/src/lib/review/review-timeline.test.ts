import { describe, expect, it } from 'vitest';

import { buildReviewTimeline, type ReviewMeasurements } from './review-timeline';

// A page like the real one: intro, then scramble + three checkpoints + solved.
const M: ReviewMeasurements = {
    introEnd: 0.1,
    sectionCenters: [0.22, 0.4, 0.58, 0.76, 0.9],
    sides: [1, -1, 1, -1, 1]
};
// Cumulative end move index per section (solved repeats the total).
const ENDS = [8, 30, 60, 100, 100];
const TOTAL = 100;
const X_AMP = 2.2;

function sweep(count = 1000): number[] {
    return Array.from({ length: count + 1 }, (_, i) => i / count);
}

describe('buildReviewTimeline', () => {
    const timeline = buildReviewTimeline(M, X_AMP, ENDS);

    it('starts at zero and holds through the intro', () => {
        expect(timeline.pose(0).moveT).toBe(0);
        expect(timeline.pose(M.introEnd).moveT).toBe(0);
        expect(timeline.pose(0).x).toBe(0);
    });

    it('is monotonically non-decreasing across the page', () => {
        let prev = -1;
        for (const p of sweep()) {
            const t = timeline.pose(p).moveT;
            expect(t).toBeGreaterThanOrEqual(prev);
            prev = t;
        }
    });

    it('holds each section fully applied at its center', () => {
        M.sectionCenters.forEach((center, i) => {
            expect(timeline.pose(center).moveT).toBe(ENDS[i]);
        });
    });

    it('reaches the full sequence and reports done', () => {
        const lastCenter = M.sectionCenters[M.sectionCenters.length - 1];
        expect(timeline.pose(lastCenter).moveT).toBe(TOTAL);
        expect(timeline.pose(1).moveT).toBe(TOTAL);
        expect(timeline.pose(lastCenter).done).toBe(true);
        expect(timeline.pose(M.introEnd).done).toBe(false);
    });

    it('follows each section side and parks centered at the ends', () => {
        M.sectionCenters.forEach((center, i) => {
            expect(timeline.pose(center).x).toBeCloseTo(M.sides[i] * X_AMP, 10);
        });
        expect(timeline.pose(1).x).toBe(0);
    });

    it('fades out after the last cube section', () => {
        const lastCenter = M.sectionCenters[M.sectionCenters.length - 1];
        expect(timeline.fade(lastCenter)).toBe(1);
        expect(timeline.fade(1)).toBe(0);
    });

    it('degrades to a parked cube with no sections', () => {
        const empty = buildReviewTimeline(
            { introEnd: 0.1, sectionCenters: [], sides: [] },
            X_AMP,
            []
        );
        for (const p of [0, 0.5, 1]) {
            expect(empty.pose(p)).toEqual({ moveT: 0, x: 0, done: false });
        }
    });

    it('keeps anchors ordered even with tightly packed sections', () => {
        const tight = buildReviewTimeline(
            { introEnd: 0.1, sectionCenters: [0.101, 0.102, 0.103], sides: [1, -1, 1] },
            X_AMP,
            [5, 10, 15]
        );
        let prev = -1;
        for (const p of sweep()) {
            const t = tight.pose(p).moveT;
            expect(t).toBeGreaterThanOrEqual(prev);
            prev = t;
        }
        expect(tight.pose(1).moveT).toBe(15);
    });
});
