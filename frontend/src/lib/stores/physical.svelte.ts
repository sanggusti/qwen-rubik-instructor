// Reactive façade over the physical-cube scan session: owns the camera
// window, feeds sampled frames to the pure ScanMachine, mirrors its state
// for the UI, and loads the validated result into the live cube store.
//
// While a session is active the on-screen cube is a read-only mirror —
// CubeMesh/play page gate drag/keyboard/scramble/reset on `active` — and the
// camera is powered only while actually scanning (stopped entirely after the
// sixth face; docs §7 camera lifecycle contract).

import { chime, buzz, tick } from '../physical/audio';
import { attachStillness, openCamera } from '../physical/camera';
import type { CameraWindow } from '../physical/camera';
import { centeredGrid, sampleGrid } from '../physical/sampler';
import { SCAN_CUES, ScanMachine } from '../physical/scan-machine';
import type { ScanPhase } from '../physical/scan-machine';
import type { StickerRef } from '../physical/legality';
import type { Color, FaceKey, State } from '../cube/state';
import type { Lab, RGBAImage } from '../physical/types';
import { cubeStore } from './cube.svelte';

// Fraction of the shorter video side the on-screen 3x3 overlay covers.
// Sampling uses the same fraction on the raw frame so overlay and samples
// always describe the same pixels.
export const OVERLAY_COVERAGE = 0.55;

const ANCHOR_KEY = 'rubik-physical-anchors';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

interface CaptureFlash {
  face: FaceKey;
  cells: Color[] | null;
  ok: boolean;
  message: string;
}

class PhysicalStore {
  /** True from session start to end — gates inputs and render mode. */
  active: boolean = $state(false);
  phase: ScanPhase = $state('idle');
  faceIndex: number = $state(0);
  manual: boolean = $state(false);
  cameraOpen: boolean = $state(false);
  mirrored: boolean = $state(true);
  videoEl: HTMLVideoElement | null = $state(null);
  cue: { hold: string; center: string } = $state(SCAN_CUES.F);
  flash: CaptureFlash | null = $state(null);
  errorMessage: string | null = $state(null);
  validationMessage: string | null = $state(null);
  suspects: StickerRef[] = $state([]);
  working: State | null = $state(null);
  confidence: Record<FaceKey, number[]> | null = $state(null);
  consecutiveRejects: number = $state(0);
  /** The validated scanned state once phase === 'ready'. */
  finalState: State | null = $state(null);

  private machine = new ScanMachine();
  private camera: CameraWindow | null = null;
  private detachStillness: (() => void) | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private storage: StorageLike | null = defaultStorage();

  async beginScan(): Promise<void> {
    this.machine.begin();
    this.active = true;
    this.errorMessage = null;
    this.sync();
    try {
      this.camera = await openCamera('user');
      this.videoEl = this.camera.video;
      this.mirrored = this.camera.mirrored;
      this.cameraOpen = true;
      this.machine.cameraReady();
      this.detachStillness = attachStillness(this.camera, {
        onSteady: (frame) => this.handleSteadyFrame(frame)
      });
    } catch {
      this.machine.cameraError('Camera unavailable');
      this.errorMessage =
        'Could not open the camera. You can still enter your cube by hand.';
    }
    this.sync();
  }

  beginManual(): void {
    this.machine.beginManual();
    this.active = true;
    this.errorMessage = null;
    this.sync();
  }

  /** Camera denied / repeated failures: keep the session, drop the camera. */
  switchToManual(): void {
    this.stopCamera();
    this.machine.switchToManual();
    this.sync();
  }

  retake(): void {
    this.machine.retake();
    this.sync();
  }

  setCell(face: FaceKey, index: number, color: Color): void {
    this.machine.setCell(face, index, color);
    this.sync();
  }

  confirmAdjust(): void {
    const res = this.machine.confirmAdjust();
    if (res.ok) {
      chime();
      this.persistAnchors();
      cubeStore.loadState(res.state);
    } else {
      buzz();
    }
    this.sync();
  }

  /** Read-along advance: apply the current beat's moves to the mirror. */
  confirmMoves(moves: string[]): void {
    if (!this.active) return;
    cubeStore.applyMoves(moves);
    tick();
  }

  endSession(): void {
    this.stopCamera();
    this.machine.end();
    this.active = false;
    this.flash = null;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.sync();
  }

  private handleSteadyFrame(frame: RGBAImage): void {
    if (this.machine.phase !== 'scanning') return;
    const grid = centeredGrid(frame.width, frame.height, OVERLAY_COVERAGE);
    let labs = sampleGrid(frame, grid);
    // Facelet indices are viewer-perspective. The raw frame of a mirrored
    // (front) camera is the horizontal flip of what the user aligns against,
    // so flip the sampled columns back.
    if (this.mirrored) labs = mirrorColumns(labs);

    const face = this.machine.expectedFace;
    const outcome = this.machine.captureFace(labs);
    if (outcome.accepted) {
      tick();
      const scannedCells =
        this.machine.working?.[face] ?? null;
      this.showFlash({ face, cells: scannedCells, ok: true, message: 'Captured!' });
      if (outcome.finishedScanning) {
        chime();
        // Scan window over: power the camera down (LED off) for the adjust step.
        this.stopCamera();
      }
    } else if (outcome.reason === 'wrong-center') {
      buzz();
      const wanted = SCAN_CUES[face].center;
      this.showFlash({
        face,
        cells: null,
        ok: false,
        message: `That looks like a different side — show the ${wanted} center.`
      });
    }
    this.sync();
  }

  private showFlash(flash: CaptureFlash): void {
    this.flash = flash;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flash = null;
    }, 1400);
  }

  private stopCamera(): void {
    this.detachStillness?.();
    this.detachStillness = null;
    this.camera?.stop();
    this.camera = null;
    this.videoEl = null;
    this.cameraOpen = false;
  }

  private persistAnchors(): void {
    if (this.manual || !this.storage) return;
    try {
      // Centers double as the per-device color anchors for future sessions.
      const anchors = this.machine.centerSamples();
      if (Object.keys(anchors).length === 6) {
        this.storage.setItem(ANCHOR_KEY, JSON.stringify(anchors));
      }
    } catch {
      // best-effort
    }
  }

  private sync(): void {
    this.phase = this.machine.phase;
    this.faceIndex = this.machine.faceIndex;
    this.manual = this.machine.manual;
    this.cue = SCAN_CUES[this.machine.expectedFace];
    this.working = this.machine.working;
    this.confidence = this.machine.confidence;
    this.suspects = this.machine.suspects;
    this.validationMessage = this.machine.validationMessage;
    this.finalState = this.machine.finalState;
    this.consecutiveRejects = this.machine.consecutiveRejects;
    if (this.machine.error) this.errorMessage = this.errorMessage ?? this.machine.error;
  }
}

function mirrorColumns(labs: Lab[]): Lab[] {
  const map = [2, 1, 0, 5, 4, 3, 8, 7, 6];
  return map.map((i) => labs[i]);
}

export const physicalStore = new PhysicalStore();
