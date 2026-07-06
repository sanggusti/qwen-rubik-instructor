// Maps overall page scroll progress (0..1) to the persistent cube's pose:
// which move of the scramble+solution timeline it is on, where it sits
// horizontally (following the section that is on screen), how exploded it is,
// and how settled its idle spin should be. Pure math — no Three.js — so the
// choreography is unit-testable.

export interface Measurements {
  // Overall p where the hero's sticky viewport releases (scramble+explode live here).
  heroEnd: number;
  // Overall p of each content section's center, in document order.
  sectionCenters: number[];
  // Which side the cube column occupies per section: -1 = screen-left, +1 = right.
  sides: (1 | -1)[];
}

export interface CubePose {
  moveT: number; // fractional index into the full move sequence
  x: number; // world-x offset for the cube root
  explode: number; // 0..1 explosion envelope
  settle: number; // 0..1 — how locked-down the idle spin is
  done: boolean; // solution finished (CTA reached)
}

export interface Timeline {
  pose(p: number): CubePose;
  // Canvas opacity: the cube takes its bow after the CTA and fades out before
  // the contributors/footer so it never fights that content for attention.
  fade(p: number): number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

// Piecewise smoothstep interpolation through (p, x) anchor points.
export function interp(points: { p: number; x: number }[], p: number): number {
  if (p <= points[0].p) return points[0].x;
  for (let i = 1; i < points.length; i++) {
    if (p <= points[i].p) {
      const a = points[i - 1];
      const b = points[i];
      const t = smoothstep((p - a.p) / (b.p - a.p));
      return a.x + (b.x - a.x) * t;
    }
  }
  return points[points.length - 1].x;
}

export function buildTimeline(
  m: Measurements,
  xAmp: number,
  scrambleLen: number,
  solutionLen: number
): Timeline {
  const h = Math.max(m.heroEnd, 0.01);

  // Hero choreography, as fractions of the hero's scroll runway (these mirror
  // the overlay fade thresholds in HeroStage, which use heroProgress = p / h).
  const scrambleStart = 0.1 * h;
  const scrambleEnd = 0.55 * h;
  const explodePeak = 0.66 * h;
  const explodeEnd = 0.8 * h;

  const centers = m.sectionCenters;
  const last = centers.length ? centers[centers.length - 1] : 1;
  // Start solving as the first section approaches; finish exactly at the CTA
  // section's center so the cube lands solved next to "start solving".
  const solveStart = centers.length
    ? Math.max(h, centers[0] - (centers.length > 1 ? (centers[1] - centers[0]) / 2 : 0.05))
    : h;
  const solveEnd = last;

  // Horizontal waypoints: centered while scrambling, left for the split view,
  // then following each section's cube column, parking centered at the end.
  const points: { p: number; x: number }[] = [
    { p: 0, x: 0 },
    { p: scrambleEnd, x: 0 },
    { p: 0.9 * h, x: -xAmp },
    ...centers.map((p, i) => ({ p, x: (m.sides[i] ?? -1) * xAmp })),
    { p: Math.min(1, last + 0.1), x: 0 }
  ];

  return {
    pose(p: number): CubePose {
      let moveT: number;
      if (p < scrambleStart) moveT = 0;
      else if (p < scrambleEnd)
        moveT = ((p - scrambleStart) / (scrambleEnd - scrambleStart)) * scrambleLen;
      else if (p < solveStart) moveT = scrambleLen;
      else if (p < solveEnd)
        moveT = scrambleLen + ((p - solveStart) / (solveEnd - solveStart)) * solutionLen;
      else moveT = scrambleLen + solutionLen;

      const explode =
        p < scrambleEnd || p > explodeEnd
          ? 0
          : p < explodePeak
            ? smoothstep((p - scrambleEnd) / (explodePeak - scrambleEnd))
            : 1 - smoothstep((p - explodePeak) / (explodeEnd - explodePeak));

      return {
        moveT,
        x: interp(points, p),
        explode,
        settle: smoothstep((p - 0.3 * h) / (0.25 * h)),
        done: p >= solveEnd
      };
    },
    fade(p: number): number {
      const start = Math.min(solveEnd + 0.02, 0.97);
      const end = Math.min(start + 0.08, 1);
      return 1 - smoothstep((p - start) / (end - start));
    }
  };
}
