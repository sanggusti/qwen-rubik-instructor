<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import ExplodingCube from './ExplodingCube.svelte';

  let { explodeProgress = 0 }: { explodeProgress?: number } = $props();

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
    <ExplodingCube {explodeProgress} />
  </Canvas>
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
  }
</style>
