<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { onMount } from 'svelte';
  import { CubeMesh as Cube } from './cube';
  import { MoveAnimator } from './animator';
  import { attachDragControls } from './drag-controls';
  import { attachKeyboard } from './keyboard';
  import { LayerHighlight } from './layer-highlight';
  import { CubeView } from './cube-view';
  import { cubeStore } from '../stores/cube.svelte';
  import { cubeViewStore } from '../stores/cube-view.svelte';
  import { demoStore } from '../stores/demo.svelte';

  const cube = new Cube();
  const animator = new MoveAnimator(cube, cube.root);
  const cubeView = new CubeView(cube);
  const layerHighlight = new LayerHighlight();
  const defaultMoveMs = animator.durationMs;

  function rebuildCube(): void {
    if (animator.isBusy()) return;
    cube.root.clear();
    cube.cubies.length = 0;
    const fresh = new Cube();
    for (const c of fresh.cubies) {
      cube.root.add(c.mesh);
      cube.cubies.push(c);
    }
    cubeView.rebind();
  }

  const { camera, canvas } = useThrelte();

  onMount(() => {
    cubeStore.bind({
      enqueue: (move) => animator.enqueue(move),
      isBusy: () => animator.isBusy(),
      reset: rebuildCube,
      setMoveDuration: (ms) => { animator.durationMs = ms ?? defaultMoveMs; }
    });
    cubeViewStore.bind({
      highlight: (type, opts) => cubeView.highlight(type, opts),
      setFaceLabels: (on) => cubeView.setFaceLabels(on),
      setNumbers: (on) => cubeView.setNumbers(on)
    });
    animator.onMoveStart = () => cubeStore.handleMoveStart();
    animator.onMoveComplete = (name) => cubeStore.handleMoveComplete(name);

    const detachDrag = attachDragControls(cube, animator, camera.current, canvas, {
      onPreviewLayer: (cubies) => layerHighlight.set(cubies)
    });
    const detachKeyboard = attachKeyboard(animator, { onReset: () => cubeStore.reset() });
    return () => {
      detachDrag();
      detachKeyboard();
      layerHighlight.clear();
      cubeStore.unbind();
      cubeViewStore.unbind();
    };
  });

  // Threlte's useTask replaces the manual requestAnimationFrame loop that drove
  // animator.update() in the old main.ts's tick(). The cube only moves on
  // explicit input — no idle/standby drift.
  useTask(() => {
    const now = performance.now();
    // Slide the learner's cube aside while the demo window is open (desktop), so
    // the reference cube docked on the right doesn't cover it. Eased per frame.
    cube.root.position.x += (demoStore.mainCubeShift - cube.root.position.x) * 0.15;
    animator.update(now);
    cubeView.update(now);
  });
</script>

<T is={cube.root} />
