// Maps /review page scroll progress (0..1) to the replay cube's pose. Simpler
// cousin of landing/timeline.ts (no hero, no explode): moveT ramps between
// sections and holds on a plateau around each section's center so the cube
// sits settled at that checkpoint while the learner reads and mirrors the
// moves on their real cube. Pure math — unit-testable.

import { interp, smoothstep } from '../landing/timeline';

export interface ReviewMeasurements {
    /** Overall p where the intro header ends and the first section approaches. */
    introEnd: number;
    /** Overall p of each cube section's center, in document order. */
    sectionCenters: number[];
    /** Side the cube column occupies per section: -1 = screen-left, +1 = right. */
    sides: (1 | -1)[];
}

export interface ReviewPose {
    moveT: number; // fractional index into fullSequence
    x: number; // world-x offset for the cube root
    done: boolean; // full sequence applied (cube is solved)
}

export interface ReviewTimeline {
    pose(p: number): ReviewPose;
    /** Canvas opacity: fades out after the last cube section, before summaries. */
    fade(p: number): number;
}

export function buildReviewTimeline(
    m: ReviewMeasurements,
    xAmp: number,
    /** Cumulative end move index per section (compile's section.endIndex). */
    sectionEndMoves: number[]
): ReviewTimeline {
    const centers = m.sectionCenters;
    const total = sectionEndMoves.length ? sectionEndMoves[sectionEndMoves.length - 1] : 0;
    const last = centers.length ? centers[centers.length - 1] : 1;

    // Hold half-width around each center: a fraction of the tighter adjacent
    // gap so plateaus never collide, floored so a hold always exists.
    const holdAt = (i: number): number => {
        const prevGap = i === 0 ? centers[0] - m.introEnd : centers[i] - centers[i - 1];
        const nextGap = i === centers.length - 1 ? 1 - centers[i] : centers[i + 1] - centers[i];
        return Math.max(0.3 * 0.5 * Math.min(prevGap, nextGap), 0.005);
    };

    const movePoints: { p: number; x: number }[] = [
        { p: 0, x: 0 },
        { p: m.introEnd, x: 0 }
    ];
    for (let i = 0; i < centers.length; i++) {
        const h = holdAt(i);
        const end = sectionEndMoves[i] ?? total;
        // Clamp keeps anchors sorted even when the hold floor outgrows a tiny gap.
        const prev = movePoints[movePoints.length - 1].p;
        const from = Math.max(centers[i] - h, prev);
        movePoints.push({ p: from, x: end });
        movePoints.push({ p: Math.max(centers[i] + h, from), x: end });
    }

    const xPoints: { p: number; x: number }[] = [
        { p: 0, x: 0 },
        { p: m.introEnd, x: 0 },
        ...centers.map((p, i) => ({ p, x: (m.sides[i] ?? -1) * xAmp })),
        { p: Math.min(1, last + 0.1), x: 0 }
    ];

    return {
        pose(p: number): ReviewPose {
            const moveT = centers.length ? interp(movePoints, p) : 0;
            return {
                moveT,
                x: centers.length ? interp(xPoints, p) : 0,
                done: total > 0 && moveT >= total
            };
        },
        fade(p: number): number {
            const start = Math.min(last + 0.02, 0.97);
            const end = Math.min(start + 0.08, 1);
            return 1 - smoothstep((p - start) / (end - start));
        }
    };
}
