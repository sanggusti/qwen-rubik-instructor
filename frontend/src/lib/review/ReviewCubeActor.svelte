<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T, useTask } from '@threlte/core';
  import { CubeMesh } from '../scene/cube';
  import { SequenceScrubber } from '../landing/scrub';
  import type { ReviewTimeline } from './review-timeline';

  let {
    progress = 0,
    timeline = null,
    fullSequence,
    reducedMotion = false,
    parkedX = 0
  }: {
    progress?: number;
    timeline?: ReviewTimeline | null;
    /** Immutable for the page's lifetime — the scrubber is built once from it. */
    fullSequence: string[];
    reducedMotion?: boolean;
    parkedX?: number;
  } = $props();

  const cube = new CubeMesh();
  // Deliberate initial capture: the sequence never changes for the page's
  // lifetime, and the scrubber must be built exactly once (it caches lattice
  // transforms against the cube's home state).
  // svelte-ignore state_referenced_locally
  const scrubber = new SequenceScrubber(cube, fullSequence);

  onDestroy(() => cube.dispose());

  // Reduced motion: park a solved, still cube; keep it parked across resizes.
  $effect(() => {
    if (reducedMotion) cube.root.position.x = parkedX;
  });

  useTask(() => {
    if (reducedMotion || !timeline) return;
    const pose = timeline.pose(progress);
    cube.root.position.x = pose.x;
    scrubber.setProgress(pose.moveT);
  });
</script>

<T is={cube.root} />
