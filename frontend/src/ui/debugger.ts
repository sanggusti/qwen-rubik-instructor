import type { State, FaceKey } from '../core/state';
import { isSolved } from '../core/state';
import { FACE_COLORS } from '../scene/cube/cube';

const FACE_ORDER: FaceKey[] = ['U', 'L', 'F', 'R', 'B', 'D'];
const HISTORY_LIMIT = 20;

// One recorded move plus when it landed (ms, performance.now() clock), so the
// history is a timed log rather than a bare string — usable for pacing signals.
interface MoveRecord {
  move: string;
  at: number;
}

export class DebuggerPanel {
  readonly el: HTMLDivElement;
  private historyEl!: HTMLDivElement;
  private paceEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private faceEls = new Map<FaceKey, HTMLDivElement[]>(); // 9 stickers per face
  private history: MoveRecord[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debugger';
    parent.appendChild(this.el);

    const head = document.createElement('div');
    head.className = 'dbg-head';
    const title = document.createElement('h3');
    title.textContent = "Rubik's Debugger";
    head.appendChild(title);
    this.el.appendChild(head);

    const status = document.createElement('div');
    status.className = 'row';
    status.innerHTML = `<span>Solved:</span><span id="dbg-solved" class="solved-no">no</span>`;
    this.el.appendChild(status);
    this.statusEl = status.querySelector('#dbg-solved') as HTMLSpanElement;

    const facesWrap = document.createElement('div');
    facesWrap.className = 'faces';
    for (const face of FACE_ORDER) {
      const fEl = document.createElement('div');
      fEl.className = 'face';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = face;
      fEl.appendChild(label);
      const stickers: HTMLDivElement[] = [];
      for (let i = 0; i < 9; i++) {
        const s = document.createElement('div');
        s.className = 'sticker';
        fEl.appendChild(s);
        stickers.push(s);
      }
      this.faceEls.set(face, stickers);
      facesWrap.appendChild(fEl);
    }
    this.el.appendChild(facesWrap);

    const histTitle = document.createElement('div');
    histTitle.className = 'hist-title';
    histTitle.textContent = 'History';
    this.el.appendChild(histTitle);

    this.historyEl = document.createElement('div');
    this.historyEl.className = 'history';
    this.el.appendChild(this.historyEl);

    this.paceEl = document.createElement('div');
    this.paceEl.className = 'hist-pace';
    this.el.appendChild(this.paceEl);
  }

  pushMove(move: string, at: number): void {
    this.history.push({ move, at });
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
    this.historyEl.textContent = this.history.map((r) => r.move).join(' ');
    // Pacing signal: the gap since the previous move.
    const n = this.history.length;
    this.paceEl.textContent =
      n >= 2 ? `last move +${((this.history[n - 1].at - this.history[n - 2].at) / 1000).toFixed(1)}s` : '';
  }

  reset(): void {
    this.history = [];
    this.historyEl.textContent = '';
    this.paceEl.textContent = '';
  }

  render(state: State): void {
    for (const face of FACE_ORDER) {
      const stickers = this.faceEls.get(face)!;
      for (let i = 0; i < 9; i++) {
        const color = FACE_COLORS[state[face][i]];
        stickers[i].style.background = '#' + color.toString(16).padStart(6, '0');
      }
    }
    const solved = isSolved(state);
    this.statusEl.textContent = solved ? 'yes' : 'no';
    this.statusEl.className = solved ? 'solved-yes' : 'solved-no';
  }
}
