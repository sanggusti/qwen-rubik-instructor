import type { MoveAnimator } from '../../scene/cube/animator';
import { generateScramble } from '../../scene/cube/scramble';

export interface KeyboardOptions {
  onScramble?: () => void;
  onReset?: () => void;
  // Triggered for any move enqueued through the keyboard.
  onMove?: (move: string) => void;
}

const NOTATION_KEYS = new Set([
  'U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S', 'X', 'Y', 'Z'
]);

export function attachKeyboard(animator: MoveAnimator, opts: KeyboardOptions = {}): () => void {
  function onKey(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // Don't steal keys from form fields / contenteditable hosts (Gradio textboxes, etc.).
    const t = ev.target as HTMLElement | null;
    if (t) {
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
    }
    const key = ev.key;
    if (key === ' ') {
      ev.preventDefault();
      const seq = generateScramble(20);
      for (const m of seq) animator.enqueue(m);
      opts.onScramble?.();
      return;
    }
    if (key === 'Enter') {
      opts.onReset?.();
      return;
    }
    const upper = key.toUpperCase();
    if (!NOTATION_KEYS.has(upper)) return;
    // X/Y/Z are whole-cube rotations expressed lowercase in our move grammar.
    const base = (upper === 'X' || upper === 'Y' || upper === 'Z') ? upper.toLowerCase() : upper;
    const move = ev.shiftKey ? base + "'" : base;
    if (animator.enqueue(move)) opts.onMove?.(move);
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
