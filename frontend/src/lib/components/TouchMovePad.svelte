<script lang="ts">
  import { cubeStore } from '../stores/cube.svelte';

  let { open, onClose }: { open: boolean; onClose?: () => void } = $props();

  // Face moves and slice/rotation moves are grouped separately for visual clarity.
  const FACE_MOVES = ['U', 'D', 'L', 'R', 'F', 'B'];
  const SLICE_MOVES = ['M', 'E', 'S'];
  const ROTATIONS = ['x', 'y', 'z'];

  let prime = $state(false);

  function tapMove(base: string): void {
    cubeStore.applyMoves(prime ? base + "'" : base);
    prime = false;
  }
</script>

{#if open}
  <div class="touch-move-pad">
    <div class="pad-header">
      <span class="pad-title">Moves</span>
      <button
        type="button"
        class="prime"
        class:active={prime}
        onclick={() => (prime = !prime)}
        aria-pressed={prime}
        title="Prime (reverse) modifier"
      >
        ' {prime ? 'ON' : 'OFF'}
      </button>
      {#if onClose}
        <button type="button" class="close-btn" onclick={onClose} aria-label="Close keypad">✕</button>
      {/if}
    </div>

    <div class="group">
      <span class="group-label">Face</span>
      <div class="grid grid-3">
        {#each FACE_MOVES as base (base)}
          <button type="button" onclick={() => tapMove(base)}>{base}</button>
        {/each}
      </div>
    </div>

    <div class="group">
      <span class="group-label">Slice</span>
      <div class="grid grid-3">
        {#each SLICE_MOVES as base (base)}
          <button type="button" onclick={() => tapMove(base)}>{base}</button>
        {/each}
        {#each ROTATIONS as base (base)}
          <button type="button" class="rotation" onclick={() => tapMove(base)}>{base}</button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .touch-move-pad {
    position: fixed;
    right: 10px;
    bottom: calc(80px + max(12px, env(safe-area-inset-bottom)));
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 16px;
    background: rgba(7, 3, 13, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px) saturate(140%);
    touch-action: none;
    width: min(200px, calc(100vw - 20px));
  }

  .pad-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .pad-title {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    flex: 1;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group-label {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    opacity: 0.6;
  }

  .grid {
    display: grid;
    gap: 5px;
  }
  .grid-3 {
    grid-template-columns: repeat(3, 1fr);
  }

  button {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    min-height: 44px;
    transition: background 0.1s ease, border-color 0.1s ease;
  }
  button:active {
    background: rgba(255, 255, 255, 0.18);
  }

  .rotation {
    color: var(--accent-b);
    border-color: rgba(var(--accent-b-raw, 120, 160, 255), 0.25);
  }

  .prime {
    min-width: unset;
    min-height: unset;
    padding: 4px 8px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 6px;
  }
  .prime.active {
    color: var(--accent-b);
    border-color: var(--accent-b);
    background: var(--accent-b-bg);
  }

  .close-btn {
    min-width: unset;
    min-height: unset;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    font-size: 13px;
    display: grid;
    place-items: center;
    color: var(--text-dim);
  }
  .close-btn:hover {
    color: var(--text);
    border-color: rgba(255, 255, 255, 0.3);
  }
</style>
