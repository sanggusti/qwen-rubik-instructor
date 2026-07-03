<script lang="ts">
  import CubeCanvas from '$lib/scene/CubeCanvas.svelte';
  import CubeMesh from '$lib/scene/CubeMesh.svelte';
  import TouchMovePad from '$lib/components/TouchMovePad.svelte';
  import StageCaption from '$lib/components/StageCaption.svelte';
  import DemoCubeWindow from '$lib/components/DemoCubeWindow.svelte';
  import HudBar from '$lib/components/HudBar.svelte';
  import { lessonStore } from '$lib/stores/lesson.svelte';
  import { practiceStore } from '$lib/stores/practice.svelte';
  import { walkthroughStore } from '$lib/stores/walkthrough.svelte';
  import { cubeStore } from '$lib/stores/cube.svelte';

  // E2E hook: dev-only, stripped from production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__cubeStore = cubeStore;
  }

  // Only one experience runs at a time, so the stage caption has a single
  // owner. `keep: 'none'` ends every experience (used by tabs that own none,
  // e.g. State/Level) — same rule as the legacy main.ts's closeOthers.
  function closeOthers(keep: 'lesson' | 'practice' | 'walkthrough' | 'none'): void {
    if (keep !== 'lesson') lessonStore.closeLesson();
    if (keep !== 'practice') practiceStore.closeDrill();
    if (keep !== 'walkthrough') walkthroughStore.close();
  }

  // HudBar's "Keypad" button reveals the full-width bottom keypad.
  let keypadOpen = $state(false);

  // Keyboard shortcuts mean nothing on a touch device — point at the keypad.
  const isCoarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // True when the stage caption (lesson/drill/walkthrough) is active.
  const stageVisible = $derived(
    lessonStore.snapshot.lesson !== null ||
    practiceStore.snapshot.drill !== null ||
    walkthroughStore.snapshot.walkthrough !== null
  );

  // On mobile: shrink the canvas to the top portion when the stage caption is
  // visible so the bottom panels (stage + keypad) don't overlap the cube.
  const cubeShiftUp = $derived(stageVisible);

  // First-visit controls hint: nothing else on this screen says how to turn
  // the cube. Gone after the first completed move or once a lesson/drill/
  // walkthrough owns the stage (or the keypad covers it).
  let hintDismissed = $state(false);
  $effect(() => cubeStore.onMove(() => (hintDismissed = true)));
  const hintVisible = $derived(
    !hintDismissed &&
      !keypadOpen &&
      lessonStore.snapshot.lesson === null &&
      practiceStore.snapshot.drill === null &&
      walkthroughStore.snapshot.walkthrough === null
  );
</script>

<CubeCanvas shiftUp={cubeShiftUp}>
  <CubeMesh />
</CubeCanvas>

<TouchMovePad open={keypadOpen} onClose={() => (keypadOpen = false)} />
<StageCaption raised={keypadOpen} />
<DemoCubeWindow />
<HudBar onOpenExperience={closeOthers} {keypadOpen} onToggleKeypad={() => (keypadOpen = !keypadOpen)} />

{#if hintVisible}
  <div class="controls-hint">
    {#if isCoarsePointer}
      Drag a face to turn it · <b>Keypad</b> for precise moves · open <b>Guide</b> for lessons
    {:else}
      Drag a face to turn it · keys <b>R L U D F B</b>, hold <b>Shift</b> to reverse · <b>Space</b> scramble · <b>Enter</b> reset · open <b>Guide</b> for lessons
    {/if}
  </div>
{/if}

<style>
  .controls-hint {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 10;
    max-width: min(92vw, 640px);
    text-align: center;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 12px;
    color: var(--text-dim);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    pointer-events: none;
  }
  .controls-hint b {
    color: var(--accent-b);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    /* Sit above the bottom-centred Scramble/Reset quick actions. */
    .controls-hint {
      bottom: calc(72px + env(safe-area-inset-bottom));
    }
  }
</style>
