// Pure state machine for a physical-cube scan session. No browser APIs —
// the store layer feeds it sampled Lab grids and it answers with phase
// transitions, so the whole flow is unit-testable in node.
//
// Scan protocol (docs/research/physical-cube-camera-play.md §2): home grip
// white-up/green-front, faces in order F, R, B, L (y-style turns, white stays
// up), then tip back for U, tip forward for D. Face identity is anchored by
// the center sticker; a capture whose center doesn't read as the expected
// color is auto-rejected.

import { solvedState } from '../cube/state';
import type { Color, FaceKey, State } from '../cube/state';
import { ciede2000, classify, rgbToLab } from './color-classify';
import { checkLegality, autoFixRotations } from './legality';
import type { StickerRef } from './legality';
import type { Lab } from './types';

export type ScanPhase =
  | 'idle'
  | 'camera-init'
  | 'scanning'
  | 'adjust'
  | 'ready'
  | 'error';

export const SCAN_ORDER: FaceKey[] = ['F', 'R', 'B', 'L', 'U', 'D'];

// Human instructions per scan step, deliberately free of face letters.
export const SCAN_CUES: Record<FaceKey, { hold: string; center: string }> = {
  F: { hold: 'Hold the cube with the white center up and the green center facing the camera.', center: 'green' },
  R: { hold: 'Turn the whole cube a quarter to the left — white stays on top.', center: 'red' },
  B: { hold: 'Again: quarter turn to the left, white on top.', center: 'blue' },
  L: { hold: 'One more quarter turn to the left, white on top.', center: 'orange' },
  U: { hold: 'Tip the cube back so the white center faces the camera.', center: 'white' },
  D: { hold: 'Tip forward twice so the yellow center faces the camera.', center: 'yellow' }
};

// Nominal sticker colors for the coarse center check during scanning
// (full anchored classification needs all six centers, which we only have
// at the end). Same palette as the synthetic fixture generator.
const NOMINAL: Record<FaceKey, Lab> = {
  U: rgbToLab(245, 245, 245),
  D: rgbToLab(240, 210, 40),
  L: rgbToLab(255, 120, 30),
  R: rgbToLab(200, 30, 40),
  F: rgbToLab(30, 160, 70),
  B: rgbToLab(30, 90, 200)
};

export interface CaptureOutcome {
  accepted: boolean;
  reason?: 'wrong-center' | 'not-scanning';
  detectedCenter?: FaceKey;
  /** Set when a capture completes the sixth face and the machine classified. */
  finishedScanning?: boolean;
}

export type ValidateOutcome =
  | { ok: true; state: State; autoFixed: boolean }
  | { ok: false; code: 'structure' | 'twist' | 'flip' | 'parity'; suspects: StickerRef[] };

export class ScanMachine {
  phase: ScanPhase = 'idle';
  faceIndex = 0;
  manual = false;
  error: string | null = null;
  /** Working 54-sticker state shown/edited in the adjust grid. */
  working: State | null = null;
  /** Per-face per-cell classifier confidence (1 for manual entry). */
  confidence: Record<FaceKey, number[]> | null = null;
  /** Suspect stickers from the last failed validation. */
  suspects: StickerRef[] = [];
  /** Human-readable reason for the last failed validation. */
  validationMessage: string | null = null;
  /** Final legal state, set when phase === 'ready'. */
  finalState: State | null = null;

  private samples: Partial<Record<FaceKey, Lab[]>> = {};
  private rejectStreak = 0;

  /** Captured center Labs — persisted as per-device anchors for warm starts. */
  centerSamples(): Partial<Record<FaceKey, Lab>> {
    const centers: Partial<Record<FaceKey, Lab>> = {};
    for (const [face, labs] of Object.entries(this.samples)) {
      if (labs) centers[face as FaceKey] = labs[4];
    }
    return centers;
  }

  /** Consecutive rejects on the current face; UI offers help at >= 3. */
  get consecutiveRejects(): number {
    return this.rejectStreak;
  }

  get expectedFace(): FaceKey {
    return SCAN_ORDER[Math.min(this.faceIndex, SCAN_ORDER.length - 1)];
  }

  get capturedCount(): number {
    return this.faceIndex;
  }

  begin(): void {
    this.resetSession();
    this.phase = 'camera-init';
  }

  beginManual(): void {
    this.resetSession();
    this.manual = true;
    this.working = solvedState();
    this.confidence = fullConfidence();
    this.phase = 'adjust';
  }

  cameraReady(): void {
    if (this.phase === 'camera-init') this.phase = 'scanning';
  }

  cameraError(message: string): void {
    this.error = message;
    this.phase = 'error';
  }

  /** Fall back to manual entry (e.g. camera denied, repeated rejects). */
  switchToManual(): void {
    this.manual = true;
    this.working = this.working ?? solvedState();
    this.confidence = this.confidence ?? fullConfidence();
    this.phase = 'adjust';
  }

  /** Feed one captured face (9 Lab samples, facelet order). */
  captureFace(labs: Lab[]): CaptureOutcome {
    if (this.phase !== 'scanning') return { accepted: false, reason: 'not-scanning' };
    const expected = this.expectedFace;

    // Coarse center check against nominal colors.
    let detected: FaceKey = 'U';
    let best = Infinity;
    for (const f of Object.keys(NOMINAL) as FaceKey[]) {
      const d = ciede2000(labs[4], NOMINAL[f]);
      if (d < best) {
        best = d;
        detected = f;
      }
    }
    if (detected !== expected) {
      this.rejectStreak++;
      return { accepted: false, reason: 'wrong-center', detectedCenter: detected };
    }

    this.samples[expected] = labs;
    this.rejectStreak = 0;
    this.faceIndex++;

    if (this.faceIndex < SCAN_ORDER.length) return { accepted: true };

    // All six captured: run the anchored classifier and move to adjust.
    const result = classify(this.samples as Record<FaceKey, Lab[]>);
    const state = solvedState();
    const confidence = fullConfidence();
    for (const scan of result.faces) {
      state[scan.face] = [...scan.cells] as Color[];
      confidence[scan.face] = [...scan.confidence];
    }
    this.working = state;
    this.confidence = confidence;
    this.phase = 'adjust';
    return { accepted: true, finishedScanning: true };
  }

  /** Undo the last accepted capture so the face can be re-presented. */
  retake(): void {
    if (this.phase !== 'scanning' || this.faceIndex === 0) return;
    this.faceIndex--;
    delete this.samples[SCAN_ORDER[this.faceIndex]];
    this.rejectStreak = 0;
  }

  /** Manual correction from the adjust grid. */
  setCell(face: FaceKey, index: number, color: Color): void {
    if (this.phase !== 'adjust' || !this.working || index === 4) return;
    this.working[face][index] = color;
    if (this.confidence) this.confidence[face][index] = 1;
    this.suspects = [];
    this.validationMessage = null;
  }

  /** Validate the working state; on success the machine is `ready`. */
  confirmAdjust(): ValidateOutcome {
    if (this.phase !== 'adjust' || !this.working) {
      return { ok: false, code: 'structure', suspects: [] };
    }
    const res = checkLegality(this.working);
    if (res.ok) {
      this.finalState = this.working;
      this.phase = 'ready';
      this.suspects = [];
      this.validationMessage = null;
      return { ok: true, state: this.working, autoFixed: false };
    }
    // Silent rotation auto-fix before bothering the user.
    const fixed = autoFixRotations(this.working);
    if (fixed) {
      this.working = fixed;
      this.finalState = fixed;
      this.phase = 'ready';
      this.suspects = [];
      this.validationMessage = null;
      return { ok: true, state: fixed, autoFixed: true };
    }
    this.suspects = res.suspects;
    this.validationMessage = VALIDATION_MESSAGES[res.code];
    return { ok: false, code: res.code, suspects: res.suspects };
  }

  end(): void {
    this.resetSession();
  }

  private resetSession(): void {
    this.phase = 'idle';
    this.faceIndex = 0;
    this.manual = false;
    this.error = null;
    this.working = null;
    this.confidence = null;
    this.suspects = [];
    this.validationMessage = null;
    this.finalState = null;
    this.samples = {};
    this.rejectStreak = 0;
  }
}

// User-facing, deliberately jargon-free (never "illegal"/"parity").
const VALIDATION_MESSAGES: Record<'structure' | 'twist' | 'flip' | 'parity', string> = {
  structure: 'A couple of stickers look off — tap the highlighted ones to fix them.',
  twist: "One corner doesn't quite add up. Double-check the corners and tap any sticker that looks wrong.",
  flip: "One edge doesn't quite add up. Double-check the edges and tap any sticker that looks wrong.",
  parity: "Two pieces seem swapped. Compare the grid with your cube and fix what differs."
};

function fullConfidence(): Record<FaceKey, number[]> {
  return {
    U: Array(9).fill(1),
    D: Array(9).fill(1),
    L: Array(9).fill(1),
    R: Array(9).fill(1),
    F: Array(9).fill(1),
    B: Array(9).fill(1)
  };
}
