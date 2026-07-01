<script lang="ts">
  // The Threlte-context half of the hint window: owns the reference cube, binds it
  // to demoStore so the walkthrough can drive it, and pumps its animator + view.
  import { T, useTask } from '@threlte/core';
  import { onMount } from 'svelte';
  import { DemoCubeController } from '../scene/demo-cube';
  import { demoStore } from '../stores/demo.svelte';

  const controller = new DemoCubeController();
  // Chip highlighting during a lesson "Show me how" (the walkthrough drives chips
  // from its own move index instead).
  controller.onMoveApplied = (i) => {
    if (demoStore.source === 'lesson') demoStore.setActiveIndex(i);
  };

  onMount(() => {
    demoStore.bindCube({
      applyMoves: (m) => controller.applyMoves(m),
      reset: () => controller.reset(),
      isBusy: () => controller.isBusy(),
      setMoveDuration: (ms) => controller.setMoveDuration(ms),
      highlight: (type, opts) => controller.highlight(type, opts),
      seedFromState: (s) => controller.seedFromState(s)
    });
    return () => demoStore.unbindCube();
  });

  // Lesson "Show me how": seed + play once on each playToken bump.
  let lastPlay = -1;
  $effect(() => {
    const token = demoStore.playToken;
    if (token === lastPlay) return;
    lastPlay = token;
    const state = demoStore.seedState;
    if (demoStore.open && demoStore.source === 'lesson' && state) {
      controller.seedAndPlay(state, demoStore.moves);
    }
  });

  // Walkthrough: (re)seed the reference cube to the learner's scramble on each bump.
  let lastSeed = -1;
  $effect(() => {
    const token = demoStore.seedToken;
    if (token === lastSeed) return;
    lastSeed = token;
    const state = demoStore.seedState;
    if (state) controller.seedFromState(state);
  });

  useTask(() => controller.update(performance.now()));
</script>

<T is={controller.root} />
