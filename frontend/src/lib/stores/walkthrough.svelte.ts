// Wraps WalkthroughEngine, mirroring lesson.svelte.ts/practice.svelte.ts. The
// engine's setHighlight callback drives cubeViewStore so the Explore panel's
// "Highlight pieces" buttons stay in sync with a playing walkthrough's
// per-beat emphasis, exactly as the legacy ExplorePanel/CubeView pairing did.

import { WalkthroughEngine, type WalkthroughApi, type WalkthroughState, type Walkthrough } from '../education/walkthrough';
import { WALKTHROUGHS } from '../education/walkthroughs';
import { cubeStore } from './cube.svelte';
import { cubeViewStore } from './cube-view.svelte';

const walkthroughApi: WalkthroughApi = {
  applyMoves: (moves) => cubeStore.applyMoves(moves),
  reset: () => cubeStore.reset(),
  isBusy: () => cubeStore.isBusy,
  setMoveDuration: (ms) => cubeStore.setMoveDuration(ms)
};

class WalkthroughStore {
  snapshot: WalkthroughState = $state({ walkthrough: null });

  private readonly engine = new WalkthroughEngine(
    walkthroughApi,
    WALKTHROUGHS,
    (type, opts) => cubeViewStore.highlight(type, opts)
  );

  constructor() {
    this.engine.subscribe((s) => { this.snapshot = s; });
  }

  getWalkthroughs(): Walkthrough[] { return this.engine.getWalkthroughs(); }
  isPlaying(): boolean { return this.engine.isPlaying(); }
  loadGenerated(walkthrough: Walkthrough): void { this.engine.loadGenerated(walkthrough); }
  select(id: string): void { this.engine.select(id); }
  close(): void { this.engine.close(); }
  play(): void { this.engine.play(); }
  pause(): void { this.engine.pause(); }
  stop(): void { this.engine.stop(); }
  next(): void { this.engine.next(); }
  previous(): void { this.engine.previous(); }
}

export const walkthroughStore = new WalkthroughStore();
