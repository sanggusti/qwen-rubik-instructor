<script lang="ts">
  // The move sequence shown on top of the demo cube. The move that was just
  // applied is bold + accented; already-played moves fade back to normal, and
  // upcoming moves stay muted — so the learner can read the sequence as it plays.
  // Long stages are windowed to a handful of chips around the active move (with
  // "…" on the clipped ends) so the row stays readable instead of overflowing.
  import { moveWindow } from './move-window';

  let { moves, activeIndex }: { moves: string[]; activeIndex: number } = $props();

  const MAX_CHIPS = 10;
  const view = $derived(moveWindow(moves.length, activeIndex, MAX_CHIPS));
  // 1-based position of the active move (0 before playback), for the counter.
  const position = $derived(Math.min(Math.max(activeIndex + 1, 0), moves.length));
</script>

{#if moves.length}
  <div class="seq" aria-label="Move sequence">
    {#if view.start > 0}<span class="seq-ellipsis" aria-hidden="true">…</span>{/if}
    {#each moves.slice(view.start, view.end) as move, i (view.start + i)}
      {@const idx = view.start + i}
      <span class="seq-move" class:active={idx === activeIndex} class:done={idx < activeIndex}>{move}</span>
    {/each}
    {#if view.end < moves.length}<span class="seq-ellipsis" aria-hidden="true">…</span>{/if}
    {#if moves.length > MAX_CHIPS}
      <span class="seq-count" aria-label={`Move ${position} of ${moves.length}`}>{position}/{moves.length}</span>
    {/if}
  </div>
{/if}

<style>
  .seq {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 5px;
    padding: 8px 6px;
  }
  .seq-move {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--text-dim);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    padding: 2px 8px;
    transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .seq-move.done {
    color: var(--text);
    opacity: 0.7;
  }
  .seq-move.active {
    font-weight: 700;
    color: var(--bg-deep);
    background: var(--accent-b);
    border-color: var(--accent-b);
    box-shadow: 0 0 12px var(--accent-b-dim);
  }
  .seq-ellipsis {
    align-self: center;
    color: var(--text-dim);
    font-size: 14px;
    letter-spacing: 0.1em;
  }
  .seq-count {
    align-self: center;
    margin-left: 3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
