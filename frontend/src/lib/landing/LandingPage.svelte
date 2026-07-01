<script lang="ts">
  import { fade } from 'svelte/transition';
  import HeroStage from './HeroStage.svelte';
  import ContentSection from './ContentSection.svelte';
  import ContributorsSection from './ContributorsSection.svelte';
  import LandingFooter from './LandingFooter.svelte';
  import PlayButton from './PlayButton.svelte';

  let { onPlay }: { onPlay: () => void } = $props();

  let scrollEl = $state<HTMLDivElement | null>(null);
  let heroProgress = $state(0);

  function onscroll() {
    if (!scrollEl) return;
    // Use the actual hero-stage height so the calculation stays correct
    // across breakpoints (300dvh on desktop, 250dvh on mobile).
    const stageEl = scrollEl.firstElementChild as HTMLElement | null;
    const runway = (stageEl?.offsetHeight ?? 0) - scrollEl.clientHeight;
    heroProgress = runway > 0 ? Math.min(scrollEl.scrollTop / runway, 1) : 1;
  }
</script>

<div class="landing" bind:this={scrollEl} {onscroll} in:fade={{ duration: 600 }}>
  <HeroStage {heroProgress} {onPlay} />

  <!-- Section 1 (odd): cube left, text right -->
  <ContentSection cubeSpeed={0.12}>
    <h2 class="neon-heading section-heading">ANATOMY OF A CUBE</h2>
    <p class="section-intro">
      Ernő Rubik invented the Magic Cube in 1974. What looks like a single object is actually
      26 independent moving pieces — three types of cubies that each play a different role.
    </p>
    <dl class="cubie-types">
      <div class="cubie-entry">
        <dt>Centers <span class="count">×6</span></dt>
        <dd>
          Fixed in place. They never move relative to each other and define which color belongs
          to each face. The center is always the answer.
        </dd>
      </div>
      <div class="cubie-entry">
        <dt>Edges <span class="count">×12</span></dt>
        <dd>
          Two-colored pieces between two face centers. Each has two possible orientations —
          flipped or unflipped.
        </dd>
      </div>
      <div class="cubie-entry">
        <dt>Corners <span class="count">×8</span></dt>
        <dd>
          Three-colored pieces at each vertex. Each corner can sit in one of three rotational
          states.
        </dd>
      </div>
    </dl>
  </ContentSection>

  <!-- Section 2 (even): text left, cube right -->
  <ContentSection flip cubeSpeed={0.22}>
    <h2 class="neon-heading section-heading">43 QUINTILLION STATES</h2>
    <p class="section-intro">
      There are exactly 43,252,003,274,489,856,000 possible configurations of a 3×3×3
      Rubik's Cube — and only one solved state.
    </p>
    <p>
      If you turned one cube per second and started at the Big Bang, you still wouldn't have
      tried every permutation today. The number is so large it dwarfs the estimated number of
      atoms in the observable universe.
    </p>
    <p class="highlight-fact">
      Despite this, mathematicians proved in 2010 that <strong>any scramble can be solved in
      20 moves or fewer</strong> — a result known as God's Number.
    </p>
  </ContentSection>

  <!-- Section 3 (odd): cube left, text right -->
  <ContentSection cubeSpeed={0.18}>
    <h2 class="neon-heading section-heading">SINGMASTER NOTATION</h2>
    <p class="section-intro">
      Every move on the cube has a name. David Singmaster's notation assigns one letter to
      each of the six faces — giving solvers and algorithms a shared language.
    </p>
    <div class="notation-grid">
      {#each [['R','Right'],['L','Left'],['U','Up'],['D','Down'],['F','Front'],['B','Back']] as [key, label]}
        <div class="notation-cell">
          <span class="notation-key">{key}</span>
          <span class="notation-label">{label}</span>
        </div>
      {/each}
    </div>
    <p>
      A letter alone is a 90° clockwise turn. A prime <code>R′</code> reverses it.
      A "2" suffix <code>R2</code> means 180°. The entire solution to any scramble fits
      in fewer than 20 of these tokens.
    </p>
  </ContentSection>

  <!-- Section 4 (even): text left, cube right -->
  <ContentSection flip cubeSpeed={0.08}>
    <h2 class="neon-heading section-heading">LEARN THE WHY, NOT JUST THE HOW</h2>
    <p class="section-intro">
      Most tutorials teach you to memorize sequences. The problem: memorization breaks the
      moment the cube looks slightly different from the one in the guide.
    </p>
    <p>
      QWEN Rubik Instructor teaches through <strong>layer-by-layer logic</strong>. Each stage
      introduces only the moves it needs, with AI narration that explains <em>why</em> a
      sequence works — so you can apply the pattern to any scramble, not just the one shown.
    </p>
    <p>Start with one face. Then one layer. Then the whole cube.</p>
    <div class="section-cta">
      <PlayButton label="Start Learning" {onPlay} />
    </div>
  </ContentSection>

  <ContributorsSection />
  <LandingFooter />
</div>

<style>
  .landing {
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* ── Section copy styles ─────────────────────────── */

  .section-heading {
    font-size: clamp(18px, 3.5vw, 28px);
    margin-bottom: 16px;
  }

  .section-intro {
    color: var(--text);
    line-height: 1.65;
    margin-bottom: 20px;
  }

  :global(.text-col p) {
    color: var(--text-dim);
    line-height: 1.65;
    margin-bottom: 12px;
  }

  :global(.text-col p:last-child) {
    margin-bottom: 0;
  }

  :global(.text-col strong) {
    color: var(--text);
  }

  :global(.text-col em) {
    color: var(--accent-b);
    font-style: normal;
  }

  /* Cubie type list — Section 1 */
  .cubie-types {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
  }

  .cubie-entry dt {
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent-b);
    margin-bottom: 4px;
  }

  .cubie-entry .count {
    color: var(--accent-y);
    margin-left: 6px;
  }

  .cubie-entry dd {
    color: var(--text-dim);
    line-height: 1.6;
    margin: 0;
  }

  /* Highlighted fact — Section 2 */
  .highlight-fact {
    margin-top: 16px;
    padding: 14px 18px;
    border-left: 3px solid var(--accent-y);
    background: rgba(255, 213, 0, 0.05);
    border-radius: 0 8px 8px 0;
    color: var(--text-dim);
    line-height: 1.65;
  }

  .highlight-fact strong {
    color: var(--accent-y);
  }

  /* Notation grid — Section 3 */
  .notation-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin: 0 0 20px;
  }

  .notation-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
  }

  .notation-key {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 800;
    color: var(--accent-b);
    letter-spacing: 0.05em;
  }

  .notation-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  :global(.text-col code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--accent-y);
    background: rgba(255, 213, 0, 0.08);
    padding: 1px 5px;
    border-radius: 4px;
  }

  /* CTA — Section 4 */
  .section-cta {
    margin-top: 24px;
  }
</style>
