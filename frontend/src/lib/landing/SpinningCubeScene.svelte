<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import SpinningSectionCube from './SpinningSectionCube.svelte';

  let { speed = 0.2 }: { speed?: number } = $props();

  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, 1.5]}>
    <T.PerspectiveCamera
      makeDefault
      fov={45}
      near={0.1}
      far={100}
      position={[5, 5, 7]}
      oncreate={(ref) => ref.lookAt(0, 0, 0)}
    />
    <SpinningSectionCube {speed} />
  </Canvas>
</div>

<style>
  .stage {
    width: 100%;
    height: 100%;
  }
</style>
