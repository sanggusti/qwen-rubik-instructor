// CubeView augments a CubeMesh with non-destructive learning aids, in the spirit
// of the legacy Cuber demo: highlighting a class of cubelets (centers / edges /
// corners / core) by dimming the rest, plus optional face-letter and cubelet-id
// labels. It owns only presentation concerns; the logical cube is untouched.

import * as THREE from 'three';
import { CubeMesh, CUBIE_SIZE, CUBIE_GAP } from './cube';
import type { CubeletType } from './cubelets';
import type { FaceKey } from '../../core/state';

const STEP = CUBIE_SIZE + CUBIE_GAP;
const DIM_OPACITY = 0.12;
// Time-constant (ms) for easing opacity toward its target during a fade.
const FADE_TAU = 90;

// Where to float the six face letters (just outside each face's centre sticker).
const FACE_LABEL_DIST = STEP * 1.5 + 0.25;
const FACE_LABEL_DIRS: { face: FaceKey; dir: THREE.Vector3 }[] = [
  { face: 'U', dir: new THREE.Vector3(0, 1, 0) },
  { face: 'D', dir: new THREE.Vector3(0, -1, 0) },
  { face: 'L', dir: new THREE.Vector3(-1, 0, 0) },
  { face: 'R', dir: new THREE.Vector3(1, 0, 0) },
  { face: 'F', dir: new THREE.Vector3(0, 0, 1) },
  { face: 'B', dir: new THREE.Vector3(0, 0, -1) }
];

export class CubeView {
  private readonly cube: CubeMesh;

  // Per-cubie material list (cloned body material + sticker materials) so a whole
  // cubelet can be faded without touching the shared body material in cube.ts.
  private cubieMaterials: { cubie: CubeMesh['cubies'][number]; mats: THREE.Material[] }[] = [];

  private faceSprites: THREE.Sprite[] = [];
  private numberSprites: THREE.Sprite[] = [];

  private currentHighlight: CubeletType | null = null;
  private facesOn = false;
  private numbersOn = false;

  // Per-material target opacity + whether a fade is in flight, so highlights can
  // ease in/out (driven by update()) instead of popping.
  private matTargets = new Map<THREE.Material, number>();
  private fading = false;
  private lastTs = 0;

  constructor(cube: CubeMesh) {
    this.cube = cube;
    this.rebind();
  }

  // Rebuild all view state against the current cube.cubies. Call after the host
  // rebuilds the cube (reset), which replaces cubie meshes and clears cube.root.
  rebind(): void {
    this.teardown();

    for (const cubie of this.cube.cubies) {
      const mats: THREE.Material[] = [];
      cubie.mesh.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mat = child.material as THREE.Material;
        if (child.userData.isSticker) {
          mats.push(mat); // per-sticker material — safe to mutate directly
        } else {
          // Body uses a shared material; clone so opacity is per-cubie.
          const clone = mat.clone();
          child.material = clone;
          mats.push(clone);
        }
      });
      this.cubieMaterials.push({ cubie, mats });

      // Cubelet-id label travels with the piece (skip the hidden core). Seat it
      // just outside the piece's nearest surface so it is depth-occluded by the
      // cube when the piece faces away from the camera.
      if (cubie.cubelet.type !== 'core') {
        const sprite = makeTextSprite(String(cubie.cubelet.id), 0.32);
        const dir = cubie.coord.clone().normalize();
        const maxComp = Math.max(Math.abs(dir.x), Math.abs(dir.y), Math.abs(dir.z)) || 1;
        sprite.position.copy(dir).multiplyScalar(0.56 / maxComp);
        sprite.visible = this.numbersOn;
        cubie.mesh.add(sprite);
        this.numberSprites.push(sprite);
      }
    }

    // Face letters sit on cube.root so they stay fixed to each face.
    for (const { face, dir } of FACE_LABEL_DIRS) {
      const sprite = makeTextSprite(face, 0.7);
      sprite.position.copy(dir).multiplyScalar(FACE_LABEL_DIST);
      sprite.visible = this.facesOn;
      this.cube.root.add(sprite);
      this.faceSprites.push(sprite);
    }

    this.highlight(this.currentHighlight);
  }

  // Spotlight one cubelet class by fading the others. null restores full opacity.
  // Pass { fadeMs } to ease the transition (driven by update()); omit for an
  // instant change (used by the manual highlight buttons).
  highlight(type: CubeletType | null, opts: { fadeMs?: number } = {}): void {
    this.currentHighlight = type;
    const animate = opts.fadeMs != null && opts.fadeMs > 0;
    for (const { cubie, mats } of this.cubieMaterials) {
      const lit = type === null || cubie.cubelet.type === type;
      const target = lit ? 1 : DIM_OPACITY;
      for (const mat of mats) {
        this.matTargets.set(mat, target);
        if (!animate) {
          mat.opacity = target;
          mat.transparent = !lit;
          mat.depthWrite = lit;
        } else {
          mat.transparent = true; // stay blendable while easing
          mat.depthWrite = false;
        }
      }
    }
    this.fading = animate;
  }

  // Ease each material's opacity toward its target. Cheap no-op once settled;
  // call every frame from the host render loop.
  update(now: number): void {
    if (!this.fading) { this.lastTs = now; return; }
    const dt = Math.min(now - this.lastTs, 64);
    this.lastTs = now;
    const k = 1 - Math.exp(-dt / FADE_TAU);
    let stillFading = false;
    for (const { mats } of this.cubieMaterials) {
      for (const mat of mats) {
        const target = this.matTargets.get(mat) ?? 1;
        if (Math.abs(mat.opacity - target) < 0.01) {
          mat.opacity = target;
          const lit = target >= 1;
          mat.transparent = !lit;
          mat.depthWrite = lit;
        } else {
          mat.opacity += (target - mat.opacity) * k;
          stillFading = true;
        }
      }
    }
    this.fading = stillFading;
  }

  setFaceLabels(on: boolean): void {
    this.facesOn = on;
    for (const s of this.faceSprites) s.visible = on;
  }

  setNumbers(on: boolean): void {
    this.numbersOn = on;
    for (const s of this.numberSprites) s.visible = on;
  }

  getHighlight(): CubeletType | null { return this.currentHighlight; }
  isFacesOn(): boolean { return this.facesOn; }
  isNumbersOn(): boolean { return this.numbersOn; }

  private teardown(): void {
    for (const s of this.faceSprites) s.parent?.remove(s);
    for (const s of this.numberSprites) s.parent?.remove(s);
    for (const s of [...this.faceSprites, ...this.numberSprites]) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    this.faceSprites = [];
    this.numberSprites = [];
    this.cubieMaterials = [];
    this.matTargets.clear();
    this.fading = false;
  }
}

// Build a camera-facing sprite showing `text`, drawn to a canvas texture. Kept
// self-contained so the scene needs no extra dependencies or renderers.
function makeTextSprite(text: string, scale: number): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 80px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8, 12, 22, 0.92)';
  ctx.strokeText(text, size / 2, size / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  // depthTest on so the cube body hides labels on faces pointing away from the
  // camera; depthWrite off so overlapping labels don't clip one another.
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}
