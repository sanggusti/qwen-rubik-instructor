// A simple DOM panel for the lessons subsystem, in the spirit of DebuggerPanel.
// No UI framework: plain DOM updated from the engine's snapshots.

import type { LessonEngine, EngineState } from '../education/lesson_engine';
import type { LessonTrack } from '../education/lesson_types';
import { loadProfile } from '../education/profile';

const TRACKS: { id: LessonTrack; label: string }[] = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'time-improvement', label: 'Improve time' }
];

export interface AskContext {
    question: string;
    stage?: string;
    moves?: string[];
}

export class LessonsPanel {
    readonly el: HTMLDivElement;
    private listEl!: HTMLDivElement;
    private detailEl!: HTMLDivElement;
    private trackButtons = new Map<LessonTrack, HTMLButtonElement>();

    private readonly engine: LessonEngine;
    private readonly onSelect?: () => void;
    private readonly onGenerate?: (report: (done: number, total: number) => void) => Promise<void>;
    private readonly onAsk?: (req: AskContext) => Promise<string>;
    private track: LessonTrack = 'beginner';
    private unsubscribe: () => void;
    private generateBtn?: HTMLButtonElement;
    private generateStatus?: HTMLParagraphElement;
    // The persistent "Ask Qwen" box, kept outside the re-rendered detail so a
    // typed question survives the learner's moves. Context comes from the engine.
    private askWrap?: HTMLDivElement;
    private askInput?: HTMLInputElement;
    private askAnswer?: HTMLParagraphElement;
    private askContext: AskContext | null = null;

    constructor(
        parent: HTMLElement,
        engine: LessonEngine,
        onSelect?: () => void,
        onGenerate?: (report: (done: number, total: number) => void) => Promise<void>,
        onAsk?: (req: AskContext) => Promise<string>
    ) {
        this.engine = engine;
        this.onSelect = onSelect;
        this.onGenerate = onGenerate;
        this.onAsk = onAsk;

        this.el = document.createElement('div');
        this.el.id = 'lessons';
        parent.appendChild(this.el);

        const head = document.createElement('div');
        head.className = 'lsn-head';
        const title = document.createElement('h3');
        title.textContent = 'Lessons';
        head.appendChild(title);
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

        if (this.onGenerate) {
            const row = document.createElement('div');
            row.className = 'lsn-actions';
            this.generateBtn = document.createElement('button');
            this.generateBtn.type = 'button';
            this.generateBtn.className = 'lsn-btn';
            this.generateBtn.textContent = 'Lesson from my cube (Qwen)';
            this.generateBtn.addEventListener('click', () => this.runGenerate());
            row.appendChild(this.generateBtn);
            this.el.appendChild(row);

            this.generateStatus = document.createElement('p');
            this.generateStatus.className = 'lsn-hint';
            this.el.appendChild(this.generateStatus);
        }

        this.listEl = document.createElement('div');
        this.listEl.className = 'lsn-list';
        this.el.appendChild(this.listEl);

        this.detailEl = document.createElement('div');
        this.detailEl.className = 'lsn-detail';
        this.el.appendChild(this.detailEl);

        if (this.onAsk) this.buildAskBox();

        this.renderTrackButtons();
        this.renderList();
        this.unsubscribe = engine.subscribe((state) => this.renderDetail(state));
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
        // Beginner lessons unlock in order: a stage opens once the prior one has
        // been completed at least once, so the path is followed top to bottom.
        const performance = loadProfile().performance;
        const gated = this.track === 'beginner';
        let prevDone = true; // the first lesson is always open
        for (const lesson of lessons) {
            const locked = gated && !prevDone;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lsn-item';
            if (active && active.id === lesson.id) btn.classList.add('is-active');
            if (locked) {
                btn.classList.add('is-locked');
                btn.disabled = true;
                btn.title = 'Complete the previous lesson to unlock this one.';
                btn.textContent = `🔒 ${lesson.title}`;
            } else {
                btn.textContent = lesson.title;
                btn.addEventListener('click', () => {
                    this.engine.selectLesson(lesson.id);
                    this.onSelect?.();
                });
            }
            this.listEl.appendChild(btn);
            const attempted = (performance[lesson.stage ?? lesson.id]?.attempts ?? 0) > 0;
            prevDone = attempted;
        }
    }

    private renderDetail(state: EngineState): void {
        this.detailEl.replaceChildren();
        // Keep the list selection highlight in sync with the engine.
        this.renderList();

        if (state.lesson === null) {
            this.askContext = null;
            if (this.askWrap) this.askWrap.hidden = true;
            const hint = document.createElement('p');
            hint.className = 'lsn-hint';
            hint.textContent = 'Pick a lesson above to begin.';
            this.detailEl.appendChild(hint);
            return;
        }

        const { lesson, step, stepIndex, stepCount, stepCompleted, lessonCompleted } = state;

        // Update the persistent ask box's grounding context for this step.
        this.askContext = {
            question: '',
            stage: lesson.stage ?? lesson.id,
            moves: step.expectedMoves ?? (step.validator.type === 'moveSequence' ? step.validator.moves : [])
        };
        if (this.askWrap) this.askWrap.hidden = false;

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

        // Rescue: reveal just the single next move without playing the sequence.
        // The revealed text persists until the learner's next move re-renders.
        if (step.validator.type === 'moveSequence' && !stepCompleted) {
            const rescue = document.createElement('div');
            rescue.className = 'lsn-actions';
            const revealed = document.createElement('span');
            revealed.className = 'lsn-hint';
            rescue.appendChild(
                this.button('Show next move', () => {
                    const move = this.engine.nextExpectedMove();
                    revealed.textContent = move ? `Next move: ${move}` : 'You’re on the last move.';
                })
            );
            rescue.appendChild(revealed);
            this.detailEl.appendChild(rescue);
        }

        const nav = document.createElement('div');
        nav.className = 'lsn-actions';
        nav.appendChild(this.button('Previous', () => this.engine.previous(), stepIndex === 0));
        nav.appendChild(
            this.button('Next', () => this.engine.next(), stepIndex >= stepCount - 1)
        );
        nav.appendChild(this.button('Reset lesson', () => this.engine.resetLesson()));
        this.detailEl.appendChild(nav);
    }

    private async runGenerate(): Promise<void> {
        if (!this.onGenerate || !this.generateBtn) return;
        this.generateBtn.disabled = true;
        this.generateBtn.textContent = 'Generating…';
        if (this.generateStatus) this.generateStatus.textContent = 'Asking Qwen to build a lesson…';
        try {
            await this.onGenerate((done, total) => {
                if (this.generateStatus) {
                    this.generateStatus.textContent = `Generating… step ${done} of ${total}`;
                }
            });
            if (this.generateStatus) this.generateStatus.textContent = 'Lesson ready below.';
            this.renderList();
        } catch (err) {
            if (this.generateStatus) {
                this.generateStatus.textContent = `Couldn't generate: ${(err as Error).message}`;
            }
        } finally {
            this.generateBtn.disabled = false;
            this.generateBtn.textContent = 'Lesson from my cube (Qwen)';
        }
    }

    // The "Ask Qwen" box: a free-form question plus an "Explain differently"
    // shortcut (the rescue funnel from coaching). Lives outside detailEl so it
    // isn't wiped when the learner's moves re-render the step.
    private buildAskBox(): void {
        const wrap = document.createElement('div');
        wrap.className = 'lsn-ask';
        wrap.hidden = true;

        const label = document.createElement('p');
        label.className = 'lsn-hint';
        label.textContent = 'Stuck? Ask Qwen about this step.';
        wrap.appendChild(label);

        const row = document.createElement('div');
        row.className = 'lsn-actions';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lsn-ask-input';
        input.placeholder = 'e.g. why this move?';
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.runAsk(input.value);
        });
        row.appendChild(input);
        row.appendChild(this.button('Ask', () => this.runAsk(input.value)));
        row.appendChild(
            this.button('Explain differently', () =>
                this.runAsk('I’m stuck on this step. Can you explain it a different way?')
            )
        );
        wrap.appendChild(row);

        const answer = document.createElement('p');
        answer.className = 'lsn-ask-answer';
        wrap.appendChild(answer);

        this.el.appendChild(wrap);
        this.askWrap = wrap;
        this.askInput = input;
        this.askAnswer = answer;
    }

    private async runAsk(question: string): Promise<void> {
        const q = question.trim();
        if (!q || !this.onAsk || !this.askContext || !this.askAnswer) return;
        this.askAnswer.textContent = 'Asking Qwen…';
        try {
            this.askAnswer.textContent = await this.onAsk({ ...this.askContext, question: q });
            if (this.askInput) this.askInput.value = '';
        } catch (err) {
            this.askAnswer.textContent = `Couldn't ask: ${(err as Error).message}`;
        }
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