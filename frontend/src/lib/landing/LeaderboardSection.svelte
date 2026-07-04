<script lang="ts">
  import { goto } from '$app/navigation';
  import { fetchChallengeLeaderboard, type ChallengeEntry } from '../api/challenge';
  import { formatChallengeTime } from '../stores/challenge.svelte';

  let entries = $state<ChallengeEntry[] | null>(null);
  let loading = $state(true);

  $effect(() => {
    void fetchChallengeLeaderboard(10).then((result) => {
      entries = result;
      loading = false;
      // The section may have just appeared/disappeared, shifting every section
      // below it — nudge LandingPage's resize listener to re-measure the
      // scroll timeline.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
  });

  function entryBadge(entry: ChallengeEntry): string {
    if (entry.status === 'give_up') return 'Gave Up 😵';
    if (entry.rank === 1) return '🚀 Winner';
    if (entry.rank === 2) return '🔥 Second';
    return '✅ Solved';
  }

  function relativeDate(iso: string): string {
    const then = Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
    if (Number.isNaN(then)) return '';
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }
</script>

<section class="content-section leaderboard-section">
  <div class="cube-col" aria-hidden="true"></div>
  <div class="text-col glass-panel">
    {#if loading}
      <div class="skeleton" aria-busy="true"></div>
    {:else if entries && entries.length > 0}
      <h2 class="neon-heading section-heading">⚡ FASTEST SOLVERS</h2>
      <p class="intro">Challenge mode: one 20-move scramble, one clock. Beat them.</p>
      <table>
        <thead>
          <tr><th>#</th><th>Player</th><th>Best time</th><th></th><th>When</th></tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.rank)}
            <tr>
              <td class="rank">{entry.rank}</td>
              <td>{entry.username}</td>
              <td class="time">{formatChallengeTime(entry.bestMs)}</td>
              <td><span class="status-badge" class:give-up={entry.status === 'give_up'}>{entryBadge(entry)}</span></td>
              <td class="when">{relativeDate(entry.at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button class="challenge-btn" onclick={() => goto('/play?challenge=1')}>Challenge Me</button>
    {:else}
      <h2 class="neon-heading section-heading">⚡ FASTEST SOLVERS</h2>
      <p class="empty-msg">You wanna make first move?</p>
      <button class="challenge-btn" onclick={() => goto('/play?challenge=1')}>Challenge Me</button>
    {/if}
  </div>
</section>

<style>
  /* Grid mirrors ContentSection.svelte so the parked cube lines up. */
  .content-section {
    min-height: 60vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-areas: 'cube text';
    align-items: center;
    gap: 48px;
    padding: 80px 48px;
  }
  .cube-col {
    grid-area: cube;
    height: 420px;
  }
  .text-col {
    grid-area: text;
    padding: 40px;
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .skeleton {
    height: 160px;
    border-radius: 14px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    animation: pulse 1.2s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    from { opacity: 0.35; }
    to { opacity: 0.7; }
  }
  h2 {
    margin: 0;
    font-size: 20px;
    letter-spacing: 0.1em;
  }
  .intro {
    margin: 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 10px 12px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 10px;
    border-bottom: 1px solid var(--panel-border);
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--panel-border);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .rank {
    color: var(--accent-a);
  }
  .time {
    color: var(--accent-y);
    font-variant-numeric: tabular-nums;
  }
  .when {
    color: var(--text-dim);
    font-size: 11px;
  }
  .status-badge {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--accent-a);
  }
  .status-badge.give-up {
    color: var(--text-dim);
  }

  .empty-msg {
    margin: 0;
    color: var(--text-dim);
    font-size: 15px;
  }
  .challenge-btn {
    align-self: flex-start;
    margin-top: 4px;
    padding: 10px 22px;
    background: var(--accent-a);
    color: #000;
    border: none;
    border-radius: 10px;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .challenge-btn:hover {
    filter: brightness(1.15);
  }

  @media (max-width: 760px) {
    .content-section {
      grid-template-columns: 1fr;
      grid-template-areas: 'cube' 'text';
      gap: 24px;
      padding: 48px 20px;
    }
    .cube-col {
      height: 280px;
    }
    .text-col {
      padding: 24px 20px;
    }
    .when {
      display: none;
    }
  }
</style>
