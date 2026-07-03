<script lang="ts">
  import * as THREE from 'three';
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import type { Snippet } from 'svelte';
  import SCENE_CONFIG from '../config/scene-config';

  let { children, shiftUp = false }: { children?: Snippet; shiftUp?: boolean } = $props();

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

  // The vertical fov is fixed, so on portrait viewports the horizontal view
  // narrows and crops the cube — pull the camera back radially (same look-at
  // direction) until the cube's bounding sphere fits the width again.
  let innerWidth = $state(1);
  let innerHeight = $state(1);
  const zoomOut = $derived(Math.max(1, 0.67 / (innerWidth / innerHeight)));
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="stage" class:shift-up={shiftUp}>
  <Canvas {createRenderer} dpr={[1, maxPixelRatio]}>
    <T.PerspectiveCamera
      makeDefault
      fov={45}
      near={0.1}
      far={100}
      position={[5 * zoomOut, 5 * zoomOut, 7 * zoomOut]}
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
    transition: height 0.25s ease;
  }

  /* On mobile, shrink the canvas to the top portion so the stage panel and
     keypad at the bottom don't overlap the 3D scene. Pointer events remain
     accurate because the canvas itself is smaller — no CSS transform tricks. */
  @media (max-width: 760px) {
    .stage.shift-up {
      height: 52vh;
    }
  }
</style>
