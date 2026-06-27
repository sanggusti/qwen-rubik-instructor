import type { State, FaceKey } from '../core/state';
import { isSolved } from '../core/state';
import { FACE_COLORS } from '../scene/cube/cube';

const FACE_ORDER: FaceKey[] = ['U', 'L', 'F', 'R', 'B', 'D'];
const HISTORY_LIMIT = 20;

export class DebuggerPanel {
  private el: HTMLDivElement;
  private toggleEl: HTMLButtonElement;
  private historyEl!: HTMLDivElement;
  private statusEl!: HTMLSpanElement;
  private faceEls = new Map<FaceKey, HTMLDivElement[]>(); // 9 stickers per face
  private history: string[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'debugger';
    parent.appendChild(this.el);

    const head = document.createElement('div');
    head.className = 'dbg-head';
    const title = document.createElement('h3');
    title.textContent = "Rubik's Debugger";
    head.appendChild(title);

    const close = document.createElement('button');
    close.className = 'dbg-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close debugger');
    close.textContent = '\u00d7';
    close.addEventListener('click', () => this.hide());
    head.appendChild(close);
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

    // Floating reopen toggle (hidden while the panel is open).
    this.toggleEl = document.createElement('button');
    this.toggleEl.id = 'dbg-toggle';
    this.toggleEl.type = 'button';
    this.toggleEl.setAttribute('aria-label', 'Open debugger');
    this.toggleEl.innerHTML = `<span class="dot"></span><span>Debugger</span>`;
    this.toggleEl.addEventListener('click', () => this.show());
    parent.appendChild(this.toggleEl);
  }

  hide(): void {
    this.el.classList.add('is-hidden');
    this.toggleEl.classList.add('is-visible');
  }

  show(): void {
    this.el.classList.remove('is-hidden');
    this.toggleEl.classList.remove('is-visible');
  }

  pushMove(move: string): void {
    this.history.push(move);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
    this.historyEl.textContent = this.history.join(' ');
  }

  reset(): void {
    this.history = [];
    this.historyEl.textContent = '';
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
