<script lang="ts">
  import { cubeViewStore } from '../stores/cube-view.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';
  import { generateSolveWalkthrough } from '../education/generate';
  import type { CubeletType } from '../scene/cubelets';

  let { onPlay, onSelectWalkthrough }: { onPlay?: () => void; onSelectWalkthrough?: () => void } = $props();

  let generating = $state(false);
  let generateStatus = $state('');

  const HIGHLIGHTS: { type: CubeletType | null; label: string }[] = [
    { type: 'center', label: 'Centres' },
    { type: 'edge', label: 'Edges' },
    { type: 'corner', label: 'Corners' },
    { type: 'core', label: 'Core' },
    { type: null, label: 'Show all' }
  ];

  const walkthroughs = $derived(walkthroughStore.getWalkthroughs());
  const snapshot = $derived(walkthroughStore.snapshot);

  // For long solves, show a window of move chips around the active move so it
  // never overflows the panel width.
  const MAX_MOVES = 16;
  const movesWindow = $derived.by(() => {
    const s = snapshot;
    if (s.walkthrough === null) return null;
    const moves = s.beat.moves ?? [];
    if (!moves.length) return null;
    let start = 0;
    let end = moves.length;
    if (moves.length > MAX_MOVES) {
      const focus = s.moveIndex < 0 ? 0 : s.moveIndex;
      end = Math.min(moves.length, Math.max(focus + Math.ceil(MAX_MOVES / 2), MAX_MOVES));
      start = Math.max(0, end - MAX_MOVES);
    }
    return { moves, start, end, activeIndex: s.moveIndex };
  });

  function selectWalkthrough(id: string): void {
    walkthroughStore.select(id);
    onSelectWalkthrough?.();
  }

  function play(): void {
    walkthroughStore.play();
    onPlay?.();
  }

  async function runGenerate(): Promise<void> {
    generating = true;
    try {
      await generateSolveWalkthrough((msg) => (generateStatus = msg));
      onPlay?.();
    } catch (err) {
      generateStatus = `Couldn't generate: ${(err as Error).message}`;
    } finally {
      generating = false;
    }
  }
</script>

<div class="exp-head">
  <h3>Explore</h3>
</div>

<div class="exp-section">Highlight pieces</div>
<div class="exp-row">
  {#each HIGHLIGHTS as h (h.type ?? 'all')}
    <button
      type="button"
      class="exp-btn"
      class:is-active={h.type === null ? cubeViewStore.highlightType === null : cubeViewStore.highlightType === h.type}
      onclick={() => cubeViewStore.highlight(h.type)}
    >
      {h.label}
    </button>
  {/each}
</div>

<div class="exp-section">Labels</div>
<div class="exp-row">
  <button type="button" class="exp-btn" class:is-active={cubeViewStore.facesOn} onclick={() => cubeViewStore.setFaceLabels(!cubeViewStore.facesOn)}>
    Faces
  </button>
  <button type="button" class="exp-btn" class:is-active={cubeViewStore.numbersOn} onclick={() => cubeViewStore.setNumbers(!cubeViewStore.numbersOn)}>
    Numbers
  </button>
</div>

<div class="exp-section">Watch &amp; learn</div>
<div class="exp-row">
  <button type="button" class="exp-btn" disabled={generating} onclick={runGenerate}>
    {generating ? 'Generating…' : 'Solve my cube (Qwen)'}
  </button>
</div>
{#if generateStatus}
  <p class="exp-hint">{generateStatus}</p>
{/if}
<div class="exp-list">
  {#each walkthroughs as w (w.id)}
    <button type="button" class="exp-item" class:is-active={snapshot.walkthrough?.id === w.id} onclick={() => selectWalkthrough(w.id)}>
      {w.title}
    </button>
  {/each}
</div>

<div class="exp-player">
  {#if snapshot.walkthrough === null}
    <p class="exp-hint">Pick a walkthrough to watch.</p>
  {:else}
    {@const s = snapshot}
    <div class="exp-counter">
      {s.finished ? `Finished · ${s.beatCount} beats` : `Beat ${s.beatIndex + 1} of ${s.beatCount}`}
    </div>

    {#if movesWindow}
      <div class="exp-moves">
        {#if movesWindow.start > 0}<span class="exp-move-ellipsis">…</span>{/if}
        {#each movesWindow.moves.slice(movesWindow.start, movesWindow.end) as move, i (movesWindow.start + i)}
          <span class="exp-move-chip" class:is-active={movesWindow.start + i === movesWindow.activeIndex}>{move}</span>
        {/each}
        {#if movesWindow.end < movesWindow.moves.length}<span class="exp-move-ellipsis">…</span>{/if}
      </div>
    {/if}

    <div class="exp-row">
      <button type="button" class="exp-btn" disabled={s.beatIndex === 0} onclick={() => walkthroughStore.previous()}>Prev</button>
      {#if s.playing}
        <button type="button" class="exp-btn" onclick={() => walkthroughStore.pause()}>Pause</button>
      {:else}
        <button type="button" class="exp-btn" onclick={play}>Play</button>
      {/if}
      <button type="button" class="exp-btn" disabled={s.beatIndex >= s.beatCount - 1} onclick={() => walkthroughStore.next()}>Next</button>
      <button type="button" class="exp-btn" onclick={() => walkthroughStore.stop()}>Stop</button>
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
  .exp-section {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin: 10px 0 6px;
  }
  .exp-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .exp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }
  .exp-btn,
  .exp-item {
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
  .exp-item {
    text-align: left;
  }
  .exp-btn.is-active,
  .exp-item.is-active {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .exp-btn:hover:not(:disabled),
  .exp-item:hover {
    border-color: var(--accent-b-dim);
  }
  .exp-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .exp-player {
    border-top: 1px solid var(--panel-border);
    padding-top: 10px;
  }
  .exp-hint {
    color: var(--text-dim);
    margin: 4px 0 8px;
  }
  .exp-counter {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 6px;
  }
  .exp-moves {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.04);
    border-radius: 7px;
    padding: 6px 8px;
    margin-bottom: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .exp-move-chip {
    padding: 1px 5px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--accent-a);
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .exp-move-chip.is-active {
    background: var(--accent-b);
    color: var(--bg-deep);
    font-weight: 700;
    transform: scale(1.12);
    box-shadow: 0 0 10px var(--accent-b-dim);
  }
  .exp-move-ellipsis {
    color: var(--accent-a);
    opacity: 0.6;
  }
</style>
