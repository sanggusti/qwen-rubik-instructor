import { describe, expect, it } from 'vitest';
import { applyMove, solvedState, statesEqual } from '../cube/state';
import type { FaceKey, State } from '../cube/state';
import { rgbToLab } from './color-classify';
import { SCAN_ORDER, ScanMachine } from './scan-machine';
import type { Lab } from './types';

// Nominal palette (same as generator) to fabricate clean scans.
const RGB: Record<FaceKey, [number, number, number]> = {
  U: [245, 245, 245],
  D: [240, 210, 40],
  L: [255, 120, 30],
  R: [200, 30, 40],
  F: [30, 160, 70],
  B: [30, 90, 200]
};

function faceLabs(state: State, face: FaceKey): Lab[] {
  return state[face].map((c) => rgbToLab(...RGB[c]));
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACE_MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
function scrambled(seed: number): State {
  const rnd = mulberry32(seed);
  const s = solvedState();
  for (let i = 0; i < 25; i++) applyMove(s, FACE_MOVES[Math.floor(rnd() * FACE_MOVES.length)]);
  return s;
}

function scanAll(machine: ScanMachine, state: State): void {
  machine.begin();
  machine.cameraReady();
  for (const face of SCAN_ORDER) {
    const out = machine.captureFace(faceLabs(state, face));
    expect(out.accepted, `capture ${face}`).toBe(true);
  }
}

describe('ScanMachine happy path', () => {
  it('scans six faces, validates, and lands on the scrambled state', () => {
    const target = scrambled(1);
    const m = new ScanMachine();
    scanAll(m, target);
    expect(m.phase).toBe('adjust');
    const res = m.confirmAdjust();
    expect(res.ok).toBe(true);
    expect(m.phase).toBe('ready');
    expect(statesEqual(m.finalState!, target)).toBe(true);
  });

  it('tracks the expected face through the protocol order', () => {
    const m = new ScanMachine();
    m.begin();
    m.cameraReady();
    const target = scrambled(2);
    expect(m.expectedFace).toBe('F');
    m.captureFace(faceLabs(target, 'F'));
    expect(m.expectedFace).toBe('R');
  });
});

describe('center auto-reject', () => {
  it('rejects a capture whose center is the wrong color', () => {
    const target = scrambled(3);
    const m = new ScanMachine();
    m.begin();
    m.cameraReady();
    // Present the R face while F is expected.
    const out = m.captureFace(faceLabs(target, 'R'));
    expect(out.accepted).toBe(false);
    expect(out.reason).toBe('wrong-center');
    expect(out.detectedCenter).toBe('R');
    expect(m.consecutiveRejects).toBe(1);
    // Correct face is then accepted and the streak resets.
    expect(m.captureFace(faceLabs(target, 'F')).accepted).toBe(true);
    expect(m.consecutiveRejects).toBe(0);
  });
});

describe('adjust + validation', () => {
  it('flags a misread sticker and accepts after a one-tap fix', () => {
    const target = scrambled(4);
    const m = new ScanMachine();
    scanAll(m, target);
    // Corrupt one non-center cell as if the classifier misread it.
    const face: FaceKey = 'F';
    const original = m.working![face][0];
    m.working![face][0] = original === 'U' ? 'D' : 'U';
    const fail = m.confirmAdjust();
    expect(fail.ok).toBe(false);
    expect(m.phase).toBe('adjust');
    expect(m.validationMessage).toBeTruthy();
    // One tap: restore the cell, revalidate.
    m.setCell(face, 0, original);
    const pass = m.confirmAdjust();
    expect(pass.ok).toBe(true);
    expect(statesEqual(m.finalState!, target)).toBe(true);
  });

  it('silently auto-fixes a mis-rotated face reading', () => {
    const target = scrambled(5);
    const m = new ScanMachine();
    scanAll(m, target);
    // Rotate the captured B face reading 90deg (grid-rotation scan error).
    const f = m.working!.B;
    m.working!.B = [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
    const res = m.confirmAdjust();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.autoFixed).toBe(true);
    expect(statesEqual(m.finalState!, target)).toBe(true);
  });
});

describe('manual entry', () => {
  it('starts from solved with full confidence and validates edits', () => {
    const m = new ScanMachine();
    m.beginManual();
    expect(m.phase).toBe('adjust');
    expect(m.confidence!.U.every((c) => c === 1)).toBe(true);
    const res = m.confirmAdjust();
    expect(res.ok).toBe(true);
    expect(statesEqual(m.finalState!, solvedState())).toBe(true);
  });

  it('protects centers from edits', () => {
    const m = new ScanMachine();
    m.beginManual();
    m.setCell('U', 4, 'D');
    expect(m.working!.U[4]).toBe('U');
  });
});

describe('retake and end', () => {
  it('retake steps back one face', () => {
    const target = scrambled(6);
    const m = new ScanMachine();
    m.begin();
    m.cameraReady();
    m.captureFace(faceLabs(target, 'F'));
    m.captureFace(faceLabs(target, 'R'));
    expect(m.expectedFace).toBe('B');
    m.retake();
    expect(m.expectedFace).toBe('R');
    m.captureFace(faceLabs(target, 'R'));
    expect(m.expectedFace).toBe('B');
  });

  it('end resets to idle', () => {
    const m = new ScanMachine();
    m.beginManual();
    m.end();
    expect(m.phase).toBe('idle');
    expect(m.working).toBeNull();
  });
});
