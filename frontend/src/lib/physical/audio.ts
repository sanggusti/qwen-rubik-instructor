// Tiny WebAudio cues for the scan flow. The user's eyes are on the cube half
// the time, so captures/successes/errors must be audible (UX audit §8.4). No
// assets — oscillator beeps only. Every call is fail-soft.

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(freq: number, durationMs: number, type: OscillatorType = 'sine', delayMs = 0): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t0 = ac.currentTime + delayMs / 1000;
    const t1 = t0 + durationMs / 1000;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t1);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t1);
  } catch {
    // Audio is a nicety; never let it break the flow.
  }
}

/** Shutter tick: a capture was taken. */
export function tick(): void {
  beep(880, 40);
}

/** Success chime: face accepted / checkpoint passed. */
export function chime(): void {
  beep(660, 120);
  beep(990, 160, 'sine', 110);
}

/** Gentle buzz: capture rejected / mismatch. */
export function buzz(): void {
  beep(150, 180, 'square');
}
