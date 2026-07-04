<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { onMount } from 'svelte';
  import { CubeMesh as Cube } from './cube';
  import { MoveAnimator } from './animator';
  import { attachDragControls } from './drag-controls';
  import { attachKeyboard } from './keyboard';
  import { LayerHighlight } from './layer-highlight';
  import { CubeView } from './cube-view';
  import { DirectionArrow } from './direction-arrow';
  import { cubeStore } from '../stores/cube.svelte';
  import { cubeViewStore } from '../stores/cube-view.svelte';
  import { demoStore } from '../stores/demo.svelte';
  import { lessonStore } from '../stores/lesson.svelte';
  import { practiceStore } from '../stores/practice.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';
  import SCENE_CONFIG from '../config/scene-config';

  const cube = new Cube();
  const animator = new MoveAnimator(cube, cube.root);
  const cubeView = new CubeView(cube);
  const layerHighlight = new LayerHighlight();
  const directionArrow = new DirectionArrow(cube.root);
  const defaultMoveMs = animator.durationMs;

  function rebuildCube(): void {
    if (animator.isBusy()) return;
    for (const c of cube.cubies) cube.root.remove(c.mesh);
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
      onPreviewLayer: (cubies) => layerHighlight.set(cubies),
    });
    const detachKeyboard = attachKeyboard(animator, {
      onReset: () => cubeStore.reset(),
      onScramble: () => cubeStore.handleExternalScramble()
    });
    return () => {
      detachDrag();
      detachKeyboard();
      layerHighlight.clear();
      directionArrow.dispose();
      cubeStore.unbind();
      cubeViewStore.unbind();
    };
  });


  // Y shift (world units) while the Guide modal is open on any device.
  const MODAL_CUBE_SHIFT_Y = 1.2;
  // Desktop: StageCaption lives at left:57%, so the free area is 0–57%.
  // Camera at z=7, fov=45° → half-width ≈ 5.2 wu at 16:9. -2.0 wu ≈ 19% of
  // screen width, placing the cube center at ~31% — middle of the free area.
  const DESKTOP_STAGE_SHIFT_X = -2.0;
  // Mobile: stage is a bottom sheet; shift the cube up into the free area above.
  // Camera at z≈10 portrait → ~0.084 wu/vh. 2.0 wu ≈ 24vh of lift.
  const MOBILE_STAGE_SHIFT_Y = 2.0;
  // Scale down slightly on mobile for extra clearance above the stage sheet.
  const MOBILE_STAGE_SCALE = 0.78;

  useTask(() => {
    const now = performance.now();

    // True whenever any experience (lesson / drill / walkthrough) is running.
    const stageActive = !!(
      lessonStore.snapshot.lesson ||
      practiceStore.snapshot.drill ||
      walkthroughStore.snapshot.walkthrough
    );
    const mobileStageActive = SCENE_CONFIG.isMobile && stageActive;
    const desktopStageActive = !SCENE_CONFIG.isMobile && stageActive;

    // X: demo-window shift wins; otherwise shift left on desktop when stage open.
    const targetX = demoStore.mainCubeShift !== 0
      ? demoStore.mainCubeShift
      : desktopStageActive
      ? DESKTOP_STAGE_SHIFT_X
      : 0;

    // Y: Guide-modal shift > mobile-stage shift > default (0).
    const targetY = demoStore.modalOpen
      ? MODAL_CUBE_SHIFT_Y
      : mobileStageActive
      ? MOBILE_STAGE_SHIFT_Y
      : 0;

    // Scale: shrink on mobile with stage open; full size otherwise.
    const targetScale = mobileStageActive ? MOBILE_STAGE_SCALE : 1;

    cube.root.position.x += (targetX - cube.root.position.x) * 0.15;
    cube.root.position.y += (targetY - cube.root.position.y) * 0.15;
    cube.root.scale.setScalar(cube.root.scale.x + (targetScale - cube.root.scale.x) * 0.15);

    animator.update(now);
    cubeView.update(now);
    directionArrow.update();
  });
</script>

<T is={cube.root} />
