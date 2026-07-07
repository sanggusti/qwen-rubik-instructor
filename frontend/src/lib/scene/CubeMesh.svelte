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
  import { paintCubeFromState } from './paint-from-state';
  import { cubeStore } from '../stores/cube.svelte';
  import { cubeViewStore } from '../stores/cube-view.svelte';
  import { demoStore } from '../stores/demo.svelte';
  import { lessonStore } from '../stores/lesson.svelte';
  import { physicalStore } from '../stores/physical.svelte';
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

  const { camera, canvas, invalidate } = useThrelte();

  // Drag + keyboard are detached while a physical-cube session is active:
  // the on-screen cube is then a read-only mirror of the real cube and
  // digital input must never diverge it.
  let detachInput: (() => void) | null = null;
  function attachInput(): void {
    const detachDrag = attachDragControls(cube, animator, camera.current, canvas, {
      onPreviewLayer: (cubies) => layerHighlight.set(cubies),
    });
    const detachKeyboard = attachKeyboard(animator, {
      onReset: () => cubeStore.reset(),
      onScramble: (moves) => cubeStore.handleExternalScramble(moves)
    });
    detachInput = () => {
      detachDrag();
      detachKeyboard();
    };
  }

  $effect(() => {
    if (physicalStore.active) {
      detachInput?.();
      detachInput = null;
      layerHighlight.clear();
    } else if (!detachInput) {
      attachInput();
    }
  });

  onMount(() => {
    cubeStore.bind({
      enqueue: (move) => animator.enqueue(move),
      isBusy: () => animator.isBusy(),
      reset: rebuildCube,
      setMoveDuration: (ms) => { animator.durationMs = ms ?? defaultMoveMs; },
      cancel: () => animator.cancel(),
      seedFromState: (state) => {
        animator.cancel();
        rebuildCube();
        paintCubeFromState(cube, state);
        invalidate();
      }
    });
    cubeViewStore.bind({
      highlight: (type, opts) => cubeView.highlight(type, opts),
      setFaceLabels: (on) => cubeView.setFaceLabels(on),
      setNumbers: (on) => cubeView.setNumbers(on)
    });
    animator.onMoveStart = () => cubeStore.handleMoveStart();
    animator.onMoveComplete = (name) => cubeStore.handleMoveComplete(name);

    return () => {
      detachInput?.();
      detachInput = null;
      layerHighlight.clear();
      directionArrow.dispose();
      cubeStore.unbind();
      cubeViewStore.unbind();
    };
  });


  // On phones during a physical session the DEMO cube is the primary visual
  // (it shows what to do next); the mirror demotes to a small confirmation
  // thumbnail near the top so the coach card and camera window get the space.
  const coarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const PHYSICAL_MOBILE_SCALE = 0.5;
  const PHYSICAL_MOBILE_SHIFT_Y = 2.8;

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

  // Rendering: normal mode preserves today's every-frame behavior. During a
  // physical session the mirror goes truly on-demand (the auto-invalidating
  // task otherwise defeats Threlte's on-demand render mode and burns
  // GPU/battery next to a live camera) — render only while something moves.
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

    const physicalMobile = coarsePointer && physicalStore.active;

    // Y: physical-mobile thumbnail > Guide-modal shift > mobile-stage shift.
    const targetY = physicalMobile
      ? PHYSICAL_MOBILE_SHIFT_Y
      : demoStore.modalOpen
      ? MODAL_CUBE_SHIFT_Y
      : mobileStageActive
      ? MOBILE_STAGE_SHIFT_Y
      : 0;

    // Scale: thumbnail in physical mode on phones; shrink with mobile stage.
    const targetScale = physicalMobile ? PHYSICAL_MOBILE_SCALE : mobileStageActive ? MOBILE_STAGE_SCALE : 1;

    const lerping =
      Math.abs(targetX - cube.root.position.x) > 0.002 ||
      Math.abs(targetY - cube.root.position.y) > 0.002 ||
      Math.abs(targetScale - cube.root.scale.x) > 0.002;

    cube.root.position.x += (targetX - cube.root.position.x) * 0.15;
    cube.root.position.y += (targetY - cube.root.position.y) * 0.15;
    cube.root.scale.setScalar(cube.root.scale.x + (targetScale - cube.root.scale.x) * 0.15);

    animator.update(now);
    cubeView.update(now);
    directionArrow.update();

    if (!physicalStore.active || animator.isBusy() || lerping) invalidate();
  }, { autoInvalidate: false });
</script>

<T is={cube.root} />
