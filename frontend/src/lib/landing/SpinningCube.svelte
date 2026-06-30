<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { CubeMesh as Cube } from '../scene/cube';

  let { speed = 0.25 }: { speed?: number } = $props();
  const cube = new Cube();

  // Driven off elapsed time rather than the per-frame delta so the spin rate
  // stays constant regardless of frame drops (purely decorative, no input).
  useTask(() => {
    const elapsed = performance.now() / 1000;
    cube.root.rotation.y = elapsed * speed;
    cube.root.rotation.x = Math.sin(elapsed / 4) * 0.18;
  });
</script>

<T is={cube.root} />
