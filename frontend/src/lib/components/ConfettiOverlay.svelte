<script lang="ts">
  import confetti from 'canvas-confetti';

  // Fullscreen celebration burst; calls onDone after DURATION_MS so the parent
  // can swap in the leaderboard. pointer-events: none — the cube stays usable.
  let { onDone }: { onDone: () => void } = $props();

  const DURATION_MS = 10_000;
  const COLORS = ['#ff2bd6', '#00f0ff', '#ffe066', '#ff9f1c'];

  let canvas: HTMLCanvasElement;

  $effect(() => {
    const fire = confetti.create(canvas, { resize: true, useWorker: true });
    const end = performance.now() + DURATION_MS;
    let raf = 0;
    let last = 0;

    function frame(now: number): void {
      if (now >= end) {
        onDone();
        return;
      }
      // A burst from each side roughly every 250ms.
      if (now - last > 250) {
        last = now;
        fire({ particleCount: 40, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: COLORS });
        fire({ particleCount: 40, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: COLORS });
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      fire.reset();
    };
  });
</script>

<canvas bind:this={canvas} class="confetti-overlay"></canvas>

<style>
  .confetti-overlay {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 150;
    pointer-events: none;
  }
</style>
