// Color classification for scanned stickers.
// Strategy (see docs/research/physical-cube-camera-play.md §4.1): classify
// RELATIVELY against the six captured center stickers (the per-session
// anchors), never against absolute thresholds — this self-calibrates to the
// cube and the lighting, and survives auto-white-balance drift. Distances are
// CIEDE2000 in Lab; a k-means pass over all 54 samples refines the anchors;
// near-ties on the two known hard pairs (red/orange, white/yellow) fall back
// to hue/lightness ordering.

import type { Color, FaceKey } from '../cube/state';
import type { ClassifyResult, FaceScan, Lab } from './types';

const FACES: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B'];

// ---------------------------------------------------------------------------
// sRGB (0-255) -> CIE L*a*b* (D65 reference white)

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r);
  const gl = lin(g);
  const bl = lin(b);

  // sRGB D65 -> XYZ, normalized to the D65 white point.
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;

  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// ---------------------------------------------------------------------------
// CIEDE2000 color difference (Sharma, Wu & Dalal 2005 formulation).

export function ciede2000(c1: Lab, c2: Lab): number {
  const deg2rad = Math.PI / 180;
  const rad2deg = 180 / Math.PI;

  const C1 = Math.hypot(c1.a, c1.b);
  const C2 = Math.hypot(c2.a, c2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * c1.a;
  const a2p = (1 + G) * c2.a;
  const C1p = Math.hypot(a1p, c1.b);
  const C2p = Math.hypot(a2p, c2.b);

  const h1p = C1p === 0 ? 0 : ((Math.atan2(c1.b, a1p) * rad2deg + 360) % 360);
  const h2p = C2p === 0 ? 0 : ((Math.atan2(c2.b, a2p) * rad2deg + 360) % 360);

  const dLp = c2.L - c1.L;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * deg2rad);

  const Lbp = (c1.L + c2.L) / 2;
  const Cbp = (C1p + C2p) / 2;

  let hbp: number;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
  else hbp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * deg2rad) +
    0.24 * Math.cos(2 * hbp * deg2rad) +
    0.32 * Math.cos((3 * hbp + 6) * deg2rad) -
    0.2 * Math.cos((4 * hbp - 63) * deg2rad);

  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * deg2rad) * RC;

  return Math.sqrt(
    Math.pow(dLp / SL, 2) +
      Math.pow(dCp / SC, 2) +
      Math.pow(dHp / SH, 2) +
      RT * (dCp / SC) * (dHp / SH)
  );
}

// ---------------------------------------------------------------------------
// Classification

// Near-tie ratio below which the pair-specific heuristics kick in.
const TIE_RATIO = 1.2;

function hueAngle(c: Lab): number {
  return (Math.atan2(c.b, c.a) * 180) / Math.PI;
}

// Resolve a near-tie between two candidate faces using the physically
// reliable orderings: orange (L) sits at a higher hue angle than red (R);
// yellow (D) has far higher b* than white (U).
function breakTie(sample: Lab, first: FaceKey, second: FaceKey, anchors: Record<FaceKey, Lab>): FaceKey {
  const pair = new Set([first, second]);
  if (pair.has('R') && pair.has('L')) {
    const mid = (hueAngle(anchors.R) + hueAngle(anchors.L)) / 2;
    return hueAngle(sample) > mid === (hueAngle(anchors.L) > hueAngle(anchors.R)) ? 'L' : 'R';
  }
  if (pair.has('U') && pair.has('D')) {
    const mid = (anchors.U.b + anchors.D.b) / 2;
    return sample.b > mid ? 'D' : 'U';
  }
  return first;
}

interface Assignment {
  face: FaceKey;
  confidence: number;
}

function assign(sample: Lab, centroids: Record<FaceKey, Lab>): Assignment {
  let best: FaceKey = 'U';
  let bestD = Infinity;
  let secondFace: FaceKey = 'U';
  let secondD = Infinity;
  for (const f of FACES) {
    const d = ciede2000(sample, centroids[f]);
    if (d < bestD) {
      secondD = bestD;
      secondFace = best;
      bestD = d;
      best = f;
    } else if (d < secondD) {
      secondD = d;
      secondFace = f;
    }
  }
  if (bestD > 0 && secondD / bestD < TIE_RATIO) {
    const resolved = breakTie(sample, best, secondFace, centroids);
    if (resolved !== best) {
      best = resolved;
      const t = bestD;
      bestD = secondD;
      secondD = t;
    }
  }
  // 0 when tied, -> 1 when unambiguous.
  const confidence = secondD === 0 ? 0 : Math.max(0, Math.min(1, 1 - bestD / secondD));
  return { face: best, confidence };
}

function meanLab(samples: Lab[]): Lab {
  const n = samples.length;
  const sum = samples.reduce(
    (acc, s) => ({ L: acc.L + s.L, a: acc.a + s.a, b: acc.b + s.b }),
    { L: 0, a: 0, b: 0 }
  );
  return { L: sum.L / n, a: sum.a / n, b: sum.b / n };
}

// Classify a single presented face against known anchors (guided-mode
// checkpoints re-scan one face at a time; the anchors are the session's six
// captured centers). The face's identity is whichever anchor its center
// matches. No k-means — 9 samples aren't enough to refine centroids.
export function classifyFace(
  labs: Lab[],
  anchors: Record<FaceKey, Lab>
): FaceScan {
  const face = assign(labs[4], anchors).face;
  const cells: Color[] = [];
  const confidence: number[] = [];
  labs.forEach((lab, i) => {
    if (i === 4) {
      cells.push(face);
      confidence.push(1);
      return;
    }
    const a = assign(lab, anchors);
    cells.push(a.face);
    confidence.push(a.confidence);
  });
  return { face, cells, confidence };
}

// `samples` holds the 9 Lab reads per face, keyed by the face identity the
// scan protocol established (each face's center sticker IS that face's
// anchor). Runs a short k-means over all 54 samples seeded by the anchors,
// then classifies every sample against the refined centroids.
export function classify(samples: Record<FaceKey, Lab[]>): ClassifyResult {
  const anchors: Record<FaceKey, Lab> = {
    U: samples.U[4],
    D: samples.D[4],
    L: samples.L[4],
    R: samples.R[4],
    F: samples.F[4],
    B: samples.B[4]
  };

  const all: { face: FaceKey; index: number; lab: Lab }[] = [];
  for (const f of FACES) samples[f].forEach((lab, index) => all.push({ face: f, index, lab }));

  // k-means: seed with anchors, keep cluster identity = seeding face letter.
  let centroids = { ...anchors };
  for (let iter = 0; iter < 8; iter++) {
    const buckets: Record<FaceKey, Lab[]> = { U: [], D: [], L: [], R: [], F: [], B: [] };
    for (const s of all) buckets[assign(s.lab, centroids).face].push(s.lab);
    const next = { ...centroids };
    let moved = false;
    for (const f of FACES) {
      if (buckets[f].length === 0) continue; // keep the anchor if a cluster empties
      const m = meanLab(buckets[f]);
      if (ciede2000(m, next[f]) > 0.1) moved = true;
      next[f] = m;
    }
    centroids = next;
    if (!moved) break;
  }

  const faces: FaceScan[] = FACES.map((f) => {
    const cells: Color[] = [];
    const confidence: number[] = [];
    for (let i = 0; i < 9; i++) {
      if (i === 4) {
        // The center defines the face; it is the anchor by construction.
        cells.push(f);
        confidence.push(1);
        continue;
      }
      const a = assign(samples[f][i], centroids);
      cells.push(a.face);
      confidence.push(a.confidence);
    }
    return { face: f, cells, confidence };
  });

  return { faces };
}
