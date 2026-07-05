<script lang="ts">
  import { fetchChallengeLeaderboard, type ChallengeEntry } from '../api/challenge';
  import { authStore } from '../auth/store.svelte';
  import { formatChallengeTime } from '../stores/challenge.svelte';

  let {
    solveTimeMs,
    gaveUp = false,
    onPlayAgain,
    onGoHome
  }: {
    solveTimeMs: number;
    gaveUp?: boolean;
    onPlayAgain: () => void;
    onGoHome: () => void;
  } = $props();

  let entries = $state<ChallengeEntry[] | null>(null);
  let loading = $state(true);

  function entryBadge(entry: ChallengeEntry): string {
    if (entry.status === 'give_up') return 'Gave Up 😵';
    if (entry.rank === 1) return '🚀 Winner';
    if (entry.rank === 2) return '🔥 Second';
    return '✅ Solved';
  }

  $effect(() => {
    void fetchChallengeLeaderboard(10).then((result) => {
      entries = result;
      loading = false;
    });
  });
</script>

<div class="leaderboard-modal">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Leaderboard">
    <h2>{gaveUp ? '😓 Gave Up' : '🏁 Solved!'}</h2>
    <p class="your-time">
      {gaveUp ? 'Time at give-up:' : 'Your time:'}
      <b>{formatChallengeTime(solveTimeMs)}</b>
    </p>

    {#if loading}
      <p class="note">Loading leaderboard…</p>
    {:else if entries && entries.length > 0}
      <table>
        <thead>
          <tr><th>#</th><th>Player</th><th>Best</th><th></th></tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.rank)}
            <tr class:is-you={entry.username === authStore.member?.username}>
              <td>{entry.rank}</td>
              <td>{entry.username}</td>
              <td>{formatChallengeTime(entry.bestMs)}</td>
              <td><span class="status-badge" class:give-up={entry.status === 'give_up'}>{entryBadge(entry)}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note">Leaderboard is unavailable right now — but your time was recorded.</p>
    {/if}

    <div class="actions">
      <button type="button" class="primary" onclick={onPlayAgain}>Play Again</button>
      <button type="button" class="ghost" onclick={onGoHome}>Go Home</button>
    </div>
  </div>
</div>

<style>
  .leaderboard-modal {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 1, 6, 0.6);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(92vw, 420px);
    max-height: 84vh;
    overflow-y: auto;
    padding: 22px;
    border-radius: 14px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  }
  h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-y);
  }
  .your-time {
    margin: 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .your-time b {
    color: var(--accent-y);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    padding: 6px 8px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 10px;
    border-bottom: 1px solid var(--panel-border);
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--panel-border);
    font-variant-numeric: tabular-nums;
  }
  tr.is-you td {
    color: var(--accent-a);
    background: var(--accent-a-bg);
  }
  .status-badge {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--accent-a);
  }
  .status-badge.give-up {
    color: var(--text-dim);
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  .primary,
  .ghost {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 12px;
    border-radius: 8px;
    flex: 1;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .primary {
    color: var(--accent-a);
    background: var(--panel-bg);
    border: 1px solid var(--accent-a);
  }
  .primary:hover {
    box-shadow: 0 0 18px var(--accent-a-dim);
  }
  .ghost {
    color: var(--text-dim);
    background: transparent;
    border: 1px solid var(--panel-border);
  }
  .ghost:hover {
    border-color: var(--accent-b-dim);
  }
</style>
