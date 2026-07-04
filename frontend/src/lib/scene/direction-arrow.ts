import * as THREE from 'three';
import type { FaceKey } from '../cube/state';
import { parseMove } from '../cube/moves';

const FACE_OFFSET = 1.75; // just outside the sticker surface (~1.53)
const ARC_RADIUS = 0.78;
const ARC_RADIANS = (Math.PI * 5) / 4; // ~225°
const ARC_SEGMENTS = 48;
const CONE_RADIUS = 0.12;
const CONE_HEIGHT = 0.28;
const ARROW_COLOR = 0x00e5ff;
const LERP_SPEED = 0.12; // opacity lerp per frame (~10x/s at 60 fps)

// +1 for faces whose outward normal is on a positive axis (U/R/F); -1 for the rest.
// Used to map move dir convention ("CW from +axis") to "CW from outside the face".
const FACE_SIGN: Record<FaceKey, 1 | -1> = { U: 1, R: 1, F: 1, D: -1, L: -1, B: -1 };

const FACE_NORMALS: Record<FaceKey, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
};

// Reusable scratch vectors (avoid allocations in the render loop).
const _localZ = new THREE.Vector3(0, 0, 1);
const _localY = new THREE.Vector3(0, 1, 0);
const _tanVec = new THREE.Vector3();
const _rotAxisForB = new THREE.Vector3(0, 1, 0); // setFromUnitVectors can't handle anti-parallel +Z→-Z

export class DirectionArrow {
  private readonly group: THREE.Group;
  private readonly arcLine: THREE.Line;
  private readonly coneGeom: THREE.ConeGeometry;
  private readonly coneMesh: THREE.Mesh;
  private readonly mat: THREE.LineBasicMaterial;
  private readonly coneMat: THREE.MeshBasicMaterial;

  private targetOpacity = 0;
  private currentOpacity = 0;
  private lastFace: FaceKey | null = null;
  private lastDirection: 1 | -1 | null = null;

  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.LineBasicMaterial({
      color: ARROW_COLOR, transparent: true, opacity: 0, depthTest: false,
    });
    this.coneMat = new THREE.MeshBasicMaterial({
      color: ARROW_COLOR, transparent: true, opacity: 0, depthTest: false,
    });

    this.arcLine = new THREE.Line(new THREE.BufferGeometry(), this.mat);
    this.arcLine.renderOrder = 999;

    this.coneGeom = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 8);
    this.coneMesh = new THREE.Mesh(this.coneGeom, this.coneMat);
    this.coneMesh.renderOrder = 999;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.add(this.arcLine);
    this.group.add(this.coneMesh);
    parent.add(this.group);
  }

  show(face: FaceKey, direction: 1 | -1, opacity = 1): void {
    if (face !== this.lastFace || direction !== this.lastDirection) {
      this.lastFace = face;
      this.lastDirection = direction;
      this._rebuild(face, direction);
    }
    this.targetOpacity = Math.max(0, Math.min(1, opacity));
    this.group.visible = true;
  }

  private _rebuild(face: FaceKey, direction: 1 | -1): void {
    const normal = FACE_NORMALS[face];

    // Position the group at the face center, offset outward along the face normal.
    this.group.position.copy(normal).multiplyScalar(FACE_OFFSET);

    // Orient the group so its local +Z points outward (= toward the viewer from outside).
    // setFromUnitVectors degenerates when vectors are exactly anti-parallel, so handle B specially.
    if (normal.z === -1) {
      this.group.quaternion.setFromAxisAngle(_rotAxisForB, Math.PI);
    } else {
      this.group.quaternion.setFromUnitVectors(_localZ, normal);
    }

    // arcSign: -1 → CW in local XY from +Z = CW from outside the face.
    const arcSign = -(direction * FACE_SIGN[face]) as 1 | -1;

    // Build arc points in local XY plane.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = arcSign * (i / ARC_SEGMENTS) * ARC_RADIANS;
      points.push(new THREE.Vector3(Math.cos(angle) * ARC_RADIUS, Math.sin(angle) * ARC_RADIUS, 0));
    }
    this.arcLine.geometry.dispose();
    this.arcLine.geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Place the cone at the arc endpoint, pointing along the arc's tangent.
    const endAngle = arcSign * ARC_RADIANS;
    this.coneMesh.position.set(
      Math.cos(endAngle) * ARC_RADIUS,
      Math.sin(endAngle) * ARC_RADIUS,
      0
    );
    _tanVec.set(-arcSign * Math.sin(endAngle), arcSign * Math.cos(endAngle), 0);
    this.coneMesh.quaternion.setFromUnitVectors(_localY, _tanVec);
  }

  fadeOut(): void {
    this.targetOpacity = 0;
  }

  // Call once per frame from the Threlte useTask loop.
  update(): void {
    const diff = this.targetOpacity - this.currentOpacity;
    if (Math.abs(diff) < 0.005) {
      this.currentOpacity = this.targetOpacity;
    } else {
      this.currentOpacity += diff * LERP_SPEED;
    }
    if (this.currentOpacity <= 0.005 && this.targetOpacity === 0) {
      this.group.visible = false;
      this.currentOpacity = 0;
    } else {
      this.group.visible = true;
      this.mat.opacity = this.currentOpacity;
      this.coneMat.opacity = this.currentOpacity;
    }
  }

  dispose(): void {
    this.arcLine.geometry.dispose();
    this.coneGeom.dispose();
    this.mat.dispose();
    this.coneMat.dispose();
    this.group.parent?.remove(this.group);
  }
}

// Parse a WCA move string (e.g. "U", "R'", "F2") into the face it turns and
// the direction from the move spec. Returns null for slice moves (M/E/S) and
// whole-cube rotations (x/y/z) which cannot be shown as a face arrow.
export function moveToFaceDirection(move: string): { face: FaceKey; direction: 1 | -1 } | null {
  // Strip double-turn suffix so U2 → same direction hint as U.
  const stripped = move.endsWith('2') ? move.slice(0, -1) : move;
  const spec = parseMove(stripped);
  if (!spec) return null;
  // Whole-cube rotations: slices.length === 3. Slice moves (M/E/S): slices[0] === 0.
  if (spec.slices.length !== 1 || spec.slices[0] === 0) return null;
  const FACE_MAP: Record<string, FaceKey> = {
    'x:1': 'R', 'x:-1': 'L',
    'y:1': 'U', 'y:-1': 'D',
    'z:1': 'F', 'z:-1': 'B',
  };
  const face = FACE_MAP[`${spec.axis}:${spec.slices[0]}`];
  return face ? { face, direction: spec.dir } : null;
}
