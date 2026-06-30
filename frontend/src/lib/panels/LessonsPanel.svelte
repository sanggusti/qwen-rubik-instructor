<script lang="ts">
  import { lessonStore } from '../stores/lesson.svelte';
  import { cubeStore } from '../stores/cube.svelte';
  import { profileStore } from '../stores/profile.svelte';
  import { generateLesson } from '../api/narrate';
  import type { LessonTrack } from '../education/lesson_types';

  let { onSelect }: { onSelect?: () => void } = $props();

  const TRACKS: { id: LessonTrack; label: string }[] = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'time-improvement', label: 'Improve time' }
  ];

  let track = $state<LessonTrack>('beginner');
  let generating = $state(false);
  let generateStatus = $state('');

  const lessons = $derived(lessonStore.getLessons(track));
  const snapshot = $derived(lessonStore.snapshot);

  function selectLesson(id: string): void {
    lessonStore.selectLesson(id);
    onSelect?.();
  }

  async function runGenerate(): Promise<void> {
    generating = true;
    generateStatus = 'Asking Qwen to build a lesson…';
    try {
      const lesson = await generateLesson({
        state: cubeStore.getState(),
        level: profileStore.profile.level,
        method: profileStore.profile.method,
        history: profileStore.profile.history,
        onProgress: (done, total) => {
          generateStatus = `Generating… step ${done} of ${total}`;
        }
      });
      lessonStore.loadGenerated(lesson);
      profileStore.appendHistory({
        kind: 'lesson',
        method: profileStore.profile.method,
        stages: lesson.steps.length,
        at: new Date().toISOString()
      });
      onSelect?.();
    } catch (err) {
      generateStatus = `Couldn't generate: ${(err as Error).message}`;
    } finally {
      generating = false;
    }
  }
</script>

<div class="lsn-head">
  <h3>Lessons</h3>
</div>

<div class="lsn-filter">
  {#each TRACKS as t (t.id)}
    <button type="button" class="lsn-track" class:is-active={track === t.id} onclick={() => (track = t.id)}>
      {t.label}
    </button>
  {/each}
</div>

<div class="lsn-actions">
  <button type="button" class="lsn-btn" disabled={generating} onclick={runGenerate}>
    {generating ? 'Generating…' : 'Lesson from my cube (Qwen)'}
  </button>
</div>
{#if generateStatus}
  <p class="lsn-hint">{generateStatus}</p>
{/if}

<div class="lsn-list">
  {#each lessons as lesson (lesson.id)}
    <button
      type="button"
      class="lsn-item"
      class:is-active={snapshot.lesson?.id === lesson.id}
      onclick={() => selectLesson(lesson.id)}
    >
      {lesson.title}
    </button>
  {/each}
</div>

<div class="lsn-detail">
  {#if snapshot.lesson === null}
    <p class="lsn-hint">Pick a lesson above to begin.</p>
  {:else}
    {@const { lesson, step, stepIndex, stepCount, stepCompleted, lessonCompleted, coachingMessages } = snapshot}
    <h4 class="lsn-title">{lesson.title}</h4>
    <p class="lsn-audience">{lesson.audience}</p>
    <p class="lsn-desc">{lesson.description}</p>
    <div class="lsn-counter">Step {stepIndex + 1} of {stepCount}</div>
    <h5 class="lsn-step-title">{step.title}</h5>
    <p class="lsn-step-body">{step.body}</p>
    {#if step.expectedMoves?.length}
      <div class="lsn-moves">Moves: {step.expectedMoves.join(' ')}</div>
    {/if}
    <div class="lsn-status" class:done={stepCompleted}>
      {stepCompleted ? (lessonCompleted ? 'Lesson complete ✓' : 'Step complete ✓') : 'In progress'}
    </div>

    {#if coachingMessages.length}
      <div class="lsn-coaching">
        {#each coachingMessages as message, i (i)}
          <div class="lsn-coaching-item {message.kind}">
            <strong>{message.title}</strong>
            <p>{message.body}</p>
          </div>
        {/each}
      </div>
    {/if}

    <div class="lsn-actions">
      {#if step.setupMoves?.length}
        <button type="button" class="lsn-btn" onclick={() => lessonStore.applySetupMoves()}>Set up step</button>
      {/if}
      {#if step.expectedMoves?.length}
        <button type="button" class="lsn-btn" onclick={() => lessonStore.applyExampleMoves()}>Apply example moves</button>
      {/if}
      {#if step.validator.type === 'manual' && !stepCompleted}
        <button type="button" class="lsn-btn" onclick={() => lessonStore.markComplete()}>Mark complete</button>
      {/if}
    </div>

    <div class="lsn-actions">
      <button type="button" class="lsn-btn" disabled={stepIndex === 0} onclick={() => lessonStore.previous()}>Previous</button>
      <button type="button" class="lsn-btn" disabled={stepIndex >= stepCount - 1} onclick={() => lessonStore.next()}>Next</button>
      <button type="button" class="lsn-btn" onclick={() => lessonStore.resetLesson()}>Reset lesson</button>
    </div>
  {/if}
</div>

<style>
  h3 {
    margin: 0 0 10px;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--accent-a);
  }
  .lsn-filter {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .lsn-track,
  .lsn-item,
  .lsn-btn {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .lsn-track {
    flex: 1;
  }
  .lsn-track.is-active,
  .lsn-item.is-active {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .lsn-track:hover,
  .lsn-item:hover,
  .lsn-btn:hover:not(:disabled) {
    border-color: var(--accent-b-dim);
  }
  .lsn-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .lsn-item {
    text-align: left;
  }
  .lsn-detail {
    border-top: 1px solid var(--panel-border);
    padding-top: 10px;
  }
  .lsn-hint {
    color: var(--text-dim);
    margin: 4px 0;
  }
  .lsn-title {
    margin: 0 0 4px;
    font-size: 13px;
  }
  .lsn-audience {
    margin: 0 0 6px;
    color: var(--text-dim);
    font-size: 11px;
    font-style: italic;
  }
  .lsn-desc {
    margin: 0 0 8px;
    color: var(--text-dim);
  }
  .lsn-counter {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 4px;
  }
  .lsn-step-title {
    margin: 0 0 4px;
    font-size: 12px;
  }
  .lsn-step-body {
    margin: 0 0 8px;
  }
  .lsn-moves {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 7px;
    padding: 6px 8px;
    margin-bottom: 8px;
  }
  .lsn-status {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 10px;
  }
  .lsn-status.done {
    color: var(--ok);
    text-shadow: 0 0 10px var(--ok-dim);
  }
  .lsn-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .lsn-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .lsn-coaching {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }
  .lsn-coaching-item {
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 7px 8px;
    background: rgba(255, 255, 255, 0.04);
  }
  .lsn-coaching-item strong {
    display: block;
    margin-bottom: 3px;
    font-size: 11px;
    color: var(--accent-a);
  }
  .lsn-coaching-item p {
    margin: 0;
    color: var(--text-dim);
  }
  .lsn-coaching-item.mistake {
    border-color: var(--no-dim);
  }
  .lsn-coaching-item.mistake strong {
    color: var(--no);
  }
  .lsn-coaching-item.recommendation strong {
    color: var(--ok);
  }
</style>
