<script lang="ts">
  // Practice recap: best times from rubik-best:{id} plus the profile's
  // per-stage attempt/mistake stats. Deliberately NOT a .content-section (see
  // CoursepathSummary for the measuring rule).
  import { PRACTICE_DRILLS } from '../education/practice_drills';
  import { profileStore } from '../stores/profile.svelte';

  function bestMs(drillId: string): number | null {
    try {
      const raw = localStorage?.getItem(`rubik-best:${drillId}`);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  function formatMs(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const performance = profileStore.profile.performance;
  const drills = PRACTICE_DRILLS.map((drill) => {
    const stat = performance[drill.id];
    return {
      id: drill.id,
      title: drill.title,
      best: bestMs(drill.id) ?? stat?.bestMs ?? null,
      attempts: stat?.attempts ?? 0,
      mastered: stat?.mastered ?? false
    };
  }).filter((d) => d.attempts > 0 || d.best !== null);
</script>

<section class="review-summary glass-panel">
  <h2 class="neon-heading summary-heading">Your practice</h2>
  {#if drills.length === 0}
    <p class="summary-empty">
      No drills attempted yet — the Practice tab on the play screen has timed drills for
      every stage of the solve.
    </p>
  {:else}
    <ul class="drill-list">
      {#each drills as drill (drill.id)}
        <li class:mastered={drill.mastered}>
          <span class="mark" aria-hidden="true">{drill.mastered ? '★' : '·'}</span>
          <span class="drill-title">{drill.title}</span>
          <span class="drill-stats">
            {#if drill.best !== null}{formatMs(drill.best)} best · {/if}
            {drill.attempts} attempt{drill.attempts === 1 ? '' : 's'}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
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

  .summary-empty {
    color: var(--text-dim);
    line-height: 1.6;
    margin: 0;
  }

  .drill-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .drill-list li {
    display: flex;
    align-items: baseline;
    gap: 10px;
    color: var(--text-dim);
    line-height: 1.5;
  }

  .drill-list li.mastered {
    color: var(--text);
  }

  .mark {
    color: var(--accent-y);
    width: 14px;
  }

  .drill-title {
    flex: 1;
  }

  .drill-stats {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 760px) {
    .review-summary {
      margin: 32px 20px;
      padding: 24px 20px;
    }
  }
</style>
