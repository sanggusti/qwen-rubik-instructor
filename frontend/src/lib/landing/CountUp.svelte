<script lang="ts">
  let { value, duration = 1800 }: { value: bigint; duration?: number } = $props();

  let el = $state<HTMLElement | null>(null);
  let display = $state('0');

  const format = (v: bigint) => v.toLocaleString('en-US');

  $effect(() => {
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      display = format(value);
      return;
    }
    let rafId = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - (1 - t) ** 3;
          display = format((value * BigInt(Math.round(eased * 10000))) / 10000n);
          if (t < 1) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  });
</script>

<span class="count" bind:this={el}>{display}</span>

<style>
  .count {
    font-family: var(--font-mono);
    color: var(--text);
    /* Tabular digits so the rolling number doesn't jitter */
    font-variant-numeric: tabular-nums;
  }
</style>
