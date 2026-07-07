<script lang="ts">
  // The physical-session HUD: one consolidated floating window (top-center,
  // adjacent to a laptop webcam so eye-line to preview ≈ eye-line to lens)
  // that carries the whole scan session — live video + 3x3 overlay while
  // scanning, the 54-sticker adjust grid, and the ready state. Keeping it all
  // in one place means the learner never hunts across corners with a cube in
  // both hands. Captures are automatic (hold-steady detection); preview and
  // overlay are mirrored TOGETHER for front cameras while sampling reads the
  // raw frame.
  import StickerGrid from './StickerGrid.svelte';
  import { generateSolveWalkthrough } from '../education/generate';
  import { SCAN_ORDER } from '../physical/scan-machine';
  import { physicalStore, OVERLAY_COVERAGE } from '../stores/physical.svelte';

  const CENTER_TINTS: Record<string, string> = {
    green: 'rgba(47, 174, 84, 0.45)',
    red: 'rgba(214, 48, 64, 0.45)',
    blue: 'rgba(47, 107, 214, 0.45)',
    orange: 'rgba(255, 140, 26, 0.45)',
    white: 'rgba(255, 255, 255, 0.45)',
    yellow: 'rgba(255, 213, 0, 0.45)'
  };

  const centerTint = $derived(CENTER_TINTS[physicalStore.cue.center] ?? 'transparent');
  const progress = $derived(
    `${Math.min(physicalStore.faceIndex + 1, SCAN_ORDER.length)} of ${SCAN_ORDER.length}`
  );
  const open = $derived(
    physicalStore.active &&
      (physicalStore.cameraOpen ||
        physicalStore.phase === 'adjust' ||
        physicalStore.phase === 'ready' ||
        physicalStore.phase === 'error')
  );
  const eyebrow = $derived.by(() => {
    switch (physicalStore.phase) {
      case 'scanning':
      case 'camera-init':
        return `Scan your cube · face ${progress}`;
      case 'adjust':
        return 'Check the stickers';
      case 'ready':
        return 'Your cube is loaded';
      default:
        return 'Your real cube';
    }
  });

  let generating = $state(false);
  let generateStatus = $state('');

  async function solveMyCube(): Promise<void> {
    generating = true;
    try {
      await generateSolveWalkthrough((msg) => (generateStatus = msg));
      generateStatus = '';
    } catch (err) {
      generateStatus = `Couldn't generate: ${(err as Error).message}`;
    } finally {
      generating = false;
    }
  }

  function mountVideo(node: HTMLDivElement, video: HTMLVideoElement | null) {
    function update(v: HTMLVideoElement | null): void {
      node.replaceChildren();
      if (v) node.appendChild(v);
    }
    update(video);
    return {
      update,
      destroy() {
        node.replaceChildren();
      }
    };
  }
</script>

{#if open}
  <div class="cam-window" data-testid="physical-window">
    <div class="cam-head">
      <span class="cam-eyebrow">{eyebrow}</span>
      <button
        class="cam-close"
        type="button"
        aria-label="End physical session"
        onclick={() => physicalStore.endSession()}>×</button
      >
    </div>

    {#if physicalStore.cameraOpen}
      <div class="cam-stage" class:mirrored={physicalStore.mirrored}>
        <div class="cam-video" use:mountVideo={physicalStore.videoEl}></div>
        <div class="cam-overlay" style:--coverage={`${OVERLAY_COVERAGE * 100}%`}>
          {#each Array.from({ length: 9 }, (_, i) => i) as i (i)}
            <div class="cam-cell" style:background={i === 4 ? centerTint : 'transparent'}></div>
          {/each}
        </div>
        {#if physicalStore.flash}
          <div class="cam-flash" class:ok={physicalStore.flash.ok}>
            {physicalStore.flash.message}
          </div>
        {/if}
      </div>

      <p class="cam-cue">{physicalStore.cue.hold}</p>
      <p class="cam-hint">Hold still — it snaps by itself.</p>

      <div class="cam-actions">
        <button
          class="cam-btn"
          type="button"
          disabled={physicalStore.faceIndex === 0}
          onclick={() => physicalStore.retake()}>↩ Redo previous side</button
        >
        {#if physicalStore.consecutiveRejects >= 3}
          <button class="cam-btn" type="button" onclick={() => physicalStore.switchToManual()}
            >Enter colors by hand instead</button
          >
        {/if}
      </div>
    {:else if physicalStore.phase === 'adjust'}
      <p class="cam-cue">
        {physicalStore.manual
          ? 'Tap each sticker until the grid matches your cube. Centers are fixed.'
          : 'Check the grid against your cube — tap any sticker that looks wrong.'}
      </p>
      {#if physicalStore.working}
        <div class="cam-grid">
          <StickerGrid
            state={physicalStore.working}
            confidence={physicalStore.confidence}
            suspects={physicalStore.suspects}
            onCell={(face, index, color) => physicalStore.setCell(face, index, color)}
          />
        </div>
      {/if}
      {#if physicalStore.validationMessage}
        <p class="cam-warn">{physicalStore.validationMessage}</p>
      {/if}
      <div class="cam-actions">
        <button
          class="cam-btn primary"
          type="button"
          data-testid="confirm-adjust"
          onclick={() => physicalStore.confirmAdjust()}>My cube looks right ✓</button
        >
        {#if !physicalStore.manual}
          <button class="cam-btn" type="button" onclick={() => physicalStore.beginScan()}
            >Re-scan</button
          >
        {/if}
      </div>
    {:else if physicalStore.phase === 'ready'}
      <p class="cam-cue">
        The on-screen cube now mirrors the one in your hands. Ask Qwen to walk
        you through solving it.
      </p>
      <div class="cam-actions">
        <button
          class="cam-btn primary"
          type="button"
          data-testid="solve-physical"
          disabled={generating}
          onclick={solveMyCube}>{generating ? 'Generating…' : '✨ Solve my cube'}</button
        >
        <button class="cam-btn" type="button" onclick={() => physicalStore.beginScan()}
          >Re-scan</button
        >
      </div>
      {#if generateStatus}
        <p class="cam-hint">{generateStatus}</p>
      {/if}
    {:else if physicalStore.phase === 'error'}
      <p class="cam-warn">{physicalStore.errorMessage}</p>
      <div class="cam-actions">
        <button class="cam-btn primary" type="button" onclick={() => physicalStore.switchToManual()}
          >Enter colors by hand</button
        >
        <button class="cam-btn" type="button" onclick={() => physicalStore.beginScan()}
          >Try the camera again</button
        >
      </div>
    {/if}
  </div>
{/if}

<style>
  .cam-window {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    width: min(38vw, 420px);
    max-height: 82vh;
    overflow-y: auto;
    z-index: 18;
    display: flex;
    flex-direction: column;
    padding: 12px;
    border-radius: 16px;
    color: var(--text);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  .cam-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .cam-eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-a);
    text-shadow: 0 0 12px var(--accent-a-dim);
  }
  .cam-close {
    appearance: none;
    cursor: pointer;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
  }
  .cam-close:hover {
    color: var(--text);
  }
  .cam-stage {
    position: relative;
    margin-top: 8px;
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    background: #000;
  }
  /* Preview and overlay mirror together (front camera); sampling reads raw. */
  .cam-stage.mirrored {
    transform: scaleX(-1);
  }
  .cam-video :global(video) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cam-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: var(--coverage);
    aspect-ratio: 1 / 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    pointer-events: none;
  }
  .cam-cell {
    border: 1.5px solid rgba(255, 255, 255, 0.75);
    box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.35);
  }
  .cam-flash {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%) scaleX(1);
    max-width: 90%;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    background: rgba(180, 40, 40, 0.85);
    color: #fff;
    text-align: center;
  }
  /* Un-mirror text inside the mirrored stage. */
  .cam-stage.mirrored .cam-flash {
    transform: translateX(50%) scaleX(-1);
  }
  .cam-flash.ok {
    background: rgba(36, 140, 80, 0.85);
  }
  .cam-cue {
    margin: 10px 0 0;
    font-size: 15px;
    line-height: 1.4;
  }
  .cam-hint {
    margin: 4px 0 8px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .cam-warn {
    margin: 8px 0;
    font-size: 13px;
    color: #ffb84d;
  }
  .cam-grid {
    margin: 10px 0 4px;
    display: flex;
    justify-content: center;
  }
  .cam-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .cam-btn {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--accent-b);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .cam-btn.primary {
    border-color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .cam-btn:hover:not(:disabled) {
    border-color: var(--accent-b-dim);
    box-shadow: 0 0 14px var(--accent-b-dim);
  }
  .cam-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-width: 760px) {
    .cam-window {
      top: auto;
      bottom: calc(64px + env(safe-area-inset-bottom));
      width: min(94vw, 440px);
      max-height: 60vh;
    }
  }
</style>
