<script lang="ts">
  import { lessonStore } from '../stores/lesson.svelte';
  import { practiceStore } from '../stores/practice.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';
  import { demoStore } from '../stores/demo.svelte';
  import { cubeStore } from '../stores/cube.svelte';
  import { physicalStore } from '../stores/physical.svelte';
  import { profileStore } from '../stores/profile.svelte';
  import { askQwen } from '../api/narrate';
  import { segmentBeat, slicePhrases } from '../physical/chunking';

  let { raised = false }: { raised?: boolean } = $props();

  type Owner = 'lesson' | 'practice' | 'walkthrough';

  const active = $derived.by((): { owner: Owner; title: string; body: string; move: string | null; stream: boolean } | null => {
    const lesson = lessonStore.snapshot;
    if (lesson.lesson) {
      return { owner: 'lesson', title: lesson.lesson.title, body: `${lesson.step.title} — ${lesson.step.body}`, move: null, stream: false };
    }
    const practice = practiceStore.snapshot;
    if (practice.drill) {
      const body = practice.completed
        ? `Drill complete ✓  Score ${practice.score}/${practice.roundCount}`
        : `${practice.drill.prompt}  ·  Round ${Math.min(practice.round + 1, practice.roundCount)} of ${practice.roundCount} · Score ${practice.score}  ·  ${practice.evaluation.message}`;
      return { owner: 'practice', title: practice.drill.title, body, move: null, stream: false };
    }
    const walkthrough = walkthroughStore.snapshot;
    if (walkthrough.walkthrough) {
      const move = walkthrough.currentMove ? `${walkthrough.currentMove} · ${walkthrough.moveIndex + 1}/${walkthrough.moveCount}` : null;
      return { owner: 'walkthrough', title: walkthrough.walkthrough.title, body: walkthrough.beat.text, move, stream: true };
    }
    return null;
  });

  let displayedBody = $state('');
  let lastKey = '';

  // Physical read-along: beats are performed in 3-6 move chunks (segmentBeat)
  // and each chunk's moves are applied to the mirror exactly once on
  // confirmation. Confirmed-beat tracking survives navigating back with Prev;
  // everything resets when a new walkthrough loads.
  let confirmedBeats = $state(new Set<number>());
  let confirmedFor = $state<string | null>(null);
  let chunkKey = $state('');
  let chunkPos = $state(0);

  function confirmChunk(
    beatKey: string,
    beatIndex: number,
    moves: string[],
    pos: number,
    chunkCount: number,
    last: boolean
  ): void {
    physicalStore.confirmMoves(moves);
    if (pos + 1 < chunkCount) {
      chunkKey = beatKey;
      chunkPos = pos + 1;
      return;
    }
    const id = walkthroughStore.snapshot.walkthrough?.id ?? null;
    if (confirmedFor !== id) {
      confirmedBeats = new Set();
      confirmedFor = id;
    }
    confirmedBeats = new Set(confirmedBeats).add(beatIndex);
    chunkKey = '';
    chunkPos = 0;
    if (!last) walkthroughStore.next();
  }

  function beatConfirmed(beatIndex: number): boolean {
    return confirmedFor === (walkthroughStore.snapshot.walkthrough?.id ?? null) &&
      confirmedBeats.has(beatIndex);
  }

  let question = $state('');
  let asking = $state(false);
  let answer = $state('');

  async function ask(ev: SubmitEvent): Promise<void> {
    ev.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    asking = true;
    try {
      answer = await askQwen({
        question: q,
        stage: active?.title,
        state: cubeStore.getState(),
        userId: profileStore.profile.sessionId
      });
      question = '';
    } catch (err) {
      answer = `Couldn't ask: ${(err as Error).message}`;
    } finally {
      asking = false;
    }
  }

  // Stream walkthrough narration in (typewriter); other owners' text is set
  // immediately. Lesson branch renders directly from snapshot — skip streaming.
  $effect(() => {
    const a = active;
    if (!a) {
      displayedBody = '';
      lastKey = '';
      answer = '';
      return;
    }
    if (a.owner === 'lesson') return;
    const key = `${a.owner}:${a.body}`;
    if (key === lastKey) return;
    lastKey = key;
    answer = '';
    if (!a.stream) {
      displayedBody = a.body;
      return;
    }
    displayedBody = '';
    let i = 0;
    const step = (): void => {
      if (lastKey !== key) return;
      i = Math.min(a.body.length, i + 1);
      displayedBody = a.body.slice(0, i);
      if (i < a.body.length) setTimeout(step, 22);
    };
    step();
  });

  function close(): void {
    if (!active) return;
    if (active.owner === 'lesson') lessonStore.closeLesson();
    else if (active.owner === 'practice') practiceStore.closeDrill();
    else walkthroughStore.close();
  }
</script>

{#if active && !physicalStore.cameraOpen}
  <div class="stage is-open" class:demo-open={demoStore.open} class:raised class:lesson-owner={active.owner === 'lesson'}>
    <button class="stage-close" type="button" aria-label="End" onclick={close}>×</button>
    <div class="stage-title">{active.title}</div>

    {#if active.owner === 'lesson'}
      {@const snap = lessonStore.snapshot}
      {#if snap.lesson}
        <div class="stage-counter">Step {snap.stepIndex + 1} of {snap.stepCount}</div>
        <h5 class="stage-step-title">{snap.step.title}</h5>
        <p class="stage-body">{snap.step.body}</p>
        {#if snap.step.expectedMoves?.length}
          <div class="stage-move">{snap.step.expectedMoves.join(' ')}</div>
        {/if}
        <div class="stage-status" class:done={snap.stepCompleted}>
          {snap.stepCompleted ? (snap.lessonCompleted ? 'Lesson complete ✓' : 'Step complete ✓') : 'In progress'}
        </div>
        {#if snap.coachingMessages.length}
          <div class="stage-coaching">
            {#each snap.coachingMessages as msg, i (i)}
              <div class="stage-coaching-item {msg.kind}">
                <strong>{msg.title}</strong>
                <p>{msg.body}</p>
              </div>
            {/each}
          </div>
        {/if}
        <div class="stage-actions">
          {#if snap.step.setupMoves?.length}
            <button type="button" class="stage-btn" onclick={() => lessonStore.applySetupMoves()}>Set up step</button>
          {/if}
          {#if snap.step.expectedMoves?.length}
            <button type="button" class="stage-btn" onclick={() => lessonStore.showDemo()}>Show me how</button>
            <button type="button" class="stage-btn" onclick={() => lessonStore.applyExampleMoves()}>Apply example moves</button>
          {/if}
          <button
            type="button"
            class="stage-btn"
            class:emphasis={snap.coachingMessages.some((m) => m.kind === 'mistake')}
            onclick={() => lessonStore.backToCheckpoint()}
          >Back to checkpoint</button>
          {#if snap.step.validator.type === 'manual' && !snap.stepCompleted}
            <button type="button" class="stage-btn" onclick={() => lessonStore.markComplete()}>Mark complete</button>
          {/if}
        </div>
        <div class="stage-actions">
          <button type="button" class="stage-btn" disabled={snap.stepIndex === 0} onclick={() => lessonStore.previous()}>Previous</button>
          <button type="button" class="stage-btn" disabled={snap.stepIndex >= snap.stepCount - 1} onclick={() => lessonStore.next()}>Next</button>
          <button type="button" class="stage-btn" onclick={() => lessonStore.resetLesson()}>Reset lesson</button>
        </div>
      {/if}
    {:else}
      <p class="stage-body">{displayedBody}</p>
      {#if active.owner === 'walkthrough' && physicalStore.active && walkthroughStore.snapshot.walkthrough}
        <!-- Physical read-along: the learner performs each beat on their real
             cube, then confirms; the mirror advances by the expected moves.
             The intro beat's moves are the reconstructed scramble (data, not
             instructions) so it only offers Start. -->
        {@const s = walkthroughStore.snapshot}
        {#if s.beat.moves?.length && s.beatIndex > 0 && !beatConfirmed(s.beatIndex)}
          {@const chunks = segmentBeat(s.beat.moves)}
          {@const beatKey = `${s.walkthrough.id}:${s.beatIndex}`}
          {@const pos = Math.min(chunkKey === beatKey ? chunkPos : 0, chunks.length - 1)}
          {@const chunk = chunks[pos]}
          <div class="stage-move physical-moves">{chunk.moves.join(' ')}</div>
          {#if chunks.length > 1}
            <div class="stage-counter">Part {pos + 1} of {chunks.length}</div>
          {/if}
          {#each slicePhrases(chunk.moves) as hint (hint)}
            <p class="stage-slice-hint">{hint}</p>
          {/each}
          <div class="stage-actions">
            <button
              type="button"
              class="stage-btn emphasis"
              onclick={() =>
                confirmChunk(
                  beatKey,
                  s.beatIndex,
                  chunk.moves,
                  pos,
                  chunks.length,
                  s.beatIndex >= s.beatCount - 1
                )}
            >I did these on my cube ✓</button>
            <button
              type="button"
              class="stage-btn"
              onclick={() => physicalStore.startVerify(2, chunk.moves)}
            >📷 Check my cube</button>
          </div>
        {:else if s.beatIndex > 0 && beatConfirmed(s.beatIndex) && s.beatIndex >= s.beatCount - 1}
          <div class="stage-status done">Walkthrough complete ✓</div>
          <div class="stage-actions">
            <button type="button" class="stage-btn" onclick={() => physicalStore.startVerify(2)}>
              📷 Check my cube
            </button>
          </div>
        {:else if s.beatIndex < s.beatCount - 1}
          <!-- Intro beat (its moves are the reconstructed scramble, not
               instructions) or a text-only beat: plain advance. -->
          <div class="stage-actions">
            <button type="button" class="stage-btn" onclick={() => walkthroughStore.next()}>
              {s.beatIndex === 0 ? 'Start →' : 'Next →'}
            </button>
            {#if s.beatIndex > 0}
              <button type="button" class="stage-btn" onclick={() => physicalStore.startVerify(2)}>
                📷 Check my cube
              </button>
            {/if}
          </div>
        {/if}
      {:else if active.move}
        <div class="stage-move">{active.move}</div>
      {/if}
    {/if}

    <form class="stage-ask" onsubmit={ask}>
      <input
        class="stage-ask-input"
        type="text"
        placeholder="Ask Qwen about this step…"
        aria-label="Ask Qwen"
        bind:value={question}
      />
      <button class="stage-ask-btn" type="submit" disabled={!question.trim() || asking}>
        {asking ? 'Asking…' : 'Ask'}
      </button>
    </form>
    {#if answer}
      <p class="stage-answer">{answer}</p>
    {/if}
  </div>
{/if}

<style>
  .stage {
    position: fixed;
    top: 50%;
    left: 57%;
    transform: translateY(-50%);
    width: min(32%, 340px);
    max-height: 70vh;
    overflow-y: auto;
    padding: 18px 20px;
    border-radius: 16px;
    color: var(--text);
    z-index: 15;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
  }
  .stage.lesson-owner {
    max-height: 80vh;
  }
  .stage::-webkit-scrollbar {
    width: 6px;
  }
  .stage::-webkit-scrollbar-thumb {
    background: var(--accent-b-dim);
    border-radius: 6px;
  }
  .stage-close {
    position: absolute;
    top: 10px;
    right: 12px;
    appearance: none;
    cursor: pointer;
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 20px;
    line-height: 1;
    padding: 0 4px;
  }
  .stage-close:hover {
    color: var(--text);
  }
  .stage-title {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-a);
    text-shadow: 0 0 12px var(--accent-a-dim);
    margin-bottom: 10px;
    padding-right: 18px;
  }
  .stage-counter {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 4px;
  }
  .stage-step-title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .stage-body {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    min-height: 2em;
    white-space: pre-line;
    margin-bottom: 8px;
  }
  /* Physical read-along: readable at arm's length with a cube in hand. */
  .stage-move.physical-moves {
    font-size: 26px;
    line-height: 1.35;
    white-space: normal;
  }
  .stage-slice-hint {
    margin: 2px 0 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .stage-move {
    margin-top: 6px;
    margin-bottom: 8px;
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--bg-deep);
    background: var(--accent-b);
    border-radius: 7px;
    padding: 3px 10px;
    box-shadow: 0 0 12px var(--accent-b-dim);
  }
  .stage-status {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .stage-status.done {
    color: var(--ok);
    text-shadow: 0 0 10px var(--ok-dim);
  }
  .stage-coaching {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }
  .stage-coaching-item {
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 7px 8px;
    background: rgba(255, 255, 255, 0.04);
  }
  .stage-coaching-item strong {
    display: block;
    margin-bottom: 3px;
    font-size: 11px;
    color: var(--accent-a);
  }
  .stage-coaching-item p {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .stage-coaching-item.mistake {
    border-color: var(--no-dim);
  }
  .stage-coaching-item.mistake strong {
    color: var(--no);
  }
  .stage-coaching-item.recommendation strong {
    color: var(--ok);
  }
  .stage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .stage-btn {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent-b);
    background: var(--accent-b-bg);
    border: 1px solid var(--accent-b);
    border-radius: 8px;
    padding: 6px 12px;
    transition: box-shadow 0.15s ease;
  }
  .stage-btn:hover:not(:disabled) {
    box-shadow: 0 0 12px var(--accent-b-dim);
  }
  .stage-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stage-btn.emphasis {
    border-color: var(--accent-b);
    box-shadow: 0 0 12px var(--accent-b-dim);
  }
  .stage-ask {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }
  .stage-ask-input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
    font-size: 12px;
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .stage-ask-input::placeholder {
    color: var(--text-dim);
  }
  .stage-ask-btn {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 6px 10px;
    transition: border-color 0.15s ease;
  }
  .stage-ask-btn:hover:not(:disabled) {
    border-color: var(--accent-b-dim);
  }
  .stage-ask-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stage-answer {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-dim);
    border-top: 1px solid var(--panel-border);
    padding-top: 8px;
    white-space: pre-line;
  }

  /* Desktop: demo window docked on the right — avoid overlap */
  .stage.demo-open {
    top: auto;
    bottom: 20px;
    left: 16px;
    right: calc(min(30vw, 360px) + 48px);
    transform: none;
    width: auto;
    max-width: 520px;
    margin: 0 auto;
    max-height: 24vh;
  }

  @media (max-width: 760px) {
    /* Full-width bottom sheet on mobile */
    .stage {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      transform: none;
      width: auto;
      max-height: 40vh;
      border-radius: 16px 16px 0 0;
      border-bottom: none;
    }
    .stage.lesson-owner {
      max-height: 50vh;
    }
    /* Sit above the full-width keypad bar (~162px) */
    .stage.raised {
      bottom: calc(162px + env(safe-area-inset-bottom));
      max-height: 38vh;
    }
    /* Mobile demo is a bottom sheet — tuck caption top-right */
    .stage.demo-open {
      top: calc(env(safe-area-inset-top) + 80px);
      bottom: auto;
      left: auto;
      right: 10px;
      transform: none;
      width: min(72vw, 320px);
      border-radius: 16px;
      border-bottom: revert;
      max-width: none;
      margin: 0;
      max-height: 17vh;
    }
  }
</style>
