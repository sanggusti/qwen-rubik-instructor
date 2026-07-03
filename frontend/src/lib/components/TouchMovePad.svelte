<script lang="ts">
  import { cubeStore } from '../stores/cube.svelte';

  let { open, onClose }: { open: boolean; onClose?: () => void } = $props();

  // Row 1: face-layer + slice moves; Row 2: remaining face + whole-cube rotations
  const FACE_ROW = ['U', 'D', 'L', 'M', 'E', 'S'];
  const SLICE_ROW = ['R', 'F', 'B', 'x', 'y', 'z'];
  const ROTATIONS = new Set(['x', 'y', 'z']);

  let prime = $state(false);

  function tapMove(base: string): void {
    cubeStore.applyMoves(prime ? base + "'" : base);
    prime = false;
  }
</script>

{#if open}
  <div class="keypad-bar">
    <div class="keypad-header">
      <button type="button" class="action-btn" onclick={() => cubeStore.scramble()}>Scramble</button>
      <button type="button" class="action-btn" onclick={() => cubeStore.reset()}>Reset</button>
      <div class="header-divider" aria-hidden="true"></div>
      <span class="keypad-mode">mode</span>
      <button
        type="button"
        class="prime-btn"
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

    <div class="keypad-rows">
      <div class="key-row">
        <span class="row-label">face</span>
        {#each FACE_ROW as base (base)}
          <button type="button" class:rotation={ROTATIONS.has(base)} onclick={() => tapMove(base)}>{base}</button>
        {/each}
      </div>
      <div class="key-row">
        <span class="row-label">slice</span>
        {#each SLICE_ROW as base (base)}
          <button type="button" class:rotation={ROTATIONS.has(base)} onclick={() => tapMove(base)}>{base}</button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Desktop/tablet: small right-side panel (original layout) */
  .keypad-bar {
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
    width: min(240px, calc(100vw - 20px));
  }

  .keypad-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-divider {
    width: 1px;
    height: 18px;
    background: rgba(255, 255, 255, 0.15);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .keypad-mode {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .keypad-rows {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .key-row {
    display: grid;
    grid-template-columns: 28px repeat(6, 1fr);
    gap: 4px;
    align-items: center;
  }

  .row-label {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    opacity: 0.6;
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
    min-height: 38px;
    transition: background 0.1s ease, border-color 0.1s ease;
  }

  button:active {
    background: rgba(255, 255, 255, 0.18);
  }

  .rotation {
    color: var(--accent-b);
    border-color: rgba(var(--accent-b-raw, 120, 160, 255), 0.25);
  }

  .action-btn {
    min-height: unset;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 7px;
    color: var(--accent-b);
    border-color: rgba(var(--accent-b-raw, 120, 160, 255), 0.3);
  }

  .prime-btn {
    min-height: unset;
    padding: 4px 8px;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 6px;
  }

  .prime-btn.active {
    color: var(--accent-b);
    border-color: var(--accent-b);
    background: var(--accent-b-bg);
  }

  .close-btn {
    min-height: unset;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    font-size: 13px;
    display: grid;
    place-items: center;
    color: var(--text-dim);
    margin-left: auto;
  }

  .close-btn:hover {
    color: var(--text);
    border-color: rgba(255, 255, 255, 0.3);
  }

  /* Mobile: full-width bottom bar */
  @media (max-width: 760px) {
    .keypad-bar {
      right: 0;
      left: 0;
      bottom: 0;
      width: auto;
      border-radius: 0;
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
      background: rgba(7, 3, 13, 0.92);
    }

    .keypad-header {
      flex-wrap: nowrap;
    }

    .key-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .row-label {
      width: 34px;
      flex-shrink: 0;
    }

    button {
      flex: 1;
      min-height: 44px;
      font-size: 14px;
    }

    .action-btn {
      flex: unset;
      min-height: unset;
      padding: 5px 10px;
      font-size: 11px;
    }

    .prime-btn,
    .close-btn {
      flex: unset;
      min-height: unset;
    }
  }
</style>
