<script lang="ts">
  // "Camera" tab: entry point for a physical-cube session. The session itself
  // lives in the floating PhysicalCameraWindow (one consolidated HUD — video,
  // adjust grid, ready actions), so this panel just starts/ends it and then
  // collapses out of the way.
  import { physicalStore } from '../stores/physical.svelte';

  let { onPlay }: { onPlay?: () => void } = $props();

  async function startScan(): Promise<void> {
    onPlay?.();
    await physicalStore.beginScan();
  }

  function startManual(): void {
    onPlay?.();
    physicalStore.beginManual();
  }
</script>

<div class="phy-head">
  <h3>Your real cube</h3>
</div>

{#if !physicalStore.active}
  <p class="phy-copy">
    Scramble your own cube, scan it with the camera, and get a guided solve on
    the real thing. Phone? Prop it against something and sit back — you'll
    need both hands for the cube.
  </p>
  <div class="phy-row">
    <button type="button" class="phy-btn primary" data-testid="start-scan" onclick={startScan}>
      📷 Scan my cube
    </button>
    <button type="button" class="phy-btn" data-testid="start-manual" onclick={startManual}>
      Enter colors by hand
    </button>
  </div>
{:else}
  <p class="phy-copy">
    A physical session is running — the window at the top of the screen guides
    it. While it's on, dragging and keyboard turns are off: the on-screen cube
    follows your real one.
  </p>
  <div class="phy-row">
    <button type="button" class="phy-btn" onclick={() => physicalStore.endSession()}>
      End session
    </button>
  </div>
{/if}

<style>
  h3 {
    margin: 0 0 10px;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--accent-a);
  }
  .phy-copy {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.5;
  }
  .phy-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 6px;
  }
  .phy-btn {
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
  .phy-btn.primary {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .phy-btn:hover:not(:disabled) {
    border-color: var(--accent-b-dim);
  }
</style>
