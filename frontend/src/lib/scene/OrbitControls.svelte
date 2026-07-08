<script lang="ts">
  // A minimal stand-in for @threlte/extras's <OrbitControls>. That package
  // has a single barrel entry point (no subpath exports), so importing just
  // OrbitControls pulls its entire dist — environment maps, post-processing,
  // gizmos, etc. — into Vite's dev dependency pre-bundle (~6MB, 25s+ on a
  // cold start). This wraps three.js's own OrbitControls directly, the same
  // way @threlte/extras does internally, without the rest of the package.
  import { isInstanceOf, T, useParent, useTask, useThrelte } from '@threlte/core';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { untrack } from 'svelte';

  let { enableDamping = false, enablePan = true }: { enableDamping?: boolean; enablePan?: boolean } = $props();

  const { dom, camera: defaultCamera, invalidate } = useThrelte();
  const parent = useParent();
  const camera = $derived(isInstanceOf($parent, 'Camera') ? $parent : $defaultCamera);

  const controls = new OrbitControls(untrack(() => camera), dom);
  $effect.pre(() => {
    controls.object = camera;
  });

  useTask(() => controls.update(), { autoInvalidate: false, running: () => enableDamping });
</script>

<T is={controls} {enableDamping} {enablePan} onchange={invalidate} />
