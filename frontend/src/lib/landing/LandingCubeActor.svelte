<script lang="ts">
  import { onDestroy } from 'svelte';
  import { T, useTask } from '@threlte/core';
  import * as THREE from 'three';
  import { CubeMesh } from '../scene/cube';
  import { SequenceScrubber } from './scrub';
  import { FULL_SEQUENCE } from './solve-sequence';
  import type { Timeline } from './timeline';

  let {
    progress = 0,
    timeline = null,
    reducedMotion = false,
    parkedX = 0
  }: {
    progress?: number;
    timeline?: Timeline | null;
    reducedMotion?: boolean;
    parkedX?: number;
  } = $props();

  const cube = new CubeMesh();
  const scrubber = new SequenceScrubber(cube, FULL_SEQUENCE);

  onDestroy(() => cube.dispose());

  // Explosion: each cubie flies along its (current) lattice direction. Offsets
  // are cached so they can be subtracted exactly before the next scrub write.
  // Kept short enough that flying cubies stay in frame showing sticker color,
  // instead of filling the screen with unstickered black inner faces.
  const EXPLODE_DIST = 3.2;
  const CORE_DIR = new THREE.Vector3(0.3, 0.5, 0.2).normalize();
  let activeOffsets: { mesh: THREE.Object3D; offset: THREE.Vector3 }[] = [];

  function removeExplode(): void {
    for (const { mesh, offset } of activeOffsets) mesh.position.sub(offset);
    activeOffsets = [];
  }

  function applyExplode(env: number): void {
    for (const { mesh, coord } of cube.cubies) {
      const dir = coord.lengthSq() > 0 ? coord.clone().normalize() : CORE_DIR.clone();
      const offset = dir.multiplyScalar(EXPLODE_DIST * env);
      mesh.position.add(offset);
      activeOffsets.push({ mesh, offset });
    }
  }

  // Reduced motion: park a solved, still cube; keep it parked across resizes.
  $effect(() => {
    if (reducedMotion) cube.root.position.x = parkedX;
  });

  const TWO_PI = Math.PI * 2;

  // Free-spin angle accumulates while the hero idles, then settles to the
  // nearest full turn (deterministic pose) as the scramble takes over.
  let rotY = 0;
  let prevNow = performance.now();

  useTask(() => {
    if (reducedMotion || !timeline) return;

    const now = performance.now();
    const dt = (now - prevNow) / 1000;
    prevNow = now;

    const pose = timeline.pose(progress);

    rotY += dt * 0.4 * (1 - pose.settle);
    const settledY = TWO_PI * Math.round(rotY / TWO_PI);
    cube.root.rotation.y = rotY + (settledY - rotY) * pose.settle;
    cube.root.rotation.x = Math.sin(now / 4000) * 0.18 * (1 - pose.settle);
    cube.root.position.x = pose.x;

    removeExplode();
    scrubber.setProgress(pose.moveT);
    if (pose.explode > 0) applyExplode(pose.explode);
  });
</script>

<T is={cube.root} />
