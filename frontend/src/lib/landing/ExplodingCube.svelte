<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { CubeMesh, CUBIE_SIZE, CUBIE_GAP } from '../scene/cube';
  import * as THREE from 'three';

  let { explodeProgress = 0 }: { explodeProgress?: number } = $props();

  const cube = new CubeMesh();
  const step = CUBIE_SIZE + CUBIE_GAP;

  // Each cubie flies along its lattice direction when exploding.
  // The core cubie at (0,0,0) gets a small fixed push so it doesn't stay frozen.
  const cubieData = cube.cubies.map(({ mesh, coord }) => {
    const home = new THREE.Vector3(coord.x * step, coord.y * step, coord.z * step);
    const dir =
      coord.lengthSq() > 0
        ? coord.clone().normalize()
        : new THREE.Vector3(0.3, 0.5, 0.2).normalize();
    return { mesh, home, dir };
  });

  // In the split-view phase the cube reassembles shifted left so it sits in
  // the left half of the viewport. The camera is at (5,5,7) looking at origin,
  // so negative world-X maps to screen-left.
  const LEFT_SHIFT = new THREE.Vector3(-2.2, 0, 0);
  const EXPLODE_DIST = 4.5;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    for (const { mesh, home } of cubieData) {
      (mesh as THREE.Object3D).position.copy(home.clone().add(LEFT_SHIFT));
    }
  }

  function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Track cumulative y-rotation so we can decelerate smoothly to a stop
  // without a positional snap when spinFactor reaches 0.
  let rotY = 0;
  let prevNow = performance.now();

  const exploded = new THREE.Vector3();
  const assembledLeft = new THREE.Vector3();

  useTask(() => {
    if (reducedMotion) return;

    const now = performance.now();
    const dt = (now - prevNow) / 1000;
    prevNow = now;

    const p = explodeProgress;

    // Spin decelerates to 0 between p=0.3 and p=0.6.
    const spinFactor = 1 - clamp((p - 0.3) / 0.3, 0, 1);
    rotY += dt * 0.4 * spinFactor;
    cube.root.rotation.y = rotY;
    cube.root.rotation.x = Math.sin(now / 4000) * 0.18 * spinFactor;

    // Phase 1: explode  (p 0.40 → 0.70, t 0 → 1)
    const explodeT = easeInOut(clamp((p - 0.4) / 0.3, 0, 1));
    // Phase 2: reassemble left  (p 0.70 → 0.95, u 0 → 1)
    const reassembleU = easeInOut(clamp((p - 0.7) / 0.25, 0, 1));

    for (const { mesh, home, dir } of cubieData) {
      exploded.copy(home).addScaledVector(dir, EXPLODE_DIST * explodeT);
      assembledLeft.copy(home).add(LEFT_SHIFT);
      (mesh as THREE.Object3D).position.lerpVectors(exploded, assembledLeft, reassembleU);
    }
  });
</script>

<T is={cube.root} />
