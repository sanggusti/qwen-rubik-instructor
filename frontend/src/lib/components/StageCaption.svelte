<script lang="ts">
  import { lessonStore } from '../stores/lesson.svelte';
  import { practiceStore } from '../stores/practice.svelte';
  import { walkthroughStore } from '../stores/walkthrough.svelte';

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
        : `${practice.drill.prompt}  ·  ${practice.evaluation.message}`;
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

  // Stream walkthrough narration in (typewriter); other owners' text is set
  // immediately. Re-emits with the same (owner, text) — e.g. play/pause —
  // don't restart the stream.
  $effect(() => {
    const a = active;
    if (!a) {
      displayedBody = '';
      lastKey = '';
      return;
    }
    const key = `${a.owner}:${a.body}`;
    if (key === lastKey) return;
    lastKey = key;
    if (!a.stream) {
      displayedBody = a.body;
      return;
    }
    displayedBody = '';
    let i = 0;
    let handle: ReturnType<typeof setTimeout>;
    const step = (): void => {
      i = Math.min(a.body.length, i + 1);
      displayedBody = a.body.slice(0, i);
      if (i < a.body.length) handle = setTimeout(step, 22);
    };
    step();
    return () => clearTimeout(handle);
  });

  function close(): void {
    if (!active) return;
    if (active.owner === 'lesson') lessonStore.closeLesson();
    else if (active.owner === 'practice') practiceStore.closeDrill();
    else walkthroughStore.close();
  }
</script>

{#if active}
  <div class="stage is-open">
    <button class="stage-close" type="button" aria-label="End" onclick={close}>×</button>
    <div class="stage-title">{active.title}</div>
    <p class="stage-body">{displayedBody}</p>
    {#if active.move}
      <div class="stage-move">{active.move}</div>
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

  @media (max-width: 760px) {
    .stage {
      top: auto;
      bottom: calc(64px + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      width: min(92vw, 440px);
      max-height: 30vh;
    }
  }
</style>
