<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import type { Snippet } from 'svelte';
  import SCENE_CONFIG from '../config/scene-config';

  let { children }: { children?: Snippet } = $props();

  // Coarse-pointer or small-viewport devices get a lower pixel-ratio ceiling
  // and no antialiasing, for performance — wires up the previously-unused
  // SCENE_CONFIG.isMobile flag.
  SCENE_CONFIG.isMobile =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 760px)').matches);
  const maxPixelRatio = SCENE_CONFIG.isMobile ? Math.min(1.5, SCENE_CONFIG.maxPixelRatio) : SCENE_CONFIG.maxPixelRatio;

  // Transparent renderer: the artistic background lives behind the canvas in
  // CSS, so the WebGL canvas composites over it instead of painting a flat color.
  function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SCENE_CONFIG.isMobile, alpha: true });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }
</script>

<div class="stage">
  <Canvas {createRenderer} dpr={[1, maxPixelRatio]}>
    <T.PerspectiveCamera
      makeDefault
      fov={45}
      near={0.1}
      far={100}
      position={[5, 5, 7]}
      oncreate={(ref) => ref.lookAt(0, 0, 0)}
    />
    <!-- A drag that starts on a sticker is claimed by attachDragControls (it calls
         stopPropagation), so OrbitControls only ever sees drags on empty space. -->
    <OrbitControls enableDamping enablePan={false} />
    {@render children?.()}
  </Canvas>
</div>

<style>
  .stage {
    width: 100%;
    height: 100vh;
    /* Without this, touch drags get cancelled mid-gesture as a page pan (pointercancel
       instead of pointerup), so attachDragControls never sees the drag complete. */
    touch-action: none;
  }
</style>
