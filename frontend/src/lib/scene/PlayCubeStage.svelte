<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingBar from '../components/LoadingBar.svelte';

  let { shiftUp = false }: { shiftUp?: boolean } = $props();

  // CubeCanvas/CubeMesh/DemoCubeWindow all pull in Three.js/Threlte
  // (~740KB). Loading them via a dynamically-imported component nested one
  // level below the route entry (rather than from +page.svelte directly)
  // keeps that chunk out of the route's eager modulepreload list, so the
  // HUD, keypad and dock hydrate immediately on a slow connection instead
  // of the browser prefetching Three.js alongside them.
  let SceneComps = $state<{
    CubeCanvas: typeof import('./CubeCanvas.svelte')['default'];
    CubeMesh: typeof import('./CubeMesh.svelte')['default'];
    DemoCubeWindow: typeof import('../components/DemoCubeWindow.svelte')['default'];
  } | null>(null);

  onMount(async () => {
    const [cubeCanvas, cubeMesh, demoCubeWindow] = await Promise.all([
      import('./CubeCanvas.svelte'),
      import('./CubeMesh.svelte'),
      import('../components/DemoCubeWindow.svelte')
    ]);
    SceneComps = {
      CubeCanvas: cubeCanvas.default,
      CubeMesh: cubeMesh.default,
      DemoCubeWindow: demoCubeWindow.default
    };
  });
</script>

{#if SceneComps}
  <SceneComps.CubeCanvas {shiftUp}>
    <SceneComps.CubeMesh />
  </SceneComps.CubeCanvas>
  <SceneComps.DemoCubeWindow />
{:else}
  <div class="cube-placeholder" class:shift-up={shiftUp}>
    <LoadingBar label="Loading cube…" />
  </div>
{/if}

<style>
  /* Mirrors CubeCanvas's own .stage sizing so nothing jumps once the real
     canvas mounts in its place. */
  .cube-placeholder {
    width: 100%;
    height: 100vh;
    display: grid;
    place-items: center;
    transition: height 0.25s ease;
  }

  @media (max-width: 760px) {
    .cube-placeholder.shift-up {
      height: 52vh;
    }
  }
</style>
