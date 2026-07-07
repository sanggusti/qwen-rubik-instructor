<script lang="ts">
  // Coursepath recap: lesson completion from rubik-lesson:{id} progress plus
  // the profile's walkthrough/lesson history. Deliberately NOT a
  // .content-section — only cube landing zones may use that class (the review
  // timeline measures them). All reads are synchronous localStorage; if this
  // ever loads async content, re-dispatch a window `resize` after it settles
  // so the cube flight path re-measures (see landing/LeaderboardSection.svelte).
  import { LESSON_CATALOG } from '../education/lesson_catalog';
  import { isLessonComplete } from '../education/lesson_progress';
  import { profileStore } from '../stores/profile.svelte';

  const lessons = LESSON_CATALOG.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    track: lesson.track,
    complete: isLessonComplete(lesson.id)
  }));
  const completedCount = lessons.filter((l) => l.complete).length;

  const history = profileStore.profile.history;
  const walkthroughCount = history.filter((h) => h.kind === 'walkthrough').length;
  const lessonRunCount = history.filter((h) => h.kind === 'lesson').length;
</script>

<section class="review-summary glass-panel">
  <h2 class="neon-heading summary-heading">Your coursepath</h2>
  <p class="summary-stats">
    {completedCount}/{lessons.length} lessons completed ·
    {walkthroughCount} walkthrough{walkthroughCount === 1 ? '' : 's'} ·
    {lessonRunCount} Qwen lesson{lessonRunCount === 1 ? '' : 's'}
  </p>
  <ul class="lesson-list">
    {#each lessons as lesson (lesson.id)}
      <li class:complete={lesson.complete}>
        <span class="mark" aria-hidden="true">{lesson.complete ? '✓' : '·'}</span>
        <span class="lesson-title">{lesson.title}</span>
        <span class="lesson-track">{lesson.track}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .review-summary {
    max-width: 720px;
    margin: 48px auto;
    padding: 32px 36px;
    border-radius: 18px;
  }

  .summary-heading {
    font-size: clamp(16px, 3vw, 24px);
    margin-bottom: 12px;
  }

  .summary-stats {
    color: var(--text-dim);
    margin-bottom: 20px;
  }

  .lesson-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lesson-list li {
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: var(--text-dim);
    line-height: 1.5;
  }

  .lesson-list li.complete {
    color: var(--text);
  }

  .mark {
    color: var(--accent-a);
    width: 14px;
  }

  .lesson-title {
    flex: 1;
  }

  .lesson-track {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  @media (max-width: 760px) {
    .review-summary {
      margin: 32px 20px;
      padding: 24px 20px;
    }
  }
</style>
