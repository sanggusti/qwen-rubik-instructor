// The Explore panel gathers the Cuber-style learning aids in one collapsible
// surface: highlight a cubelet class, toggle face/number labels, and run the
// Watch & Learn walkthroughs. Plain DOM, mirroring LessonsPanel / PracticePanel.

import type { CubeView } from '../scene/cube/cube_view';
import type { CubeletType } from '../scene/cube/cubelets';
import type { WalkthroughEngine, WalkthroughState } from '../education/walkthrough';

const HIGHLIGHTS: { type: CubeletType | null; label: string }[] = [
  { type: 'center', label: 'Centres' },
  { type: 'edge', label: 'Edges' },
  { type: 'corner', label: 'Corners' },
  { type: 'core', label: 'Core' },
  { type: null, label: 'Show all' }
];

export class ExplorePanel {
  readonly el: HTMLDivElement;
  private highlightButtons = new Map<string, HTMLButtonElement>();
  private facesBtn!: HTMLButtonElement;
  private numbersBtn!: HTMLButtonElement;
  private listEl!: HTMLDivElement;
  private playerEl!: HTMLDivElement;

  private readonly cubeView: CubeView;
  private readonly engine: WalkthroughEngine;
  private readonly onPlay?: () => void;
  private readonly onSelectWalkthrough?: () => void;
  private readonly onGenerate?: (report: (done: number, total: number) => void) => Promise<void>;
  private readonly unsubscribe: () => void;
  private generateBtn?: HTMLButtonElement;
  private generateStatus?: HTMLParagraphElement;

  constructor(
    parent: HTMLElement,
    cubeView: CubeView,
    engine: WalkthroughEngine,
    opts: {
      onPlay?: () => void;
      onSelectWalkthrough?: () => void;
      onGenerate?: (report: (done: number, total: number) => void) => Promise<void>;
    } = {}
  ) {
    this.cubeView = cubeView;
    this.engine = engine;
    this.onPlay = opts.onPlay;
    this.onSelectWalkthrough = opts.onSelectWalkthrough;
    this.onGenerate = opts.onGenerate;

    this.el = document.createElement('div');
    this.el.id = 'explore';
    parent.appendChild(this.el);

    const head = document.createElement('div');
    head.className = 'exp-head';
    const title = document.createElement('h3');
    title.textContent = 'Explore';
    head.appendChild(title);
    this.el.appendChild(head);

    this.buildHighlightSection();
    this.buildLabelSection();
    this.buildWalkthroughSection();

    this.renderHighlightButtons();
    this.renderLabelButtons();
    this.unsubscribe = engine.subscribe((state) => this.renderPlayer(state));
  }

  dispose(): void {
    this.unsubscribe();
  }

  private buildHighlightSection(): void {
    this.el.appendChild(this.sectionTitle('Highlight pieces'));
    const row = document.createElement('div');
    row.className = 'exp-row';
    for (const h of HIGHLIGHTS) {
      const key = h.type ?? 'all';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exp-btn';
      btn.textContent = h.label;
      btn.addEventListener('click', () => {
        this.cubeView.highlight(h.type);
        this.renderHighlightButtons();
      });
      this.highlightButtons.set(key, btn);
      row.appendChild(btn);
    }
    this.el.appendChild(row);
  }

  private buildLabelSection(): void {
    this.el.appendChild(this.sectionTitle('Labels'));
    const row = document.createElement('div');
    row.className = 'exp-row';
    this.facesBtn = document.createElement('button');
    this.facesBtn.type = 'button';
    this.facesBtn.className = 'exp-btn';
    this.facesBtn.textContent = 'Faces';
    this.facesBtn.addEventListener('click', () => {
      this.cubeView.setFaceLabels(!this.cubeView.isFacesOn());
      this.renderLabelButtons();
    });
    this.numbersBtn = document.createElement('button');
    this.numbersBtn.type = 'button';
    this.numbersBtn.className = 'exp-btn';
    this.numbersBtn.textContent = 'Numbers';
    this.numbersBtn.addEventListener('click', () => {
      this.cubeView.setNumbers(!this.cubeView.isNumbersOn());
      this.renderLabelButtons();
    });
    row.appendChild(this.facesBtn);
    row.appendChild(this.numbersBtn);
    this.el.appendChild(row);
  }

  private buildWalkthroughSection(): void {
    this.el.appendChild(this.sectionTitle('Watch & learn'));

    if (this.onGenerate) {
      const row = document.createElement('div');
      row.className = 'exp-row';
      this.generateBtn = document.createElement('button');
      this.generateBtn.type = 'button';
      this.generateBtn.className = 'exp-btn';
      this.generateBtn.textContent = 'Solve my cube (Qwen)';
      this.generateBtn.addEventListener('click', () => this.runGenerate());
      row.appendChild(this.generateBtn);
      this.el.appendChild(row);

      this.generateStatus = document.createElement('p');
      this.generateStatus.className = 'exp-hint';
      this.el.appendChild(this.generateStatus);
    }

    this.listEl = document.createElement('div');
    this.listEl.className = 'exp-list';
    for (const w of this.engine.getWalkthroughs()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exp-item';
      btn.dataset.id = w.id;
      btn.textContent = w.title;
      btn.addEventListener('click', () => {
        this.engine.select(w.id);
        this.onSelectWalkthrough?.();
      });
      this.listEl.appendChild(btn);
    }
    this.el.appendChild(this.listEl);

    this.playerEl = document.createElement('div');
    this.playerEl.className = 'exp-player';
    this.el.appendChild(this.playerEl);
  }

  private renderHighlightButtons(): void {
    const current = this.cubeView.getHighlight();
    for (const [key, btn] of this.highlightButtons) {
      const active = key === 'all' ? current === null : key === current;
      btn.classList.toggle('is-active', active);
    }
  }

  private renderLabelButtons(): void {
    this.facesBtn.classList.toggle('is-active', this.cubeView.isFacesOn());
    this.numbersBtn.classList.toggle('is-active', this.cubeView.isNumbersOn());
  }

  private renderPlayer(state: WalkthroughState): void {
    this.playerEl.replaceChildren();

    // Keep the list selection in sync with the engine.
    const activeId = state.walkthrough?.id ?? null;
    for (const child of Array.from(this.listEl.children)) {
      (child as HTMLElement).classList.toggle(
        'is-active',
        (child as HTMLElement).dataset.id === activeId
      );
    }

    if (state.walkthrough === null) {
      const hint = document.createElement('p');
      hint.className = 'exp-hint';
      hint.textContent = 'Pick a walkthrough to watch.';
      this.playerEl.appendChild(hint);
      return;
    }

    // The side caption owns the title + per-beat narration; the player keeps
    // just the progress, moves, and transport controls to avoid duplication.
    const counter = document.createElement('div');
    counter.className = 'exp-counter';
    counter.textContent = state.finished
      ? `Finished · ${state.beatCount} beats`
      : `Beat ${state.beatIndex + 1} of ${state.beatCount}`;
    this.playerEl.appendChild(counter);

    if (state.beat.moves?.length) {
      this.playerEl.appendChild(this.renderMoves(state.beat.moves, state.moveIndex));
    }

    const actions = document.createElement('div');
    actions.className = 'exp-row';
    actions.appendChild(this.button('Prev', () => this.engine.previous(), state.beatIndex === 0));
    actions.appendChild(
      this.button(state.playing ? 'Pause' : 'Play', () => {
        if (state.playing) {
          this.engine.pause();
        } else {
          this.engine.play();
          // Collapse the panel so the playing cube isn't covered.
          this.onPlay?.();
        }
      })
    );
    actions.appendChild(
      this.button('Next', () => this.engine.next(), state.beatIndex >= state.beatCount - 1)
    );
    actions.appendChild(this.button('Stop', () => this.engine.stop()));
    this.playerEl.appendChild(actions);
  }

  private async runGenerate(): Promise<void> {
    if (!this.onGenerate || !this.generateBtn) return;
    this.generateBtn.disabled = true;
    this.generateBtn.textContent = 'Generating…';
    if (this.generateStatus) this.generateStatus.textContent = 'Asking Qwen to plan your solve…';
    try {
      await this.onGenerate((done, total) => {
        if (this.generateStatus) {
          this.generateStatus.textContent = `Generating narration… beat ${done} of ${total}`;
        }
      });
      if (this.generateStatus) this.generateStatus.textContent = 'Ready — press Play to watch.';
    } catch (err) {
      if (this.generateStatus) {
        this.generateStatus.textContent = `Couldn't generate: ${(err as Error).message}`;
      }
    } finally {
      this.generateBtn.disabled = false;
      this.generateBtn.textContent = 'Solve my cube (Qwen)';
    }
  }

  // Render the beat's moves as chips, highlighting the one currently playing.
  // For long solves, show a window around the active move so it never overflows.
  private renderMoves(moves: string[], activeIndex: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'exp-moves';
    const MAX = 16;
    let start = 0;
    let end = moves.length;
    if (moves.length > MAX) {
      const focus = activeIndex < 0 ? 0 : activeIndex;
      end = Math.min(moves.length, Math.max(focus + Math.ceil(MAX / 2), MAX));
      start = Math.max(0, end - MAX);
    }
    const ellipsis = (): HTMLElement => {
      const e = document.createElement('span');
      e.className = 'exp-move-ellipsis';
      e.textContent = '…';
      return e;
    };
    if (start > 0) wrap.appendChild(ellipsis());
    for (let i = start; i < end; i++) {
      const chip = document.createElement('span');
      chip.className = i === activeIndex ? 'exp-move-chip is-active' : 'exp-move-chip';
      chip.textContent = moves[i];
      wrap.appendChild(chip);
    }
    if (end < moves.length) wrap.appendChild(ellipsis());
    return wrap;
  }

  private sectionTitle(text: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'exp-section';
    h.textContent = text;
    return h;
  }

  private button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'exp-btn';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
