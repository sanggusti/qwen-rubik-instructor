// A simple DOM panel for the practice subsystem, mirroring LessonsPanel. No UI
// framework: plain DOM updated from the engine's snapshots. All user-facing text
// is set via textContent to keep it safe from injection.

import type { PracticeEngine, PracticeState } from '../education/practice_engine';
import type { DrillCategory, DrillDifficulty } from '../education/practice_types';
import { selectDrills } from '../education/drill_generator';

const CATEGORIES: { id: DrillCategory | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'trigger', label: 'Triggers' },
    { id: 'algorithm', label: 'Algorithms' },
    { id: 'solve', label: 'Solves' }
];

const DIFFICULTIES: { id: DrillDifficulty | 'all'; label: string }[] = [
    { id: 'all', label: 'Any' },
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' }
];

// Personal-best solve times, persisted per drill. Powers "solve faster" practice.
function bestKey(id: string): string {
    return `rubik-best:${id}`;
}
function getBest(id: string): number | null {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(bestKey(id)) : null;
        return raw ? Number(raw) : null;
    } catch {
        return null;
    }
}
function recordBest(id: string, ms: number): void {
    const best = getBest(id);
    if (best != null && best <= ms) return;
    try {
        localStorage?.setItem(bestKey(id), String(ms));
    } catch {
        /* ignore */
    }
}
function fmtTime(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

export class PracticePanel {
    readonly el: HTMLDivElement;
    private listEl!: HTMLDivElement;
    private detailEl!: HTMLDivElement;
    private filterButtons = new Map<DrillCategory | 'all', HTMLButtonElement>();
    private difficultyButtons = new Map<DrillDifficulty | 'all', HTMLButtonElement>();
    private readonly timerEl: HTMLDivElement;
    private readonly tickHandle: ReturnType<typeof setInterval>;
    private lastState: PracticeState = { drill: null };

    private readonly engine: PracticeEngine;
    private readonly onSelect?: () => void;
    private category: DrillCategory | 'all' = 'all';
    private difficulty: DrillDifficulty | 'all' = 'all';
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

        const diffFilter = document.createElement('div');
        diffFilter.className = 'prc-filter';
        for (const d of DIFFICULTIES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'prc-cat';
            btn.textContent = d.label;
            btn.addEventListener('click', () => this.setDifficulty(d.id));
            this.difficultyButtons.set(d.id, btn);
            diffFilter.appendChild(btn);
        }
        this.el.appendChild(diffFilter);

        this.listEl = document.createElement('div');
        this.listEl.className = 'prc-list';
        this.el.appendChild(this.listEl);

        this.detailEl = document.createElement('div');
        this.detailEl.className = 'prc-detail';
        this.el.appendChild(this.detailEl);

        this.timerEl = document.createElement('div');
        this.timerEl.className = 'prc-timer';

        this.renderFilterButtons();
        this.renderList();
        this.unsubscribe = engine.subscribe((state) => this.renderDetail(state));
        // Live solve clock — updates the timer text without re-rendering the panel.
        this.tickHandle = setInterval(() => this.tickTimer(), 100);
    }

    dispose(): void {
        this.unsubscribe();
        clearInterval(this.tickHandle);
    }

    private setCategory(category: DrillCategory | 'all'): void {
        this.category = category;
        this.renderFilterButtons();
        this.renderList();
    }

    private setDifficulty(difficulty: DrillDifficulty | 'all'): void {
        this.difficulty = difficulty;
        this.renderFilterButtons();
        this.renderList();
    }

    private renderFilterButtons(): void {
        for (const [id, btn] of this.filterButtons) {
            btn.classList.toggle('is-active', id === this.category);
        }
        for (const [id, btn] of this.difficultyButtons) {
            btn.classList.toggle('is-active', id === this.difficulty);
        }
    }

    private tickTimer(): void {
        const s = this.lastState;
        if (s.drill === null) {
            this.timerEl.textContent = '';
            return;
        }
        const best = getBest(s.drill.id);
        const bestStr = best != null ? ` · best ${fmtTime(best)}` : '';
        if (s.completed && s.solveMs != null) {
            this.timerEl.textContent = `Time ${fmtTime(s.solveMs)}${bestStr}`;
        } else if (s.startedAt != null) {
            this.timerEl.textContent = `Time ${fmtTime(Date.now() - s.startedAt)}${bestStr}`;
        } else {
            this.timerEl.textContent = `Time —${bestStr}`;
        }
    }

    private renderList(): void {
        this.listEl.replaceChildren();
        const drills = selectDrills(this.engine.getDrills(), {
            category: this.category === 'all' ? undefined : this.category,
            difficulty: this.difficulty === 'all' ? undefined : this.difficulty
        });
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
        this.lastState = state;
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

        // Persist a new personal best when a drill completes.
        if (state.completed && state.solveMs != null) {
            recordBest(state.drill.id, state.solveMs);
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

        // Solve clock + personal best (kept up to date by tickTimer).
        this.detailEl.appendChild(this.timerEl);
        this.tickTimer();

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
