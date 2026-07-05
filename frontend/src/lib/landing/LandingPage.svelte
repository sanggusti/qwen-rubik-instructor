<script lang="ts">
  import { fade } from 'svelte/transition';
  import HeroStage from './HeroStage.svelte';
  import ContentSection from './ContentSection.svelte';
  import ContributorsSection from './ContributorsSection.svelte';
  import LeaderboardSection from './LeaderboardSection.svelte';
  import LandingFooter from './LandingFooter.svelte';
  import PlayButton from './PlayButton.svelte';
  import CountUp from './CountUp.svelte';
  import LandingScene from './LandingScene.svelte';
  import { buildTimeline, type Timeline } from './timeline';
  import { SCRAMBLE, SOLUTION } from './solve-sequence';

  let { onPlay }: { onPlay: () => void } = $props();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scrollEl = $state<HTMLDivElement | null>(null);
  let heroProgress = $state(0);
  let progress = $state(0);
  let timeline = $state<Timeline | null>(null);
  let cameraPosition = $state<[number, number, number]>([5, 5, 7]);
  let parkedX = $state(-2.2);
  let heroEl: HTMLElement | null = null;

  // Measure the real layout (hero runway, section centers and cube sides) and
  // rebuild the scroll→pose timeline. Re-run on resize: breakpoints move
  // everything.
  function measure() {
    if (!scrollEl) return;
    const vh = scrollEl.clientHeight;
    const runway = scrollEl.scrollHeight - vh;
    heroEl = scrollEl.querySelector('.hero-stage');
    if (!heroEl || runway <= 0) return;

    const sections = Array.from(scrollEl.querySelectorAll('.content-section')) as HTMLElement[];
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    cameraPosition = narrow ? [7, 7, 9.5] : [5, 5, 7];
    parkedX = narrow ? 0 : -2.2;

    timeline = buildTimeline(
      {
        heroEnd: clamp01((heroEl.offsetHeight - vh) / runway),
        sectionCenters: sections.map(el =>
          clamp01((el.offsetTop + el.offsetHeight / 2 - vh / 2) / runway)
        ),
        sides: sections.map(el => (el.classList.contains('flip') ? 1 : -1))
      },
      narrow ? 0.9 : 2.2,
      SCRAMBLE.length,
      SOLUTION.length
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
      const vh = scrollEl.clientHeight;
      // Hero progress drives the overlay fades (300dvh on desktop, 250dvh mobile).
      const heroRunway = (heroEl?.offsetHeight ?? 0) - vh;
      heroProgress = heroRunway > 0 ? Math.min(scrollEl.scrollTop / heroRunway, 1) : 1;
      // Overall progress drives the persistent cube.
      const runway = scrollEl.scrollHeight - vh;
      progress = runway > 0 ? Math.min(scrollEl.scrollTop / runway, 1) : 0;
    });
  }
</script>

<div class="landing" bind:this={scrollEl} {onscroll} in:fade={{ duration: 600 }}>
  <LandingScene {progress} {timeline} {reducedMotion} {cameraPosition} {parkedX} />

  <div class="content">
  <HeroStage {heroProgress} {onPlay} />

  <!-- Section 1 (odd): cube left, text right -->
  <ContentSection>
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
  <ContentSection flip>
    <h2 class="neon-heading section-heading">43 QUINTILLION STATES</h2>
    <p class="section-intro big-number">
      <CountUp value={43252003274489856000n} />
    </p>
    <p>
      That's how many configurations a 3×3×3 Rubik's Cube has — and exactly one of them is
      solved. If you turned one cube per second and started at the Big Bang, you still
      wouldn't have tried every permutation today.
    </p>
    <p class="highlight-fact">
      Despite this, mathematicians proved in 2010 that <strong>any scramble can be solved in
      20 moves or fewer</strong> — a result known as God's Number.
    </p>
  </ContentSection>

  <!-- Section 3 (odd): cube left, text right -->
  <ContentSection>
    <h2 class="neon-heading section-heading">SO WE STOPPED ASKING THE AI TO GUESS</h2>
    <p class="section-intro">
      A deterministic layer-by-layer solver finds the answer. Every solution is replayed on
      the cube and proven solved before you ever see it.
    </p>
    <p>
      The AI never invents a move. It teaches on top of a solution that is already verified —
      so the cube never "solves" itself into nonsense.
    </p>
    <p class="highlight-fact">
      One 13-move scramble first produced a <strong>246-move salad with 32 whole-cube
      spins</strong>. We optimized it to 210 moves and zero spins — something a human can
      actually follow.
    </p>
  </ContentSection>

  <!-- Section 4 (even): text left, cube right -->
  <ContentSection flip>
    <h2 class="neon-heading section-heading">THEN WE HANDED THE TEACHING TO QWEN</h2>
    <p class="section-intro">
      The solver is always right. Qwen makes it make sense — narrating each move live over a
      streaming connection, in a style tuned to your level.
    </p>
    <div class="narration-feed">
      <p><span class="move">R U R′</span> Lift the white-red edge out of the way, then tuck it home.</p>
      <p><span class="move">U′</span> Line the next edge up under its center before dropping it in.</p>
      <p><span class="move">F R U</span> Notice the pattern? Same idea, new corner. You've got this.</p>
    </div>
  </ContentSection>

  <!-- Section 5 (odd): cube left, text right -->
  <ContentSection>
    <h2 class="neon-heading section-heading">SINGMASTER NOTATION</h2>
    <p class="section-intro">
      Every move on the cube has a name. David Singmaster's notation assigns one letter to
      each of the six faces — giving solvers and algorithms a shared language.
    </p>
    <div class="notation-grid">
      {#each [['R','Right'],['L','Left'],['U','Up'],['D','Down'],['F','Front'],['B','Back']] as [key, label] (key)}
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

  <!-- Section 6 (even): text left, cube right -->
  <ContentSection flip>
    <h2 class="neon-heading section-heading">IT TEACHES LIKE A TUTOR, NOT A ROBOT</h2>
    <ul class="feature-list">
      <li>Guided lessons that build up layer by layer</li>
      <li>Practice drills scoped to the skill you're on</li>
      <li>Ask Qwen anything mid-solve</li>
      <li>A "get unstuck" rescue when a drill goes sideways</li>
    </ul>
    <p>
      It remembers what you struggle with — and forgets what you've mastered, resurfacing it
      weeks later when review is due. The tutor adapts to you, not the other way around.
    </p>
  </ContentSection>

  <!-- Section 7 (odd): cube left, text right -->
  <ContentSection>
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
      <PlayButton label="Start solving →" {onPlay} />
    </div>
  </ContentSection>

  <LeaderboardSection />

  <ContributorsSection />
  <LandingFooter />
  </div>
</div>

<style>
  .landing {
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

  /* Rolling permutation counter — Section 2 */
  .big-number {
    font-size: clamp(16px, 2.6vw, 24px);
    letter-spacing: 0.02em;
    word-break: break-all;
  }

  /* Highlighted fact — Sections 2 & 3 */
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

  /* Faux SSE narration lines — Section 4 */
  .narration-feed {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-left: 3px solid var(--accent-b);
    background: var(--accent-b-bg);
    border-radius: 0 8px 8px 0;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .narration-feed p {
    margin: 0;
  }

  .narration-feed .move {
    color: var(--accent-b);
    margin-right: 8px;
  }

  .narration-feed .move::before {
    content: '▶ ';
  }

  /* MemoryAgent bullets — Section 6 */
  .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0 0 16px;
    padding: 0;
    color: var(--text);
    line-height: 1.5;
  }

  .feature-list li::before {
    content: '▸ ';
    color: var(--accent-a);
  }

  /* Notation grid — Section 5 */
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

  /* CTA — Section 7 */
  .section-cta {
    margin-top: 24px;
  }
</style>
