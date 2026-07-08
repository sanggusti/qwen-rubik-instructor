<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PlayCubeStage from '$lib/scene/PlayCubeStage.svelte';
  import TouchMovePad from '$lib/components/TouchMovePad.svelte';
  import StageCaption from '$lib/components/StageCaption.svelte';
  import PhysicalCameraWindow from '$lib/components/PhysicalCameraWindow.svelte';
  import HudBar from '$lib/components/HudBar.svelte';
  import AuthModal from '$lib/components/AuthModal.svelte';
  import ChallengeButton from '$lib/components/ChallengeButton.svelte';
  import ConfettiOverlay from '$lib/components/ConfettiOverlay.svelte';
  import LeaderboardModal from '$lib/components/LeaderboardModal.svelte';
  import { lessonStore } from '$lib/stores/lesson.svelte';
  import { practiceStore } from '$lib/stores/practice.svelte';
  import { walkthroughStore } from '$lib/stores/walkthrough.svelte';
  import { cubeStore } from '$lib/stores/cube.svelte';
  import { authStore } from '$lib/auth/store.svelte';
  import { challengeStore, CHALLENGE_SCRAMBLE_LENGTH } from '$lib/stores/challenge.svelte';
  import { physicalStore } from '$lib/stores/physical.svelte';
  import { startChallenge, submitScore } from '$lib/api/challenge';
  import { recordScramble } from '$lib/review/session';

  onMount(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute('content') ?? '';
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, maximum-scale=1');
    return () => meta?.setAttribute('content', original);
  });

  // E2E hook: dev-only, stripped from production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    w.__cubeStore = cubeStore;
    w.__challengeStore = challengeStore;
    w.__physicalStore = physicalStore;
  }

  // Only one experience runs at a time, so the stage caption has a single
  // owner. `keep: 'none'` ends every experience (used by tabs that own none,
  // e.g. State/Level) — same rule as the legacy main.ts's closeOthers.
  function closeOthers(keep: 'lesson' | 'practice' | 'walkthrough' | 'none'): void {
    if (keep !== 'lesson') lessonStore.closeLesson();
    if (keep !== 'practice') practiceStore.closeDrill();
    if (keep !== 'walkthrough') walkthroughStore.close();
  }

  // HudBar's "Keypad" button reveals the full-width bottom keypad.
  let keypadOpen = $state(false);

  // Keyboard shortcuts mean nothing on a touch device — point at the keypad.
  const isCoarsePointer =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // True when the stage caption (lesson/drill/walkthrough) is active.
  const stageVisible = $derived(
    lessonStore.snapshot.lesson !== null ||
    practiceStore.snapshot.drill !== null ||
    walkthroughStore.snapshot.walkthrough !== null
  );

  // On mobile: shrink the canvas to the top portion when the stage caption is
  // visible so the bottom panels (stage + keypad) don't overlap the cube.
  const cubeShiftUp = $derived(stageVisible);

  // First-visit controls hint: nothing else on this screen says how to turn
  // the cube. Gone after the first completed move or once a lesson/drill/
  // walkthrough owns the stage (or the keypad covers it).
  let hintDismissed = $state(false);
  $effect(() => cubeStore.onMove(() => (hintDismissed = true)));

  // Capture scrambles for the /review session (any source: HUD button, Space
  // key, challenge setup).
  $effect(() => cubeStore.onScramble((moves) => recordScramble(moves)));

  // --- Challenge mode -------------------------------------------------------
  let authModalOpen = $state(false);
  let showConfetti = $state(false);
  let showLeaderboard = $state(false);
  let finalTimeMs = $state(0);
  let gaveUp = $state(false);
  // Opaque session key issued by /challenge/start; redeemed by /challenge/score.
  // Kept null until the server confirms the session was created.
  let sessionKey = $state<string | null>(null);

  function onChallenge(): void {
    if (authStore.member?.hasUsername) {
      challengeStore.begin();
    } else {
      authModalOpen = true;
    }
  }

  // Sign-in + username complete → straight into the scramble.
  function onAuthReady(): void {
    authModalOpen = false;
    challengeStore.begin();
  }

  // The Google redirect reloads the page, so a first login lands here with a
  // member and no username yet — reopen the modal at the username step.
  $effect(() => {
    if (authStore.isLoaded && authStore.member && !authStore.member.hasUsername) {
      authModalOpen = true;
    }
  });

  // Auto-trigger challenge when landing via ?challenge=1.
  $effect(() => {
    if (!authStore.isLoaded) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('challenge')) return;
    url.searchParams.delete('challenge');
    history.replaceState(null, '', url);
    onChallenge();
  });

  // Timer starts once the scramble animation settles.
  // Request a server-side session key at the same moment so the backend knows
  // exactly when the clock started — the client never sends a solve time.
  $effect(() => {
    if (challengeStore.status === 'scrambling' && !cubeStore.isBusy) {
      challengeStore.start();
      if (authStore.token) {
        startChallenge(authStore.token, CHALLENGE_SCRAMBLE_LENGTH).then((result) => {
          sessionKey = result?.key ?? null;
        });
      }
    }
  });

  // rAF tick keeps the HUD timer moving while a run is live.
  $effect(() => {
    if (challengeStore.status !== 'running') return;
    let raf = requestAnimationFrame(function tick() {
      challengeStore.tick();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });

  // Solved (by real moves — Reset/Scramble cancel the run instead) → redeem the
  // session key so the backend records server-computed time, then celebrate.
  $effect(() => {
    if (challengeStore.status === 'running' && cubeStore.isSolved && !cubeStore.isBusy) {
      challengeStore.finish();
      finalTimeMs = challengeStore.elapsedMs;
      const key = sessionKey;
      sessionKey = null;
      showConfetti = true;
      if (authStore.token && key) {
        submitScore(authStore.token, key).then((result) => {
          // Use server-computed time for the modal if it arrives before confetti ends.
          if (result?.solveTimeMs) finalTimeMs = result.solveTimeMs;
        });
      }
    }
  });

  function onGiveUp(): void {
    finalTimeMs = challengeStore.elapsedMs;
    const key = sessionKey;
    sessionKey = null;
    challengeStore.cancel();
    gaveUp = true;
    showLeaderboard = true;
    if (authStore.token && key) {
      submitScore(authStore.token, key, 'give_up').then((result) => {
        if (result?.solveTimeMs) finalTimeMs = result.solveTimeMs;
      });
    }
  }

  function onConfettiDone(): void {
    showConfetti = false;
    showLeaderboard = true;
  }

  function onPlayAgain(): void {
    showLeaderboard = false;
    gaveUp = false;
    challengeStore.reset();
  }

  function onGoHome(): void {
    showLeaderboard = false;
    gaveUp = false;
    challengeStore.reset();
    void goto('/');
  }
  const hintVisible = $derived(
    !hintDismissed &&
      !keypadOpen &&
      !physicalStore.active &&
      lessonStore.snapshot.lesson === null &&
      practiceStore.snapshot.drill === null &&
      walkthroughStore.snapshot.walkthrough === null
  );
</script>

<svelte:head>
  <title>Play — Rubik Instructor</title>
  <meta name="description" content="Solve the Rubik's Cube with AI-guided lessons, timed challenges, and a live leaderboard." />
  <meta property="og:title" content="Play — Rubik Instructor" />
  <meta property="og:description" content="Solve the Rubik's Cube with AI-guided lessons, timed challenges, and a live leaderboard." />
  <meta property="og:url" content="https://rubik-instructor.vercel.app/play" />
  <link rel="canonical" href="https://rubik-instructor.vercel.app/play" />
  <meta name="robots" content="noindex" />
</svelte:head>

<PlayCubeStage shiftUp={cubeShiftUp} />

<TouchMovePad open={keypadOpen && !physicalStore.active} onClose={() => (keypadOpen = false)} />
<StageCaption raised={keypadOpen} />
<PhysicalCameraWindow />
<HudBar onOpenExperience={closeOthers} {keypadOpen} onToggleKeypad={() => (keypadOpen = !keypadOpen)} {onChallenge} {onGiveUp} />
{#if challengeStore.status === 'idle' || challengeStore.status === 'solved'}
  <ChallengeButton layout="mobile" onclick={onChallenge} />
{/if}

{#if authModalOpen}
  <AuthModal onClose={() => (authModalOpen = false)} onReady={onAuthReady} />
{/if}
{#if showConfetti}
  <ConfettiOverlay onDone={onConfettiDone} />
{/if}
{#if showLeaderboard}
  <LeaderboardModal solveTimeMs={finalTimeMs} {gaveUp} {onPlayAgain} {onGoHome} />
{/if}

{#if hintVisible}
  <div class="controls-hint">
    {#if isCoarsePointer}
      Drag a face to turn it · <b>Keypad</b> for precise moves · open <b>Guide</b> for lessons
    {:else}
      Drag a face to turn it · keys <b>R L U D F B</b>, hold <b>Shift</b> to reverse · <b>Space</b> scramble · <b>Enter</b> reset · open <b>Guide</b> for lessons
    {/if}
  </div>
{/if}

<style>
  .controls-hint {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 10;
    max-width: min(92vw, 640px);
    text-align: center;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 12px;
    color: var(--text-dim);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    pointer-events: none;
  }
  .controls-hint b {
    color: var(--accent-b);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    /* Sit above the bottom-centred Scramble/Reset quick actions. */
    .controls-hint {
      bottom: calc(72px + env(safe-area-inset-bottom));
    }
  }
</style>
