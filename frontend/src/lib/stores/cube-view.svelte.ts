// Reactive façade over CubeView (lib/scene/cube-view.ts), mirroring cube.svelte.ts's
// bind() pattern: CubeMesh.svelte owns the imperative CubeView instance (rebuilt on
// cube reset) and binds it in here, so ExplorePanel.svelte and the walkthrough store
// can read/drive highlight + label state reactively instead of manually re-rendering
// button active-states the way the old ExplorePanel.ts did.

import type { CubeletType } from '../scene/cubelets';

export interface CubeViewControls {
  highlight(type: CubeletType | null, opts?: { fadeMs?: number }): void;
  setFaceLabels(on: boolean): void;
  setNumbers(on: boolean): void;
}

class CubeViewStore {
  highlightType: CubeletType | null = $state(null);
  facesOn: boolean = $state(false);
  numbersOn: boolean = $state(false);

  private controls: CubeViewControls | null = null;

  bind(controls: CubeViewControls): void {
    this.controls = controls;
  }

  unbind(): void {
    this.controls = null;
  }

  // Shared by manual highlight buttons (no opts, instant) and the walkthrough
  // engine's per-beat emphasis (opts.fadeMs, eased) — same as legacy CubeView.highlight.
  highlight(type: CubeletType | null, opts: { fadeMs?: number } = {}): void {
    this.highlightType = type;
    this.controls?.highlight(type, opts);
  }

  setFaceLabels(on: boolean): void {
    this.facesOn = on;
    this.controls?.setFaceLabels(on);
  }

  setNumbers(on: boolean): void {
    this.numbersOn = on;
    this.controls?.setNumbers(on);
  }
}

export const cubeViewStore = new CubeViewStore();
