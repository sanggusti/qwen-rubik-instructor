<script lang="ts">
  import { fetchChallengeLeaderboard, type ChallengeEntry } from '../api/challenge';
  import { formatChallengeTime } from '../stores/challenge.svelte';

  // Public top-10 of challenge mode. Hides itself entirely when the board is
  // empty or the backend is down — the landing page reads fine without it.
  //
  // Renders a `.content-section` grid (cube spacer + text panel) so the
  // persistent LandingScene cube parks in the spacer, and the scroll timeline
  // (LandingPage measure()) picks this section up like any other.
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

{#if loading || (entries && entries.length > 0)}
  <section class="content-section leaderboard-section">
    <div class="cube-col" aria-hidden="true"></div>
    <div class="text-col glass-panel">
      {#if loading}
        <div class="skeleton" aria-busy="true"></div>
      {:else if entries}
        <h2 class="neon-heading section-heading">⚡ FASTEST SOLVERS</h2>
        <p class="intro">Challenge mode: one 20-move scramble, one clock. Beat them.</p>
        <table>
          <thead>
            <tr><th>#</th><th>Player</th><th>Best time</th><th>When</th></tr>
          </thead>
          <tbody>
            {#each entries as entry (entry.rank)}
              <tr>
                <td class="rank">{entry.rank}</td>
                <td>{entry.username}</td>
                <td class="time">{formatChallengeTime(entry.bestMs)}</td>
                <td class="when">{relativeDate(entry.at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </section>
{/if}

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
