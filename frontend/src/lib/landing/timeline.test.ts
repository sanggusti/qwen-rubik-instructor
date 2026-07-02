import { describe, it, expect } from 'vitest';
import { buildTimeline, type Measurements } from './timeline';

const M: Measurements = {
  heroEnd: 0.4,
  sectionCenters: [0.48, 0.56, 0.64, 0.72, 0.8, 0.88, 0.94],
  sides: [-1, 1, -1, 1, -1, 1, -1]
};

const SCRAMBLE_LEN = 8;
const SOLUTION_LEN = 166;
const tl = buildTimeline(M, 2.2, SCRAMBLE_LEN, SOLUTION_LEN);

describe('landing timeline', () => {
  it('starts solved-untouched and ends with the full sequence applied', () => {
    expect(tl.pose(0).moveT).toBe(0);
    expect(tl.pose(1).moveT).toBe(SCRAMBLE_LEN + SOLUTION_LEN);
    expect(tl.pose(1).done).toBe(true);
  });

  it('moveT is monotonically non-decreasing over the whole page', () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.002) {
      const t = tl.pose(p).moveT;
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('holds fully scrambled between the scramble and the first section', () => {
    const midHero = tl.pose(0.3).moveT; // between scrambleEnd (0.22) and solveStart
    expect(midHero).toBe(SCRAMBLE_LEN);
    expect(tl.pose(M.heroEnd).moveT).toBe(SCRAMBLE_LEN);
  });

  it('lands exactly solved at the CTA section center', () => {
    const cta = M.sectionCenters[M.sectionCenters.length - 1];
    expect(tl.pose(cta).moveT).toBe(SCRAMBLE_LEN + SOLUTION_LEN);
    expect(tl.pose(cta).done).toBe(true);
  });

  it('explosion only happens inside the hero, after the scramble', () => {
    expect(tl.pose(0.1).explode).toBe(0); // during scramble
    expect(tl.pose(0.66 * M.heroEnd).explode).toBeCloseTo(1, 5); // peak
    expect(tl.pose(M.heroEnd).explode).toBe(0); // released
    expect(tl.pose(0.6).explode).toBe(0); // deep in sections
  });

  it('fades out after the CTA and is gone before the page end', () => {
    const cta = M.sectionCenters[M.sectionCenters.length - 1];
    expect(tl.fade(0)).toBe(1);
    expect(tl.fade(cta)).toBe(1);
    expect(tl.fade(1)).toBe(0);
  });

  it('follows each section to its cube column side', () => {
    for (let i = 0; i < M.sectionCenters.length; i++) {
      expect(tl.pose(M.sectionCenters[i]).x).toBeCloseTo(M.sides[i] * 2.2, 5);
    }
    expect(tl.pose(0)).toHaveProperty('x', 0);
    expect(tl.pose(1).x).toBe(0); // parked
  });
});
