import * as THREE from 'three';
import type { Cubie } from './cube';

// Shared by every overlay: same color/opacity for all of them, so one material
// instance is enough (and there's nothing to dispose between updates).
const material = new THREE.MeshBasicMaterial({
  color: 0x5ad7ff,
  transparent: true,
  opacity: 0.45,
  side: THREE.DoubleSide,
  depthTest: false
});

// Translucent overlays on top of a layer's stickers, used as drag-in-progress
// guidance for which slice is about to turn. Each overlay is parented directly to
// its sticker (reusing its geometry) so it inherits that sticker's transform,
// including mid-turn animation.
export class LayerHighlight {
  private overlays: THREE.Mesh[] = [];

  set(cubies: Cubie[] | null): void {
    this.clear();
    if (!cubies) return;
    for (const cubie of cubies) {
      cubie.mesh.traverse(child => {
        if (!(child as any).userData?.isSticker) return;
        const sticker = child as THREE.Mesh;
        const overlay = new THREE.Mesh(sticker.geometry, material);
        sticker.add(overlay);
        this.overlays.push(overlay);
      });
    }
  }

  clear(): void {
    for (const overlay of this.overlays) overlay.parent?.remove(overlay);
    this.overlays.length = 0;
  }
}
