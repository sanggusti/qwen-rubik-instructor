// A simple DOM panel for the practice subsystem, mirroring LessonsPanel. No UI
// framework: plain DOM updated from the engine's snapshots. All user-facing text
// is set via textContent to keep it safe from injection.

import type { PracticeEngine, PracticeState } from '../education/practice_engine';
import type { DrillCategory } from '../education/practice_types';

const CATEGORIES: { id: DrillCategory | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'trigger', label: 'Triggers' },
    { id: 'algorithm', label: 'Algorithms' },
    { id: 'solve', label: 'Solves' }
];

export class PracticePanel {
    readonly el: HTMLDivElement;
    private listEl!: HTMLDivElement;
    private detailEl!: HTMLDivElement;
    private filterButtons = new Map<DrillCategory | 'all', HTMLButtonElement>();

    private readonly engine: PracticeEngine;
    private readonly onSelect?: () => void;
    private category: DrillCategory | 'all' = 'all';
    private unsubscribe: () => void;

    constructor(parent: HTMLElement, engine: PracticeEngine, onSelect?: () => void) {
        this.engine = engine;
        this.onSelect = onSelect;

        this.el = document.createElement('div');
        this.el.id = 'practice';
        parent.appendChild(this.el);

        const head = document.createElement('div');
        head.className = 'prc-head';
        const title = document.createElement('h3');
        title.textContent = 'Practice';
        head.appendChild(title);
        this.el.appendChild(head);

        const filter = document.createElement('div');
        filter.className = 'prc-filter';
        for (const c of CATEGORIES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'prc-cat';
            btn.textContent = c.label;
            btn.addEventListener('click', () => this.setCategory(c.id));
            this.filterButtons.set(c.id, btn);
            filter.appendChild(btn);
        }
        this.el.appendChild(filter);

        this.listEl = document.createElement('div');
        this.listEl.className = 'prc-list';
        this.el.appendChild(this.listEl);

        this.detailEl = document.createElement('div');
        this.detailEl.className = 'prc-detail';
        this.el.appendChild(this.detailEl);

        this.renderFilterButtons();
        this.renderList();
        this.unsubscribe = engine.subscribe((state) => this.renderDetail(state));
    }

    dispose(): void {
        this.unsubscribe();
    }

    private setCategory(category: DrillCategory | 'all'): void {
        this.category = category;
        this.renderFilterButtons();
        this.renderList();
    }

    private renderFilterButtons(): void {
        for (const [id, btn] of this.filterButtons) {
            btn.classList.toggle('is-active', id === this.category);
        }
    }

    private renderList(): void {
        this.listEl.replaceChildren();
        const drills = this.engine.getDrills().filter(
            (d) => this.category === 'all' || d.category === this.category
        );
        const active = this.engine.getCurrentDrill();
        for (const drill of drills) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'prc-item';
            if (active && active.id === drill.id) btn.classList.add('is-active');
            btn.textContent = `${drill.title} \u00b7 ${drill.difficulty}`;
            btn.addEventListener('click', () => {
                this.engine.selectDrill(drill.id);
                this.onSelect?.();
            });
            this.listEl.appendChild(btn);
        }
    }

    private renderDetail(state: PracticeState): void {
        this.detailEl.replaceChildren();
        // Keep the list selection highlight in sync with the engine.
        this.renderList();

        if (state.drill === null) {
            const hint = document.createElement('p');
            hint.className = 'prc-hint';
            hint.textContent = 'Pick a drill above to begin.';
            this.detailEl.appendChild(hint);
            return;
        }

        const { drill, round, roundCount, score, completed, evaluation } = state;

        const title = document.createElement('h4');
        title.className = 'prc-title';
        title.textContent = drill.title;
        this.detailEl.appendChild(title);

        const meta = document.createElement('p');
        meta.className = 'prc-meta';
        meta.textContent = `${drill.category} \u00b7 ${drill.difficulty}`;
        this.detailEl.appendChild(meta);

        const prompt = document.createElement('p');
        prompt.className = 'prc-prompt';
        prompt.textContent = drill.prompt;
        this.detailEl.appendChild(prompt);

        const counter = document.createElement('div');
        counter.className = 'prc-counter';
        counter.textContent = `Round ${Math.min(round + 1, roundCount)} of ${roundCount} \u00b7 Score ${score}`;
        this.detailEl.appendChild(counter);

        const feedback = document.createElement('div');
        feedback.className = `prc-feedback ${completed ? 'correct' : evaluation.status}`;
        feedback.textContent = completed
            ? `Drill complete \u2713 Score ${score}/${roundCount}`
            : evaluation.message;
        this.detailEl.appendChild(feedback);

        const actions = document.createElement('div');
        actions.className = 'prc-actions';
        if (drill.setupMoves?.length) {
            actions.appendChild(this.button('Set up', () => this.engine.applySetupMoves()));
        }
        if (drill.expectedMoves?.length) {
            actions.appendChild(this.button('Apply example moves', () => this.engine.applyExampleMoves()));
        }
        actions.appendChild(this.button('Reset drill', () => this.engine.resetDrill()));
        this.detailEl.appendChild(actions);
    }

    private button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prc-btn';
        btn.textContent = label;
        btn.disabled = disabled;
        btn.addEventListener('click', onClick);
        return btn;
    }
}
