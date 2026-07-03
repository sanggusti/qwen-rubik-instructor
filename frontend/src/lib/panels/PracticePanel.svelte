<script lang="ts">
  import { practiceStore } from '../stores/practice.svelte';
  import { selectDrills } from '../education/drill_generator';
  import type { DrillCategory, DrillDifficulty } from '../education/practice_types';
  import { loadProfile } from '../education/profile';
  import {
    fetchLeaderboard,
    getHandle,
    recordAttempt,
    setHandle,
    syncProfile,
    type LeaderboardEntry
  } from '../api/memory';

  let { onSelect }: { onSelect?: () => void } = $props();

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

  let category = $state<DrillCategory | 'all'>('all');
  let difficulty = $state<DrillDifficulty | 'all'>('all');
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => { now = Date.now(); }, 100);
    return () => clearInterval(id);
  });

  const snapshot = $derived(practiceStore.snapshot);
  const drills = $derived(
    selectDrills(practiceStore.getDrills(), {
      category: category === 'all' ? undefined : category,
      difficulty: difficulty === 'all' ? undefined : difficulty
    })
  );

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

  let board = $state<LeaderboardEntry[] | null>(null);
  let handle = $state(getHandle() ?? '');
  // The completion effect re-runs on any snapshot change; only report each
  // finished attempt (same drill + same start time) to the backend once.
  let lastReported = '';

  function saveHandle(): void {
    setHandle(handle);
    void syncProfile(loadProfile());
  }

  // Persist a new personal best as soon as a drill completes, and mirror the
  // attempt + profile to the backend (fire-and-forget; silent when offline).
  $effect(() => {
    const s = snapshot;
    if (s.drill !== null && s.completed && s.solveMs != null) {
      recordBest(s.drill.id, s.solveMs);
      const key = `${s.drill.id}:${s.startedAt ?? 0}`;
      if (key !== lastReported) {
        lastReported = key;
        const drillId = s.drill.id;
        void recordAttempt({
          userId: loadProfile().sessionId,
          drillId,
          durationMs: s.solveMs
        }).then(() => fetchLeaderboard(drillId)).then((entries) => {
          board = entries;
        });
        void syncProfile(loadProfile());
      }
    } else {
      board = null;
    }
  });

  const timerText = $derived.by(() => {
    const s = snapshot;
    if (s.drill === null) return '';
    const best = getBest(s.drill.id);
    const bestStr = best != null ? ` · best ${fmtTime(best)}` : '';
    if (s.completed && s.solveMs != null) return `Time ${fmtTime(s.solveMs)}${bestStr}`;
    if (s.startedAt != null) return `Time ${fmtTime(now - s.startedAt)}${bestStr}`;
    return `Time —${bestStr}`;
  });

  function selectDrill(id: string): void {
    practiceStore.selectDrill(id);
    onSelect?.();
  }
</script>

<div class="prc-head">
  <h3>Practice</h3>
</div>

<div class="prc-filter">
  {#each CATEGORIES as c (c.id)}
    <button type="button" class="prc-cat" class:is-active={category === c.id} onclick={() => (category = c.id)}>
      {c.label}
    </button>
  {/each}
</div>
<div class="prc-filter">
  {#each DIFFICULTIES as d (d.id)}
    <button type="button" class="prc-cat" class:is-active={difficulty === d.id} onclick={() => (difficulty = d.id)}>
      {d.label}
    </button>
  {/each}
</div>

<div class="prc-list">
  {#each drills as drill (drill.id)}
    <button
      type="button"
      class="prc-item"
      class:is-active={snapshot.drill?.id === drill.id}
      onclick={() => selectDrill(drill.id)}
    >
      {drill.title} · {drill.difficulty}
    </button>
  {/each}
</div>

<div class="prc-detail">
  {#if snapshot.drill === null}
    <p class="prc-hint">Pick a drill above to begin.</p>
  {:else}
    {@const { drill, round, roundCount, score, completed, evaluation } = snapshot}
    <h4 class="prc-title">{drill.title}</h4>
    <p class="prc-meta">{drill.category} · {drill.difficulty}</p>
    <p class="prc-prompt">{drill.prompt}</p>
    <div class="prc-counter">Round {Math.min(round + 1, roundCount)} of {roundCount} · Score {score}</div>
    <div class="prc-timer">{timerText}</div>
    <div class="prc-feedback {completed ? 'correct' : evaluation.status}">
      {completed ? `Drill complete ✓ Score ${score}/${roundCount}` : evaluation.message}
    </div>
    <div class="prc-actions">
      {#if drill.setupMoves?.length}
        <button type="button" class="prc-btn" onclick={() => practiceStore.applySetupMoves()}>Set up</button>
      {/if}
      {#if drill.expectedMoves?.length}
        <button type="button" class="prc-btn" onclick={() => practiceStore.applyExampleMoves()}>Apply example moves</button>
      {/if}
      <button type="button" class="prc-btn" onclick={() => practiceStore.resetDrill()}>Reset drill</button>
    </div>
    {#if completed && board !== null && board.length > 0}
      <div class="prc-board">
        <div class="prc-board-title">Fastest solves</div>
        <ol class="prc-board-list">
          {#each board.slice(0, 5) as entry (entry.userId)}
            <li><span class="prc-board-handle">{entry.handle}</span> · {fmtTime(entry.bestMs)}</li>
          {/each}
        </ol>
        <label class="prc-handle">
          Name on leaderboard
          <input type="text" maxlength="24" bind:value={handle} onchange={saveHandle} placeholder="anonymous" />
        </label>
      </div>
    {/if}
  {/if}
</div>

<style>
  h3 {
    margin: 0 0 10px;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--accent-a);
  }
  .prc-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .prc-cat,
  .prc-item,
  .prc-btn {
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
  .prc-cat {
    flex: 1;
  }
  .prc-cat.is-active,
  .prc-item.is-active {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .prc-cat:hover,
  .prc-item:hover,
  .prc-btn:hover:not(:disabled) {
    border-color: var(--accent-b-dim);
  }
  .prc-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .prc-item {
    text-align: left;
  }
  .prc-detail {
    border-top: 1px solid var(--panel-border);
    padding-top: 10px;
  }
  .prc-hint {
    color: var(--text-dim);
    margin: 4px 0;
  }
  .prc-title {
    margin: 0 0 4px;
    font-size: 13px;
  }
  .prc-meta {
    margin: 0 0 6px;
    color: var(--text-dim);
    font-size: 11px;
    text-transform: capitalize;
  }
  .prc-prompt {
    margin: 0 0 8px;
    color: var(--text-dim);
  }
  .prc-counter {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 8px;
  }
  .prc-timer {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    color: var(--accent-b);
    margin-bottom: 8px;
  }
  .prc-feedback {
    font-size: 12px;
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 7px 8px;
    margin-bottom: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-dim);
  }
  .prc-feedback.correct {
    border-color: var(--ok-dim);
    color: var(--ok);
  }
  .prc-feedback.wrong {
    border-color: var(--no-dim);
    color: var(--no);
  }
  .prc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .prc-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .prc-board {
    margin-top: 10px;
    border-top: 1px solid var(--panel-border);
    padding-top: 8px;
  }
  .prc-board-title {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 6px;
  }
  .prc-board-list {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .prc-board-handle {
    color: var(--text);
  }
  .prc-handle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-dim);
  }
  .prc-handle input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
    font-size: 12px;
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 5px 8px;
  }
</style>
