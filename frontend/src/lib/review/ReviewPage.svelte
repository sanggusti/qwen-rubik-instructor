<script lang="ts">
  // The final review canvas: a scroll-scrubbed replay of the captured Qwen
  // solve. The fixed cube scrubs scramble → checkpoints → solved as the reader
  // scrolls, while each section shows the compiled narration and the full move
  // notation — so a solved physical cube can follow along move for move.
  // Architecture mirrors landing/LandingPage.svelte.
  import { fade } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import ContentSection from '../landing/ContentSection.svelte';
  import ReviewScene from './ReviewScene.svelte';
  import { buildReviewTimeline, type ReviewTimeline } from './review-timeline';
  import type { CompiledReview } from './compile';
  import type { ReviewSolve } from './session';

  let {
    compiled,
    solve,
    children
  }: { compiled: CompiledReview; solve: ReviewSolve; children?: Snippet } = $props();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total = $derived(compiled.fullSequence.length);

  let scrollEl = $state<HTMLDivElement | null>(null);
  let progress = $state(0);
  let timeline = $state<ReviewTimeline | null>(null);
  let cameraPosition = $state<[number, number, number]>([5, 5, 7]);
  let parkedX = $state(-2.2);

  // Index of the move the cube is currently on; drives the chip highlights.
  const activeGlobalMove = $derived(
    timeline ? Math.floor(timeline.pose(progress).moveT) : -1
  );

  // Measure the real layout (intro runway, section centers and cube sides) and
  // rebuild the scroll→pose timeline. Re-run on resize: breakpoints move
  // everything. Only .content-section elements are cube landing zones.
  function measure() {
    if (!scrollEl) return;
    const vh = scrollEl.clientHeight;
    const runway = scrollEl.scrollHeight - vh;
    const introEl = scrollEl.querySelector('.review-intro') as HTMLElement | null;
    if (!introEl || runway <= 0) return;

    const sections = Array.from(scrollEl.querySelectorAll('.content-section')) as HTMLElement[];
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    cameraPosition = narrow ? [7, 7, 9.5] : [5, 5, 7];
    parkedX = narrow ? 0 : -2.2;

    timeline = buildReviewTimeline(
      {
        introEnd: clamp01((introEl.offsetTop + introEl.offsetHeight - vh) / runway),
        sectionCenters: sections.map((el) =>
          clamp01((el.offsetTop + el.offsetHeight / 2 - vh / 2) / runway)
        ),
        sides: sections.map((el) => (el.classList.contains('flip') ? 1 : -1))
      },
      narrow ? 0.9 : 2.2,
      compiled.sections.map((s) => s.endIndex)
    );
  }

  $effect(() => {
    if (!scrollEl) return;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  // rAF-throttled: coalesce scroll events into one layout read per frame.
  let ticking = false;
  function onscroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!scrollEl) return;
      const runway = scrollEl.scrollHeight - scrollEl.clientHeight;
      progress = runway > 0 ? Math.min(scrollEl.scrollTop / runway, 1) : 0;
    });
  }

  // --- Playback: auto-scroll the tour so the replay also runs hands-free.
  // Scroll stays the single source of truth (the scrub, chips and section
  // reveals all derive from it), so play/pause/replay never desyncs anything.
  // Speed in viewport-heights per second — roughly one section every ~6s.
  const PLAY_SPEED_VH = 0.16;
  let playing = $state(false);
  let playRaf = 0;
  let lastTick = 0;

  const atEnd = $derived(progress >= 0.999);

  function tick(now: number): void {
    if (!playing || !scrollEl) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    scrollEl.scrollTop += PLAY_SPEED_VH * scrollEl.clientHeight * dt;
    const runway = scrollEl.scrollHeight - scrollEl.clientHeight;
    if (scrollEl.scrollTop >= runway - 1) {
      playing = false;
      return;
    }
    playRaf = requestAnimationFrame(tick);
  }

  function play(): void {
    if (!scrollEl) return;
    if (atEnd) scrollEl.scrollTop = 0;
    playing = true;
    lastTick = performance.now();
    playRaf = requestAnimationFrame(tick);
  }

  function pause(): void {
    playing = false;
    cancelAnimationFrame(playRaf);
  }

  function restart(): void {
    pause();
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  // Manual input takes over instantly — grabbing the wheel mid-tour pauses it.
  // Touches on the playback bar are exempt: a tap fires touchstart before its
  // click, and pausing here first would flip Pause into Resume mid-tap.
  function onUserInput(ev: Event): void {
    if ((ev.target as HTMLElement | null)?.closest('.playback')) return;
    if (playing) pause();
  }

  $effect(() => {
    if (!scrollEl) return;
    const el = scrollEl;
    el.addEventListener('wheel', onUserInput, { passive: true });
    el.addEventListener('touchstart', onUserInput, { passive: true });
    return () => {
      el.removeEventListener('wheel', onUserInput);
      el.removeEventListener('touchstart', onUserInput);
      cancelAnimationFrame(playRaf);
    };
  });

  const capturedDate = $derived(new Date(solve.capturedAt).toLocaleString());
</script>

<div class="review" bind:this={scrollEl} {onscroll} in:fade={{ duration: 600 }}>
  <ReviewScene
    {progress}
    {timeline}
    fullSequence={compiled.fullSequence}
    {reducedMotion}
    {cameraPosition}
    {parkedX}
  />

  <div class="content">
    <header class="review-intro">
      <div class="intro-panel glass-panel">
        <p class="intro-kicker">Session review</p>
        <h1 class="neon-heading intro-heading">{solve.title}</h1>
        <p class="intro-description">{solve.description}</p>
        <p class="intro-instruction">
          Grab a <strong>solved physical cube</strong> and scroll. First recreate the scramble,
          then follow each checkpoint's moves — the cube on screen stays in step with yours,
          all {total} moves of the way.
        </p>
        <p class="intro-meta">Captured {capturedDate} · {solve.method} · {solve.level}</p>
        <a class="back-link" href="/play">← Back to the cube</a>
      </div>
      <p class="scroll-cue" aria-hidden="true">Scroll to begin ▼</p>
    </header>

    {#each compiled.sections as section, i (section.startIndex + section.kind)}
      <ContentSection flip={i % 2 === 1}>
        <p class="section-kicker">
          {#if section.kind === 'scramble'}
            Step 0 — from a solved cube
          {:else if section.kind === 'checkpoint'}
            Checkpoint {i} of {compiled.sections.length - 2}
          {:else}
            The payoff
          {/if}
        </p>
        <h2 class="neon-heading section-heading">{section.title}</h2>
        {#if section.narration}
          <p class="section-narration">{section.narration}</p>
        {/if}
        {#if section.moves.length}
          <div class="move-chips" aria-label="Moves for this step">
            {#each section.moves as move, j (section.startIndex + j)}
              {@const idx = section.startIndex + j}
              <span
                class="chip"
                class:done={idx < activeGlobalMove}
                class:active={idx === activeGlobalMove}>{move}</span
              >
            {/each}
          </div>
          <p class="move-range">
            Moves {section.startIndex + 1}–{section.endIndex} of {total}
          </p>
        {:else if section.kind === 'solved'}
          <p class="solved-note">
            Every sticker home. If your real cube matches, you just reproduced the whole
            solve by hand.
          </p>
          <a class="back-link solved-cta" href="/play">Solve another one →</a>
        {/if}
      </ContentSection>
    {/each}

    {@render children?.()}
  </div>

  {#if !reducedMotion}
    <div class="playback glass-panel" role="group" aria-label="Replay controls">
      {#if playing}
        <button class="playback-btn" type="button" onclick={pause} aria-label="Pause the tour">
          ❚❚ Pause
        </button>
      {:else}
        <button class="playback-btn" type="button" onclick={play} aria-label="Play the tour">
          ▶ {atEnd ? 'Replay' : progress > 0.001 ? 'Resume' : 'Play'}
        </button>
      {/if}
      {#if progress > 0.001}
        <button class="playback-btn" type="button" onclick={restart} aria-label="Back to the start">
          ↺ Restart
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .review {
    position: relative;
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* All copy scrolls above the fixed cube canvas (z-index 0). */
  .content {
    position: relative;
    z-index: 1;
  }

  .review-intro {
    min-height: 92dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 24px;
    padding: 48px 24px;
  }

  /* The cube idles centered behind the intro; the copy needs its own surface. */
  .intro-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 640px;
    padding: 36px 40px;
    border-radius: 18px;
  }

  .intro-kicker,
  .section-kicker {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent-b);
    margin: 0;
  }

  .intro-heading {
    font-size: clamp(24px, 5vw, 42px);
    margin: 0;
  }

  .intro-description {
    color: var(--text-dim);
    margin: 0;
  }

  .intro-instruction {
    max-width: 560px;
    color: var(--text);
    line-height: 1.65;
    margin: 0;
  }

  .intro-instruction strong {
    color: var(--accent-y);
  }

  .intro-meta {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    margin: 0;
  }

  .back-link {
    color: var(--accent-b);
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .scroll-cue {
    margin-top: 24px;
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    animation: cue-bob 2s ease-in-out infinite;
  }

  @keyframes cue-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-cue {
      animation: none;
    }
  }

  .section-kicker {
    margin-bottom: 10px;
  }

  .section-heading {
    font-size: clamp(18px, 3.5vw, 28px);
    margin-bottom: 14px;
  }

  .section-narration {
    color: var(--text);
    line-height: 1.65;
    margin-bottom: 18px;
  }

  /* Full notation per section — never windowed: the whole point is that a
     learner can read every move off the page onto a real cube. */
  .move-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--text-dim);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    padding: 2px 8px;
    transition:
      color 0.2s ease,
      background 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .chip.done {
    color: var(--text);
    opacity: 0.7;
  }

  .chip.active {
    font-weight: 700;
    color: var(--bg-deep);
    background: var(--accent-b);
    border-color: var(--accent-b);
    box-shadow: 0 0 12px var(--accent-b-dim);
  }

  .move-range {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    margin: 0;
  }

  .solved-note {
    color: var(--text);
    line-height: 1.65;
    margin-bottom: 18px;
  }

  .solved-cta {
    font-family: var(--font-display);
    letter-spacing: 0.06em;
  }

  /* Floating tour controls: fixed to the viewport, above the scroll content. */
  .playback {
    position: fixed;
    left: 50%;
    bottom: max(18px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 2;
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 14px;
  }

  .playback-btn {
    appearance: none;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.06em;
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    padding: 8px 14px;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .playback-btn:hover {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
</style>
