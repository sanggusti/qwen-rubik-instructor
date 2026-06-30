import * as THREE from 'three';
import type { CubeMesh, Cubie, Axis } from './cube';
import type { MoveAnimator } from './animator';
import type { FaceKey } from '../cube/state';
import { moveFromAxisSlice } from '../cube/moves';

interface PendingDrag {
  startScreen: THREE.Vector2;
  hitFace: FaceKey;
  hitCubie: Cubie;
  hitWorldPoint: THREE.Vector3;
}

export interface DragOptions {
  onMove?: (move: string) => void;
  // Called with the cubies of the layer a drag-in-progress would turn (for visual
  // guidance), or null once that's no longer known (gesture ended, or too short to
  // tell yet).
  onPreviewLayer?: (cubies: Cubie[] | null) => void;
  // Pixels of drag below which we ignore the gesture.
  threshold?: number;
  // Pixels of drag below which we don't yet show layer-preview guidance.
  previewThreshold?: number;
}

export function attachDragControls(
  cube: CubeMesh,
  animator: MoveAnimator,
  camera: THREE.Camera,
  domEl: HTMLElement,
  opts: DragOptions = {}
): () => void {
  const threshold = opts.threshold ?? 14;
  const previewThreshold = opts.previewThreshold ?? 6;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pending: PendingDrag | null = null;
  let previewKey: string | null = null;

  function setPreview(axis: Axis | null, slice: number): void {
    const key = axis === null ? null : `${axis}:${slice}`;
    if (key === previewKey) return;
    previewKey = key;
    opts.onPreviewLayer?.(axis === null ? null : cube.cubiesOnLayer(axis, slice));
  }

  function ndcFromEvent(ev: PointerEvent): void {
    const rect = domEl.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function findStickerHit(): { face: FaceKey; point: THREE.Vector3; cubie: Cubie } | null {
    raycaster.setFromCamera(ndc, camera);
    // Collect sticker meshes for raycasting.
    const stickers: THREE.Object3D[] = [];
    for (const c of cube.cubies) {
      c.mesh.traverse(child => {
        if ((child as any).userData?.isSticker) stickers.push(child);
      });
    }
    const hits = raycaster.intersectObjects(stickers, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const cubie = findOwningCubie(cube, hit.object);
    if (!cubie || !hit.face) return null;
    // Use the sticker's CURRENT world-facing direction, not its paint color
    // (userData.face). After any turn a sticker can point a different way, so
    // resolving the face from live geometry keeps dragging consistent.
    const worldNormal = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    // Force the normal to point outward (away from the cube centre at origin).
    if (worldNormal.dot(hit.point) < 0) worldNormal.negate();
    const face = faceFromWorldNormal(worldNormal);
    if (!face) return null;
    return { face, point: hit.point.clone(), cubie };
  }

  function onPointerDown(ev: PointerEvent): void {
    if (animator.isBusy()) return;
    ndcFromEvent(ev);
    const hit = findStickerHit();
    if (!hit) return;
    // Claim the gesture so it doesn't also reach OrbitControls (listening on an
    // ancestor element) and orbit the camera while a face-turn drag is in progress.
    ev.stopPropagation();
    pending = {
      startScreen: new THREE.Vector2(ev.clientX, ev.clientY),
      hitFace: hit.face,
      hitCubie: hit.cubie,
      hitWorldPoint: hit.point
    };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!pending) return;
    const dx = ev.clientX - pending.startScreen.x;
    const dy = ev.clientY - pending.startScreen.y;
    if (Math.hypot(dx, dy) < previewThreshold) { setPreview(null, 0); return; }
    const result = resolveAxisSlice(camera, pending, dx, dy);
    setPreview(result?.axis ?? null, result?.slice ?? 0);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!pending) return;
    setPreview(null, 0);
    const dx = ev.clientX - pending.startScreen.x;
    const dy = ev.clientY - pending.startScreen.y;
    if (Math.hypot(dx, dy) < threshold) { pending = null; return; }

    const move = resolveDragToMove(camera, pending, dx, dy);
    pending = null;
    if (move && animator.enqueue(move)) opts.onMove?.(move);
  }

  function onPointerCancel(): void {
    setPreview(null, 0);
    pending = null;
  }

  domEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  return () => {
    domEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}

function findOwningCubie(cube: CubeMesh, sticker: THREE.Object3D): Cubie | null {
  let n: THREE.Object3D | null = sticker;
  while (n) {
    const found = cube.cubies.find(c => c.mesh === n);
    if (found) return found;
    n = n.parent;
  }
  return null;
}

// Standard normal vectors for each face in cube-local (root) coords.
const FACE_NORMAL: Record<FaceKey, THREE.Vector3> = {
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1)
};

// Map a (dominant axis, sign) of an outward normal to the cube face it represents.
// Valid because the cube root sits at the world origin with identity orientation
// (whole-cube turns bake into the cubie meshes), so world axes == cube axes.
const AXIS_FACE: Record<Axis, { pos: FaceKey; neg: FaceKey }> = {
  x: { pos: 'R', neg: 'L' },
  y: { pos: 'U', neg: 'D' },
  z: { pos: 'F', neg: 'B' }
};

function faceFromWorldNormal(n: THREE.Vector3): FaceKey | null {
  const axis = dominantAxis(n);
  if (!axis) return null;
  return n[axis] >= 0 ? AXIS_FACE[axis].pos : AXIS_FACE[axis].neg;
}

// Positive unit vector for each cube axis.
const AXIS_UNIT: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

// The two in-plane cube axes for each face (the axes that are NOT the face normal).
// A drag on the face slides along these; the layer that turns rotates about whichever
// of them the slide is perpendicular to.
const IN_PLANE_AXES: Record<FaceKey, [Axis, Axis]> = {
  U: ['x', 'z'],
  D: ['x', 'z'],
  R: ['y', 'z'],
  L: ['y', 'z'],
  F: ['x', 'y'],
  B: ['x', 'y']
};

// World-space camera basis (right, up) extracted from its matrixWorld.
function cameraBasis(camera: THREE.Camera): { right: THREE.Vector3; up: THREE.Vector3 } {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  const right = new THREE.Vector3(e[0], e[1], e[2]).normalize();
  const up = new THREE.Vector3(e[4], e[5], e[6]).normalize();
  return { right, up };
}

interface AxisSliceResult {
  axis: Axis;
  slice: number;
  inPlaneDrag: THREE.Vector3;
}

// Steps 1-3 of resolveDragToMove: which layer a drag would turn, independent of
// direction. Shared so a drag-in-progress can preview the layer before release
// (resolveDragToMove only adds the turn direction on top of this).
function resolveAxisSlice(
  camera: THREE.Camera,
  pending: PendingDrag,
  dx: number,
  dy: number
): AxisSliceResult | null {
  // 1. Turn the 2D screen drag into a world-space direction using the camera basis,
  //    then project it onto the hit face's plane. Working in world space (instead of
  //    comparing the two in-plane axes by their skewed screen projections) makes the
  //    axis choice stable from any camera angle.
  const { right, up } = cameraBasis(camera);
  const worldDrag = right.clone().multiplyScalar(dx).add(up.clone().multiplyScalar(-dy));
  const faceNormal = FACE_NORMAL[pending.hitFace];
  const inPlaneDrag = worldDrag.clone().addScaledVector(faceNormal, -worldDrag.dot(faceNormal));
  if (inPlaneDrag.lengthSq() < 1e-12) return null;

  // 2. Decompose the in-plane drag against the two in-plane cube axes. The slide runs
  //    mostly along one of them; the rotating layer pivots about the OTHER (the axis
  //    the drag is most perpendicular to).
  const [axisA, axisB] = IN_PLANE_AXES[pending.hitFace];
  const compA = Math.abs(inPlaneDrag.dot(AXIS_UNIT[axisA]));
  const compB = Math.abs(inPlaneDrag.dot(AXIS_UNIT[axisB]));
  const rotAxis: Axis = compA >= compB ? axisB : axisA;

  // 3. The slice is the hit cubie's coordinate along the rotation axis.
  const slice = Math.round(pending.hitCubie.coord[rotAxis]);

  return { axis: rotAxis, slice, inPlaneDrag };
}

function resolveDragToMove(
  camera: THREE.Camera,
  pending: PendingDrag,
  dx: number,
  dy: number
): string | null {
  const result = resolveAxisSlice(camera, pending, dx, dy);
  if (!result) return null;
  const { axis: rotAxis, slice, inPlaneDrag } = result;

  // 4. Direction: for a rotation about +rotAxis, the hit point's tangential velocity is
  //    k × r. The drag's agreement with that tangent gives the sign (matches the
  //    animator's "CW from +axis" convention used by moveFromAxisSlice).
  const k = AXIS_UNIT[rotAxis];
  const tangent = new THREE.Vector3().crossVectors(k, pending.hitWorldPoint);
  const sign = Math.sign(inPlaneDrag.dot(tangent)) as 1 | -1 | 0;
  if (sign === 0) return null;

  return moveFromAxisSlice(rotAxis, slice, sign);
}

function dominantAxis(v: THREE.Vector3): Axis | null {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax > ay && ax > az) return 'x';
  if (ay > ax && ay > az) return 'y';
  if (az > ax && az > ay) return 'z';
  return null;
}

// Exposed for unit tests / debugging only.
export const _internal = {
  faceFromWorldNormal,
  dominantAxis,
  moveFromAxisSlice,
  resolveAxisSlice,
  resolveDragToMove
};
