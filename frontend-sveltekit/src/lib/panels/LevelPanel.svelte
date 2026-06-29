<script lang="ts">
  import { profileStore } from '../stores/profile.svelte';
  import { LEVELS, type Level } from '../education/profile';

  let { onSelect }: { onSelect?: () => void } = $props();

  const LEVEL_LABELS: Record<Level, string> = {
    newbie: 'Newbie',
    intermediate: 'Intermediate',
    advanced: 'Advanced'
  };

  function choose(level: Level): void {
    profileStore.setLevel(level);
    onSelect?.();
  }
</script>

<div class="exp-section">Your level</div>
<div class="exp-row">
  {#each LEVELS as lv (lv)}
    <button type="button" class="exp-btn" class:is-active={profileStore.profile.level === lv} onclick={() => choose(lv)}>
      {LEVEL_LABELS[lv]}
    </button>
  {/each}
</div>
<p class="exp-hint">
  Newbie: gentle, layer-by-layer. Intermediate / Advanced: CFOP framing and terser cues.
</p>

<style>
  .exp-section {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-a);
    margin-bottom: 6px;
  }
  .exp-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .exp-btn {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--text);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 12px;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .exp-btn.is-active {
    border-color: var(--accent-b);
    color: var(--accent-b);
    background: var(--accent-b-bg);
  }
  .exp-btn:hover {
    border-color: var(--accent-b-dim);
  }
  .exp-hint {
    color: var(--text-dim);
    margin: 4px 0 0;
    font-size: 12px;
  }
</style>
