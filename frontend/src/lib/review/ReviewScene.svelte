<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import ReviewCubeActor from './ReviewCubeActor.svelte';
  import type { ReviewTimeline } from './review-timeline';

  let {
    progress = 0,
    timeline = null,
    fullSequence,
    reducedMotion = false,
    cameraPosition = [5, 5, 7] as [number, number, number],
    parkedX = 0
  }: {
    progress?: number;
    timeline?: ReviewTimeline | null;
    fullSequence: string[];
    reducedMotion?: boolean;
    cameraPosition?: [number, number, number];
    parkedX?: number;
  } = $props();

  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }
</script>

<!-- The single fixed WebGL canvas behind the review content, driven entirely
     by scroll progress — same architecture as the landing scene. -->
<div class="scene" aria-hidden="true" style="opacity: {timeline ? timeline.fade(progress) : 1}">
  <Canvas {createRenderer} dpr={[1, 2]}>
    <T.PerspectiveCamera
      makeDefault
      fov={45}
      near={0.1}
      far={100}
      position={cameraPosition}
      oncreate={(ref) => ref.lookAt(0, 0, 0)}
    />
    <ReviewCubeActor {progress} {timeline} {fullSequence} {reducedMotion} {parkedX} />
  </Canvas>
</div>

<style>
  .scene {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>
