<script lang="ts">
  // /review — the final review canvas. Loads the captured session from
  // localStorage; on a fresh device, falls back to the Turso mirror before
  // giving up on the empty state. Compilation validates the capture (and that
  // it lands solved), so a bad capture degrades to the empty state, never a
  // broken scrub.
  import { fetchReviewSession } from '$lib/api/review';
  import { compileReview, type CompiledReview } from '$lib/review/compile';
  import {
    hydrateReviewSession,
    loadReviewSession,
    type ReviewSession
  } from '$lib/review/session';
  import CoursepathSummary from '$lib/review/CoursepathSummary.svelte';
  import PracticeSummary from '$lib/review/PracticeSummary.svelte';
  import ReviewPage from '$lib/review/ReviewPage.svelte';
  import { profileStore } from '$lib/stores/profile.svelte';

  function compileFrom(s: ReviewSession | null): CompiledReview | null {
    return s?.solve ? compileReview(s.solve.beats) : null;
  }

  const local = loadReviewSession();
  const localCompiled = compileFrom(local);
  let session = $state<ReviewSession | null>(local);
  let compiled = $state<CompiledReview | null>(localCompiled);
  let checkingMirror = $state(false);

  if (!localCompiled) {
    checkingMirror = true;
    void fetchReviewSession(profileStore.profile.sessionId).then((remote) => {
      const remoteCompiled = compileFrom(remote);
      if (remote && remoteCompiled) {
        hydrateReviewSession(remote);
        session = remote;
        compiled = remoteCompiled;
      }
      checkingMirror = false;
    });
  }

  // E2E hook: lets the browser spec assert the compiled shape directly.
  $effect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __reviewCompiled?: CompiledReview | null }).__reviewCompiled =
        compiled;
    }
  });
</script>

<svelte:head>
  <title>Session review — Rubik Instructor</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if compiled && session?.solve}
  <ReviewPage {compiled} solve={session.solve}>
    <CoursepathSummary />
    <PracticeSummary />
    <footer class="review-footer">
      <a href="/play">← Back to the cube</a>
    </footer>
  </ReviewPage>
{:else if checkingMirror}
  <main class="review-empty">
    <p class="empty-note">Looking for your last session…</p>
  </main>
{:else}
  <main class="review-empty">
    <h1 class="neon-heading">Nothing to review yet</h1>
    <p class="empty-note">
      Scramble your cube on the play screen and ask Qwen to solve it — the narrated solve is
      captured here so you can replay it on a real cube, checkpoint by checkpoint.
    </p>
    <a class="empty-cta" href="/play">Go play →</a>
  </main>
{/if}

<style>
  .review-empty {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 16px;
    padding: 24px;
  }

  .empty-note {
    max-width: 480px;
    color: var(--text-dim);
    line-height: 1.65;
    margin: 0;
  }

  .empty-cta {
    color: var(--accent-b);
    text-decoration: none;
    font-family: var(--font-display);
    letter-spacing: 0.06em;
  }

  .empty-cta:hover {
    text-decoration: underline;
  }

  .review-footer {
    display: flex;
    justify-content: center;
    padding: 48px 24px 64px;
  }

  .review-footer a {
    color: var(--accent-b);
    text-decoration: none;
  }

  .review-footer a:hover {
    text-decoration: underline;
  }
</style>
