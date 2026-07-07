// Camera lifecycle for physical-cube scanning.
//
// Contract (docs/research/physical-cube-camera-play.md §7): the camera runs
// ONLY during scan windows — the track is stopped entirely between them (LED
// off, zero recurring cost) and re-acquired on demand. One long-lived stream
// per window (a second getUserMedia mutes the first on WebKit, bug #179363).
// The <video> carries playsinline/autoplay/muted or iOS renders black.
// Mirroring rule: SAMPLE FROM THE RAW FRAME; only the preview (+ overlay,
// together) is CSS-mirrored for front cameras.

import type { RGBAImage } from './types';

export type CameraFacing = 'user' | 'environment';

export interface CameraWindow {
  video: HTMLVideoElement;
  /** True when the preview should be CSS-mirrored (front cameras). */
  mirrored: boolean;
  /** Grab the current full-resolution frame (raw orientation). */
  grabFrame(): RGBAImage | null;
  /** Stop the track entirely and release the element. */
  stop(): void;
}

export async function openCamera(facing: CameraFacing = 'user'): Promise<CameraWindow> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Autoplay policies can reject before user gesture; the caller retries on
    // interaction. The stream itself is live either way.
  }

  const full = document.createElement('canvas');
  const fullCtx = full.getContext('2d', { willReadFrequently: true });

  let stopped = false;
  const stopTrack = (): void => {
    if (stopped) return;
    stopped = true;
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', stopTrack);
  };
  // Backgrounding mutes/kills tracks on mobile anyway; release deliberately.
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') stopTrack();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', stopTrack);

  return {
    video,
    mirrored: facing === 'user',
    grabFrame(): RGBAImage | null {
      if (stopped || video.videoWidth === 0 || !fullCtx) return null;
      full.width = video.videoWidth;
      full.height = video.videoHeight;
      fullCtx.drawImage(video, 0, 0);
      const data = fullCtx.getImageData(0, 0, full.width, full.height);
      return { width: data.width, height: data.height, data: data.data };
    },
    stop: stopTrack
  };
}

// Crop the sampled grid region out of a frame and encode it as a small JPEG
// data URL — kept per captured face so /scan/assist can show Qwen exactly
// what the classifier saw. ~240px is plenty for 9 sticker colors and stays
// far under the server's per-image size cap.
export function encodeFaceCrop(frame: RGBAImage, coverage: number, size = 240): string | null {
  try {
    const src = document.createElement('canvas');
    src.width = frame.width;
    src.height = frame.height;
    const srcCtx = src.getContext('2d');
    if (!srcCtx) return null;
    // Copy into a fresh ArrayBuffer-backed array — ImageData's constructor
    // rejects Uint8ClampedArray<ArrayBufferLike> under strict lib.dom types.
    const pixels = new Uint8ClampedArray(frame.data.length);
    pixels.set(frame.data);
    srcCtx.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);

    const side = Math.min(frame.width, frame.height) * coverage;
    const ox = (frame.width - side) / 2;
    const oy = (frame.height - side) / 2;

    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    outCtx.drawImage(src, ox, oy, side, side, 0, 0, size, size);
    return out.toDataURL('image/jpeg', 0.75);
  } catch {
    return null;
  }
}

export interface StillnessOptions {
  /** Called with a full-resolution frame once the scene has been steady. */
  onSteady(frame: RGBAImage): void;
  /** Sampling rate for the stillness loop (default 3 fps). */
  fps?: number;
  /** Mean absolute per-pixel diff (0-255) below which a tick counts as still. */
  threshold?: number;
  /** Consecutive still ticks required to fire (default 2 = ~0.7s). */
  stillTicks?: number;
}

// Downscaled frame-diff stillness detector. Runs at 2-5 fps on a <=160x120
// canvas (~12k px readback, sub-ms) via requestVideoFrameCallback — never
// full-resolution getImageData in the loop. After firing it requires motion
// before it can fire again, so holding the cube still doesn't re-capture.
export function attachStillness(cam: CameraWindow, opts: StillnessOptions): () => void {
  const fps = opts.fps ?? 3;
  const threshold = opts.threshold ?? 6;
  const needTicks = opts.stillTicks ?? 2;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let prev: Uint8ClampedArray | null = null;
  let stillCount = 0;
  let armed = true;
  let detached = false;
  let lastTick = 0;
  let rafId = 0;
  let vfcId = 0;

  const video = cam.video;
  const hasVFC = 'requestVideoFrameCallback' in video;

  const tick = (now: number): void => {
    if (detached) return;
    schedule();
    if (now - lastTick < 1000 / fps) return;
    lastTick = now;
    if (video.videoWidth === 0 || !ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (prev) {
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += Math.abs(data[i] - prev[i]) + Math.abs(data[i + 1] - prev[i + 1]);
      }
      const mean = sum / (data.length / 2);
      if (mean < threshold) {
        stillCount++;
        if (armed && stillCount >= needTicks) {
          armed = false;
          const frame = cam.grabFrame();
          if (frame) opts.onSteady(frame);
        }
      } else {
        stillCount = 0;
        armed = true; // motion re-arms the trigger
      }
    }
    prev = data;
  };

  const schedule = (): void => {
    if (detached) return;
    if (hasVFC) {
      vfcId = (video as HTMLVideoElement & {
        requestVideoFrameCallback(cb: (now: number) => void): number;
      }).requestVideoFrameCallback((now) => tick(now));
    } else {
      rafId = requestAnimationFrame((now) => tick(now));
    }
  };
  schedule();

  return () => {
    detached = true;
    if (hasVFC && vfcId) {
      (video as HTMLVideoElement & {
        cancelVideoFrameCallback?(id: number): void;
      }).cancelVideoFrameCallback?.(vfcId);
    }
    if (rafId) cancelAnimationFrame(rafId);
  };
}
