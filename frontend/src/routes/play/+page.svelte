<script lang="ts">
  import { goto } from '$app/navigation';
  import CubeCanvas from '$lib/scene/CubeCanvas.svelte';
  import CubeMesh from '$lib/scene/CubeMesh.svelte';
  import TouchMovePad from '$lib/components/TouchMovePad.svelte';
  import StageCaption from '$lib/components/StageCaption.svelte';
  import DemoCubeWindow from '$lib/components/DemoCubeWindow.svelte';
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
  import { submitScore } from '$lib/api/challenge';

  // E2E hook: dev-only, stripped from production builds.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__cubeStore = cubeStore;
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

  // --- Challenge mode -------------------------------------------------------
  let authModalOpen = $state(false);
  let showConfetti = $state(false);
  let showLeaderboard = $state(false);
  let finalTimeMs = $state(0);

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

  // Timer starts once the scramble animation settles.
  $effect(() => {
    if (challengeStore.status === 'scrambling' && !cubeStore.isBusy) {
      challengeStore.start();
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

  // Solved (by real moves — Reset/Scramble cancel the run instead) → record,
  // celebrate, then show the board.
  $effect(() => {
    if (challengeStore.status === 'running' && cubeStore.isSolved && !cubeStore.isBusy) {
      challengeStore.finish();
      finalTimeMs = challengeStore.elapsedMs;
      if (authStore.token) {
        void submitScore(authStore.token, Math.round(finalTimeMs), CHALLENGE_SCRAMBLE_LENGTH);
      }
      showConfetti = true;
    }
  });

  function onConfettiDone(): void {
    showConfetti = false;
    showLeaderboard = true;
  }

  function onPlayAgain(): void {
    showLeaderboard = false;
    challengeStore.reset();
  }

  function onGoHome(): void {
    showLeaderboard = false;
    challengeStore.reset();
    void goto('/');
  }
  const hintVisible = $derived(
    !hintDismissed &&
      !keypadOpen &&
      lessonStore.snapshot.lesson === null &&
      practiceStore.snapshot.drill === null &&
      walkthroughStore.snapshot.walkthrough === null
  );
</script>

<CubeCanvas shiftUp={cubeShiftUp}>
  <CubeMesh />
</CubeCanvas>

<TouchMovePad open={keypadOpen} onClose={() => (keypadOpen = false)} />
<StageCaption raised={keypadOpen} />
<DemoCubeWindow />
<HudBar onOpenExperience={closeOthers} {keypadOpen} onToggleKeypad={() => (keypadOpen = !keypadOpen)} {onChallenge} />
<ChallengeButton layout="mobile" onclick={onChallenge} />

{#if authModalOpen}
  <AuthModal onClose={() => (authModalOpen = false)} onReady={onAuthReady} />
{/if}
{#if showConfetti}
  <ConfettiOverlay onDone={onConfettiDone} />
{/if}
{#if showLeaderboard}
  <LeaderboardModal solveTimeMs={finalTimeMs} {onPlayAgain} {onGoHome} />
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
