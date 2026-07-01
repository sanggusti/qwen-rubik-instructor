<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { CubeMesh } from '../scene/cube';

  let { speed = 0.2 }: { speed?: number } = $props();

  const cube = new CubeMesh();

  useTask(() => {
    const elapsed = performance.now() / 1000;
    cube.root.rotation.y = elapsed * speed;
    cube.root.rotation.x = Math.sin(elapsed / 4) * 0.18;
  });
</script>

<T is={cube.root} />
