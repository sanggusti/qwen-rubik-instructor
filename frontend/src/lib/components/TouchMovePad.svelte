<script lang="ts">
  import { cubeStore } from '../stores/cube.svelte';

  let { open }: { open: boolean } = $props();

  const MOVES = ['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z'];

  let prime = $state(false);
  let isCoarsePointer = $state(
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false
  );

  function tapMove(base: string): void {
    cubeStore.applyMoves(prime ? base + "'" : base);
    prime = false;
  }
</script>

{#if isCoarsePointer && open}
  <div class="touch-move-pad">
    <div class="grid">
      {#each MOVES as base (base)}
        <button type="button" onclick={() => tapMove(base)}>{base}</button>
      {/each}
    </div>
    <div class="actions">
      <button
        type="button"
        class="prime"
        class:active={prime}
        onclick={() => (prime = !prime)}
        aria-pressed={prime}
      >
        '
      </button>
    </div>
  </div>
{/if}

<style>
  .touch-move-pad {
    position: fixed;
    left: 50%;
    bottom: max(12px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 14px;
    background: rgba(7, 3, 13, 0.6);
    backdrop-filter: blur(6px);
    touch-action: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(44px, 1fr));
    gap: 6px;
  }
  .actions {
    display: flex;
    justify-content: center;
  }
  button {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    color: var(--text);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    min-width: 44px;
    min-height: 44px;
  }
  .prime {
    min-width: 64px;
  }
  button.active {
    color: var(--accent-b);
    border-color: var(--accent-b);
  }

  @media (max-width: 760px) {
    .touch-move-pad {
      bottom: calc(72px + max(12px, env(safe-area-inset-bottom)));
    }
  }
</style>
