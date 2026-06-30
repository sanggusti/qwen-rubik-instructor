<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import SpinningCube from './SpinningCube.svelte';

  let { speed = 0.25 }: { speed?: number } = $props();

  // Stickers/cubie bodies are MeshBasicMaterial (unlit, see cube.ts), so no
  // light is needed here — matches CubeCanvas.svelte, which also adds none.
  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, 2]}>
    <T.PerspectiveCamera
      makeDefault
      fov={45}
      near={0.1}
      far={100}
      position={[5, 5, 7]}
      oncreate={(ref) => ref.lookAt(0, 0, 0)}
    />
    <SpinningCube {speed} />
  </Canvas>
</div>

<style>
  .stage {
    width: 100%;
    height: 100%;
  }
</style>
