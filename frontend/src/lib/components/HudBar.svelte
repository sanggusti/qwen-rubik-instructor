<script lang="ts">
  import HudTab from './HudTab.svelte';
  import Panel from './Panel.svelte';
  import LessonsPanel from '../panels/LessonsPanel.svelte';
  import PracticePanel from '../panels/PracticePanel.svelte';
  import ExplorePanel from '../panels/ExplorePanel.svelte';
  import DebuggerPanel from '../panels/DebuggerPanel.svelte';
  import LevelPanel from '../panels/LevelPanel.svelte';
  import { cubeStore } from '../stores/cube.svelte';
  import { demoStore } from '../stores/demo.svelte';

  type ExperienceKeep = 'lesson' | 'practice' | 'walkthrough' | 'none';
  type TabId = 'lessons' | 'practice' | 'explore' | 'debugger' | 'level';

  // Opening any tab ends whichever experience(s) it doesn't own, exactly like
  // the legacy Hud's onOpen -> closeOthers wiring (Phase 4 verify: only one
  // panel/caption owner at a time).
  let {
    onOpenExperience,
    keypadOpen,
    onToggleKeypad
  }: { onOpenExperience: (keep: ExperienceKeep) => void; keypadOpen: boolean; onToggleKeypad: () => void } =
    $props();

  const TABS: { id: TabId; label: string; keep: ExperienceKeep }[] = [
    { id: 'lessons', label: 'Lessons', keep: 'lesson' },
    { id: 'practice', label: 'Practice', keep: 'practice' },
    { id: 'explore', label: 'Explore', keep: 'walkthrough' },
    { id: 'debugger', label: 'State', keep: 'none' },
    { id: 'level', label: 'Level', keep: 'none' }
  ];

  let dockOpen = $state(false);
  let activeId = $state<TabId | null>(null);

  $effect(() => { demoStore.modalOpen = activeId !== null; });

  function toggleDock(): void {
    dockOpen = !dockOpen;
  }

  function openTab(tab: (typeof TABS)[number]): void {
    activeId = activeId === tab.id ? null : tab.id;
    if (activeId) onOpenExperience(tab.keep);
  }

  // Collapses the whole dock once a lesson/drill/walkthrough/level is picked,
  // so the cube + stage caption aren't covered — mirrors the legacy Hud.close()
  // called after every panel selection.
  function collapse(): void {
    dockOpen = false;
    activeId = null;
  }

  // Dismisses just the modal (the close button / backdrop click), leaving the
  // tab rail open so the learner can pick a different tab.
  function closeModal(): void {
    activeId = null;
  }
</script>

<div class="guide">
  <div class="rail">
    <button type="button" class="guide-toggle" class:is-active={dockOpen} aria-label="Guide" aria-expanded={dockOpen} onclick={toggleDock}>
      <span class="icon" aria-hidden="true">📖</span>
      <span class="label">Guide</span>
    </button>
    <div class="quick-actions">
      <button type="button" class="dock-action" onclick={() => cubeStore.scramble()}>Scramble</button>
      <button type="button" class="dock-action" onclick={() => cubeStore.reset()}>Reset</button>
    </div>
  </div>

  {#if dockOpen}
    <div class="dock">
      <div class="dock-tabs">
        {#each TABS as tab (tab.id)}
          <HudTab label={tab.label} active={activeId === tab.id} onclick={() => openTab(tab)} />
        {/each}
      </div>
    </div>
  {/if}
</div>

<button
  type="button"
  class="keypad-fab"
  class:is-active={keypadOpen}
  aria-pressed={keypadOpen}
  aria-label="Toggle move keypad"
  onclick={onToggleKeypad}
>
  <span class="icon" aria-hidden="true">⌨️</span>
  <span class="label">{keypadOpen ? 'Close' : 'Keypad'}</span>
</button>

{#if activeId}
  <div
    class="modal-backdrop"
    onclick={closeModal}
    onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }}
    role="presentation"
  >
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <button type="button" class="modal-close" aria-label="Close" onclick={closeModal}>×</button>
      <Panel>
        {#if activeId === 'lessons'}
          <LessonsPanel onSelect={collapse} />
        {:else if activeId === 'practice'}
          <PracticePanel onSelect={collapse} />
        {:else if activeId === 'explore'}
          <ExplorePanel onPlay={collapse} onSelectWalkthrough={() => onOpenExperience('walkthrough')} />
        {:else if activeId === 'debugger'}
          <DebuggerPanel />
        {:else if activeId === 'level'}
          <LevelPanel onSelect={collapse} />
        {/if}
      </Panel>
    </div>
  </div>
{/if}

<style>
  .guide {
    position: fixed;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 110;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .guide-toggle {
    appearance: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 14px;
    font-family: inherit;
    color: var(--accent-b);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .guide-toggle .icon {
    font-size: 18px;
    line-height: 1;
  }
  .guide-toggle .label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .guide-toggle:hover,
  .guide-toggle.is-active {
    border-color: var(--accent-b-dim);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 18px var(--accent-b-dim);
  }
  .dock {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    max-width: calc(100vw - 96px);
  }
  .dock-tabs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 120px;
    padding: 10px;
    border-radius: 14px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
  }
  .dock-action {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--accent-b);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .dock-action:hover {
    border-color: var(--accent-b-dim);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 18px var(--accent-b-dim);
  }

  .keypad-fab {
    display: none; /* shown only on touch/mobile via media queries below */
    position: fixed;
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    z-index: 110;
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 14px;
    color: var(--accent-b);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  @media (pointer: coarse), (max-width: 760px) {
    .keypad-fab {
      display: flex;
    }
  }
  .keypad-fab .icon {
    font-size: 20px;
    line-height: 1;
  }
  .keypad-fab .label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .keypad-fab:hover,
  .keypad-fab.is-active {
    border-color: var(--accent-b-dim);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 18px var(--accent-b-dim);
  }
  .keypad-fab.is-active {
    background: var(--accent-b-bg);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 1, 6, 0.6);
  }
  .modal {
    position: relative;
  }
  .modal-close {
    position: absolute;
    top: -10px;
    right: -10px;
    z-index: 1;
    appearance: none;
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 18px;
    line-height: 1;
    color: var(--accent-b);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .modal-close:hover {
    border-color: var(--accent-b-dim);
    box-shadow: 0 0 14px var(--accent-b-dim);
  }

  @media (max-width: 760px) {
    .guide {
      left: 10px;
      top: max(12px, env(safe-area-inset-top));
      transform: none;
      flex-direction: column;
      align-items: flex-start;
    }
    .guide-toggle,
    .dock-action {
      padding: 12px 14px;
      min-height: 44px;
      min-width: 44px;
    }
    .quick-actions {
      position: fixed;
      left: 50%;
      bottom: max(12px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      flex-direction: row;
    }
    .dock {
      max-width: calc(100vw - 20px);
    }
    .dock-tabs {
      min-width: 96px;
    }
    .keypad-fab {
      right: 10px;
      bottom: max(12px, env(safe-area-inset-bottom));
      padding: 12px 14px;
      min-height: 56px;
      min-width: 56px;
    }
    .keypad-fab .icon {
      font-size: 22px;
    }
  }
</style>
