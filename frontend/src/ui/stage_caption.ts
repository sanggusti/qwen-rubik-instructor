// StageCaption: the "current instruction" shown beside the cube during an active
// experience (lesson, drill, or walkthrough). While visible it tags the host
// element with `is-experience`, which shifts the cube to the left (see CSS), and
// it can stream text in (typewriter) for walkthrough narration. Only one source
// "owns" the caption at a time; clearing from a non-owner is ignored.

export class StageCaption {
  private readonly host: HTMLElement;
  private readonly el: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly bodyEl: HTMLParagraphElement;
  private readonly moveEl: HTMLDivElement;

  private owner: string | null = null;
  private lastText = '';
  private streamTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: HTMLElement, onClose: (owner: string) => void) {
    this.host = host;

    this.el = document.createElement('div');
    this.el.id = 'stage';

    const close = document.createElement('button');
    close.className = 'stage-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'End');
    close.textContent = '×';
    close.addEventListener('click', () => {
      if (this.owner) onClose(this.owner);
    });
    this.el.appendChild(close);

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'stage-title';
    this.el.appendChild(this.titleEl);

    this.bodyEl = document.createElement('p');
    this.bodyEl.className = 'stage-body';
    this.el.appendChild(this.bodyEl);

    // Small "now playing" move badge, shown only while a walkthrough is stepping.
    this.moveEl = document.createElement('div');
    this.moveEl.className = 'stage-move';
    this.moveEl.hidden = true;
    this.el.appendChild(this.moveEl);

    host.appendChild(this.el);
  }

  // Show/hide the current-move badge (e.g. "R · 3/12"). Pass null to hide.
  setMove(label: string | null): void {
    if (label) {
      this.moveEl.textContent = label;
      this.moveEl.hidden = false;
    } else {
      this.moveEl.textContent = '';
      this.moveEl.hidden = true;
    }
  }

  set(owner: string, title: string, text: string, stream = false): void {
    const sameText = owner === this.owner && text === this.lastText;
    this.owner = owner;
    this.lastText = text;
    this.titleEl.textContent = title;
    this.el.classList.add('is-open');
    this.host.classList.add('is-experience');
    if (sameText) return; // unrelated re-emit (e.g. play/pause) — don't restart
    if (stream) this.streamText(text);
    else { this.stopStream(); this.bodyEl.textContent = text; }
  }

  clear(owner: string): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.lastText = '';
    this.stopStream();
    this.setMove(null);
    this.el.classList.remove('is-open');
    this.host.classList.remove('is-experience');
  }

  private stopStream(): void {
    if (this.streamTimer !== null) {
      clearTimeout(this.streamTimer);
      this.streamTimer = null;
    }
  }

  private streamText(text: string): void {
    this.stopStream();
    this.bodyEl.textContent = '';
    let i = 0;
    const step = (): void => {
      i = Math.min(text.length, i + 1);
      this.bodyEl.textContent = text.slice(0, i);
      this.streamTimer = i < text.length ? setTimeout(step, 22) : null;
    };
    step();
  }
}
