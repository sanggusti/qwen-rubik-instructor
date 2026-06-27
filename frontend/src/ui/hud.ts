// Hud: a single bottom-centre menu bar that owns a set of dropdown panels.
// Clicking a tab opens its panel as a dropdown above the bar and closes any
// other open panel (accordion behaviour), keeping the corners and the cube
// clear. Panels are plain elements the Hud tags with `.hud-panel`.

export class Hud {
  private readonly host: HTMLElement;
  private readonly bar: HTMLDivElement;
  private readonly tabs = new Map<string, HTMLButtonElement>();
  private readonly panels = new Map<string, HTMLElement>();
  private openId: string | null = null;

  constructor(parent: HTMLElement, private readonly onOpen?: (id: string) => void) {
    this.host = parent;
    this.bar = document.createElement('div');
    this.bar.id = 'hud-bar';
    parent.appendChild(this.bar);
  }

  // A bar button that runs an action instead of toggling a panel (e.g. scramble).
  action(label: string, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-tab';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    this.bar.appendChild(btn);
  }

  register(id: string, label: string, panel: HTMLElement): void {
    panel.classList.add('hud-panel');
    panel.classList.remove('is-open');
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'hud-tab';
    tab.textContent = label;
    tab.addEventListener('click', () => this.toggle(id));
    this.bar.appendChild(tab);
    this.tabs.set(id, tab);
    this.panels.set(id, panel);
  }

  toggle(id: string): void {
    if (this.openId === id) this.close();
    else this.open(id);
  }

  open(id: string): void {
    for (const [pid, panel] of this.panels) panel.classList.toggle('is-open', pid === id);
    for (const [tid, tab] of this.tabs) tab.classList.toggle('is-active', tid === id);
    this.host.classList.add('has-panel');
    this.openId = id;
    this.onOpen?.(id);
  }

  close(): void {
    for (const panel of this.panels.values()) panel.classList.remove('is-open');
    for (const tab of this.tabs.values()) tab.classList.remove('is-active');
    this.host.classList.remove('has-panel');
    this.openId = null;
  }
}
