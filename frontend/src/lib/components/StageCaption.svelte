<script lang="ts">
  import { lessonStore } from '../stores/lesson.svelte';
  import { practiceStore } from '../stores/practice.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';
  import { demoStore } from '../stores/demo.svelte';
  import { cubeStore } from '../stores/cube.svelte';
  import { profileStore } from '../stores/profile.svelte';
  import { askQwen } from '../api/narrate';

  // On touch devices the open keypad occupies the caption's mobile spot at the
  // bottom of the screen; `raised` lifts the caption above it so the learner
  // can read the step and tap moves at the same time.
  let { raised = false }: { raised?: boolean } = $props();

  type Owner = 'lesson' | 'practice' | 'walkthrough';

  // Only one experience owns the caption at a time (closeOthers in +page.svelte
  // guarantees at most one of these snapshots is non-null), so priority here
  // only matters for the instant in between a switch.
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

  // Manual lesson steps tell the learner to "press Mark complete", so the
  // button has to live here on the caption — the Lessons panel is closed.
  const showMarkComplete = $derived.by(() => {
    const s = lessonStore.snapshot;
    return s.lesson !== null && s.step.validator.type === 'manual' && !s.stepCompleted;
  });

  let question = $state('');
  let asking = $state(false);
  let answer = $state('');

  // Ask Qwen a free-form question, grounded in the current step and cube state.
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
  // immediately. Re-emits with the same (owner, text) — e.g. play/pause —
  // don't restart the stream.
  $effect(() => {
    const a = active;
    if (!a) {
      displayedBody = '';
      lastKey = '';
      answer = '';
      return;
    }
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
    // The effect re-runs on every store emit (e.g. per-move progress), so the
    // chain must survive re-runs: it self-terminates when a newer caption
    // takes over instead of being torn down (which froze text mid-sentence).
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

{#if active}
  <div class="stage is-open" class:demo-open={demoStore.open} class:raised>
    <button class="stage-close" type="button" aria-label="End" onclick={close}>×</button>
    <div class="stage-title">{active.title}</div>
    <p class="stage-body">{displayedBody}</p>
    {#if active.move}
      <div class="stage-move">{active.move}</div>
    {/if}
    {#if showMarkComplete}
      <button class="stage-btn" type="button" onclick={() => lessonStore.markComplete()}>Mark complete</button>
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
  .stage-body {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    min-height: 4.5em;
    white-space: pre-line;
  }
  .stage-move {
    margin-top: 10px;
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

  .stage-btn {
    appearance: none;
    cursor: pointer;
    display: block;
    margin-top: 10px;
    font-family: inherit;
    font-size: 12px;
    color: var(--accent-b);
    background: var(--accent-b-bg);
    border: 1px solid var(--accent-b);
    border-radius: 8px;
    padding: 6px 12px;
    transition: box-shadow 0.15s ease;
  }
  .stage-btn:hover {
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

  /* While the demo window is docked on the right, drop the caption to the bottom
     of the free space on the left (under the shifted cube) so it isn't covered. */
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
    .stage {
      top: auto;
      bottom: calc(64px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      width: min(92vw, 440px);
      max-height: 30vh;
    }
    /* Clear the open touch keypad (~210px tall, anchored just above the
       quick actions). Declared before .demo-open so that placement wins. */
    .stage.raised {
      bottom: calc(300px + env(safe-area-inset-bottom));
      /* There's more headroom above the keypad than at the screen edge — let
         the caption grow upward so step text, button, and ask input all fit. */
      max-height: 38vh;
    }
    /* Mobile demo is a bottom sheet, so tuck the caption top-right — below the
       top-left Guide toggle and above the sheet. */
    .stage.demo-open {
      top: calc(env(safe-area-inset-top) + 80px);
      bottom: auto;
      left: auto;
      right: 10px;
      transform: none;
      width: min(72vw, 320px);
      max-width: none;
      margin: 0;
      max-height: 17vh;
    }
  }
</style>
