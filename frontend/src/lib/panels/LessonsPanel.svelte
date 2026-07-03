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
        memory: profileStore.memoryDigest(),
        userId: profileStore.profile.sessionId,
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
  .lsn-hint {
    color: var(--text-dim);
    margin: 4px 0;
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
</style>
