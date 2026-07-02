<script lang="ts">
  // The floating hint window: a dimmed reference cube that plays a move sequence
  // once and holds, with the sequence shown on top. Docks right on desktop, a
  // bottom modal on mobile. Driven entirely by demoStore.
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import DemoScene from './DemoScene.svelte';
  import MoveSequenceBar from './MoveSequenceBar.svelte';
  import { demoStore } from '../stores/demo.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';

  const eyebrow = $derived(demoStore.source === 'walkthrough' ? 'Walkthrough' : 'Show me how');
  const isSolve = $derived(!!walkthroughStore.snapshot.walkthrough?.startFromCurrent);
  const progress = $derived(walkthroughStore.applyProgress);

  // Transparent renderer so the glass card shows through behind the cube, matching
  // CubeCanvas.svelte.
  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }

  // Closing the window during a walkthrough ends the walkthrough (which owns it);
  // during a lesson demo it just dismisses the hint.
  function close(): void {
    if (demoStore.source === 'walkthrough') walkthroughStore.close();
    else demoStore.close();
  }
</script>

{#if demoStore.open}
  <div class="demo-window">
    <div class="demo-head">
      <span class="demo-eyebrow">{eyebrow}{demoStore.title ? ` · ${demoStore.title}` : ''}</span>
      <button class="demo-close" type="button" aria-label="Close demo" onclick={close}>×</button>
    </div>

    <MoveSequenceBar moves={demoStore.moves} activeIndex={demoStore.activeIndex} />

    <div class="demo-canvas">
      <Canvas {createRenderer} dpr={[1, 1.5]}>
        <T.PerspectiveCamera
          makeDefault
          fov={45}
          near={0.1}
          far={100}
          position={[5, 5, 7]}
          oncreate={(ref) => ref.lookAt(0, 0, 0)}
        />
        <DemoScene />
      </Canvas>
    </div>

    {#if demoStore.source === 'walkthrough'}
      {#if walkthroughStore.hasUserMoves()}
        <div class="demo-actions">
          <button
            class="demo-btn"
            type="button"
            disabled={walkthroughStore.userCubeSolved}
            onclick={() => walkthroughStore.solveUserCube()}
          >{progress ? `Solving… ${progress.done}/${progress.total}` : isSolve ? 'Solve my cube' : 'Apply to my cube'}</button>
          <button
            class="demo-btn"
            type="button"
            disabled={!walkthroughStore.userCubeSolved || progress !== null}
            onclick={() => walkthroughStore.resetUserCubeToCheckpoint()}
          >Reset to checkpoint</button>
        </div>
      {/if}
    {:else}
      <div class="demo-actions">
        <button class="demo-btn" type="button" onclick={() => demoStore.replay()}>↻ Replay</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .demo-window {
    position: fixed;
    top: 50%;
    right: 24px;
    transform: translateY(-50%);
    width: min(30vw, 360px);
    z-index: 16;
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
  .demo-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .demo-eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-a);
    text-shadow: 0 0 12px var(--accent-a-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .demo-close {
    appearance: none;
    cursor: pointer;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
  }
  .demo-close:hover {
    color: var(--text);
  }
  .demo-canvas {
    width: 100%;
    aspect-ratio: 1 / 1;
    /* Reads as a reference: slightly dimmer than the learner's live cube. */
    opacity: 0.9;
    filter: brightness(0.9);
  }
  .demo-actions {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }
  .demo-btn {
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
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .demo-btn:hover {
    border-color: var(--accent-b-dim);
    box-shadow: 0 0 14px var(--accent-b-dim);
  }

  @media (max-width: 760px) {
    .demo-window {
      top: auto;
      right: 50%;
      bottom: calc(64px + env(safe-area-inset-bottom));
      transform: translateX(50%);
      width: min(92vw, 420px);
    }
    .demo-canvas {
      aspect-ratio: 4 / 3;
      max-height: 40vh;
    }
  }
</style>
