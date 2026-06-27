// A simple DOM panel for the lessons subsystem, in the spirit of DebuggerPanel.
// No UI framework: plain DOM updated from the engine's snapshots.

import type { LessonEngine, EngineState } from '../education/lesson_engine';
import type { LessonTrack } from '../education/lesson_types';

const TRACKS: { id: LessonTrack; label: string }[] = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'time-improvement', label: 'Improve time' }
];

export class LessonsPanel {
    private el: HTMLDivElement;
    private toggleEl: HTMLButtonElement;
    private listEl!: HTMLDivElement;
    private detailEl!: HTMLDivElement;
    private trackButtons = new Map<LessonTrack, HTMLButtonElement>();

    private readonly engine: LessonEngine;
    private track: LessonTrack = 'beginner';
    private unsubscribe: () => void;

    constructor(parent: HTMLElement, engine: LessonEngine) {
        this.engine = engine;

        this.el = document.createElement('div');
        this.el.id = 'lessons';
        parent.appendChild(this.el);

        const head = document.createElement('div');
        head.className = 'lsn-head';
        const title = document.createElement('h3');
        title.textContent = 'Lessons';
        head.appendChild(title);

        const close = document.createElement('button');
        close.className = 'lsn-close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Close lessons');
        close.textContent = '\u00d7';
        close.addEventListener('click', () => this.hide());
        head.appendChild(close);
        this.el.appendChild(head);

        const filter = document.createElement('div');
        filter.className = 'lsn-filter';
        for (const t of TRACKS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lsn-track';
            btn.textContent = t.label;
            btn.addEventListener('click', () => this.setTrack(t.id));
            this.trackButtons.set(t.id, btn);
            filter.appendChild(btn);
        }
        this.el.appendChild(filter);

        this.listEl = document.createElement('div');
        this.listEl.className = 'lsn-list';
        this.el.appendChild(this.listEl);

        this.detailEl = document.createElement('div');
        this.detailEl.className = 'lsn-detail';
        this.el.appendChild(this.detailEl);

        this.toggleEl = document.createElement('button');
        this.toggleEl.id = 'lsn-toggle';
        this.toggleEl.type = 'button';
        this.toggleEl.setAttribute('aria-label', 'Open lessons');
        this.toggleEl.innerHTML = `<span class="dot"></span><span>Lessons</span>`;
        this.toggleEl.addEventListener('click', () => this.show());
        parent.appendChild(this.toggleEl);

        this.renderTrackButtons();
        this.renderList();
        this.unsubscribe = engine.subscribe((state) => this.renderDetail(state));
    }

    hide(): void {
        this.el.classList.add('is-hidden');
        this.toggleEl.classList.add('is-visible');
    }

    show(): void {
        this.el.classList.remove('is-hidden');
        this.toggleEl.classList.remove('is-visible');
    }

    dispose(): void {
        this.unsubscribe();
    }

    private setTrack(track: LessonTrack): void {
        this.track = track;
        this.renderTrackButtons();
        this.renderList();
    }

    private renderTrackButtons(): void {
        for (const [id, btn] of this.trackButtons) {
            btn.classList.toggle('is-active', id === this.track);
        }
    }

    private renderList(): void {
        this.listEl.replaceChildren();
        const lessons = this.engine.getLessons(this.track);
        const active = this.engine.getCurrentLesson();
        for (const lesson of lessons) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lsn-item';
            if (active && active.id === lesson.id) btn.classList.add('is-active');
            btn.textContent = lesson.title;
            btn.addEventListener('click', () => this.engine.selectLesson(lesson.id));
            this.listEl.appendChild(btn);
        }
    }

    private renderDetail(state: EngineState): void {
        this.detailEl.replaceChildren();
        // Keep the list selection highlight in sync with the engine.
        this.renderList();

        if (state.lesson === null) {
            const hint = document.createElement('p');
            hint.className = 'lsn-hint';
            hint.textContent = 'Pick a lesson above to begin.';
            this.detailEl.appendChild(hint);
            return;
        }

        const { lesson, step, stepIndex, stepCount, stepCompleted, lessonCompleted } = state;

        const title = document.createElement('h4');
        title.className = 'lsn-title';
        title.textContent = lesson.title;
        this.detailEl.appendChild(title);

        const audience = document.createElement('p');
        audience.className = 'lsn-audience';
        audience.textContent = lesson.audience;
        this.detailEl.appendChild(audience);

        const desc = document.createElement('p');
        desc.className = 'lsn-desc';
        desc.textContent = lesson.description;
        this.detailEl.appendChild(desc);

        const counter = document.createElement('div');
        counter.className = 'lsn-counter';
        counter.textContent = `Step ${stepIndex + 1} of ${stepCount}`;
        this.detailEl.appendChild(counter);

        const stepTitle = document.createElement('h5');
        stepTitle.className = 'lsn-step-title';
        stepTitle.textContent = step.title;
        this.detailEl.appendChild(stepTitle);

        const stepBody = document.createElement('p');
        stepBody.className = 'lsn-step-body';
        stepBody.textContent = step.body;
        this.detailEl.appendChild(stepBody);

        if (step.expectedMoves?.length) {
            const moves = document.createElement('div');
            moves.className = 'lsn-moves';
            moves.textContent = `Moves: ${step.expectedMoves.join(' ')}`;
            this.detailEl.appendChild(moves);
        }

        const status = document.createElement('div');
        status.className = stepCompleted ? 'lsn-status done' : 'lsn-status';
        status.textContent = stepCompleted
            ? lessonCompleted
                ? 'Lesson complete \u2713'
                : 'Step complete \u2713'
            : 'In progress';
        this.detailEl.appendChild(status);

        if (state.coachingMessages.length) {
            const coaching = document.createElement('div');
            coaching.className = 'lsn-coaching';
            for (const message of state.coachingMessages) {
                const item = document.createElement('div');
                item.className = `lsn-coaching-item ${message.kind}`;

                const itemTitle = document.createElement('strong');
                itemTitle.textContent = message.title;

                const itemBody = document.createElement('p');
                itemBody.textContent = message.body;

                item.appendChild(itemTitle);
                item.appendChild(itemBody);
                coaching.appendChild(item);
            }
            this.detailEl.appendChild(coaching);
        }

        const actions = document.createElement('div');
        actions.className = 'lsn-actions';

        if (step.setupMoves?.length) {
            actions.appendChild(this.button('Set up step', () => this.engine.applySetupMoves()));
        }
        if (step.expectedMoves?.length) {
            actions.appendChild(this.button('Apply example moves', () => this.engine.applyExampleMoves()));
        }
        if (step.validator.type === 'manual' && !stepCompleted) {
            actions.appendChild(this.button('Mark complete', () => this.engine.markComplete()));
        }
        this.detailEl.appendChild(actions);

        const nav = document.createElement('div');
        nav.className = 'lsn-actions';
        nav.appendChild(this.button('Previous', () => this.engine.previous(), stepIndex === 0));
        nav.appendChild(
            this.button('Next', () => this.engine.next(), stepIndex >= stepCount - 1)
        );
        nav.appendChild(this.button('Reset lesson', () => this.engine.resetLesson()));
        this.detailEl.appendChild(nav);
    }

    private button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lsn-btn';
        btn.textContent = label;
        btn.disabled = disabled;
        btn.addEventListener('click', onClick);
        return btn;
    }
}