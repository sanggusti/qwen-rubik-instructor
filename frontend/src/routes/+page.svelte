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

  // Only one experience runs at a time, so the stage caption has a single
  // owner. `keep: 'none'` ends every experience (used by tabs that own none,
  // e.g. State/Level) — same rule as the legacy main.ts's closeOthers.
  function closeOthers(keep: 'lesson' | 'practice' | 'walkthrough' | 'none'): void {
    if (keep !== 'lesson') lessonStore.closeLesson();
    if (keep !== 'practice') practiceStore.closeDrill();
    if (keep !== 'walkthrough') walkthroughStore.close();
  }

  // Hidden by default on touch devices; HudBar's "Keypad" button reveals it.
  let keypadOpen = $state(false);
</script>

<CubeCanvas>
  <CubeMesh />
</CubeCanvas>

<TouchMovePad open={keypadOpen} />
<StageCaption />
<DemoCubeWindow />
<HudBar onOpenExperience={closeOthers} {keypadOpen} onToggleKeypad={() => (keypadOpen = !keypadOpen)} />
