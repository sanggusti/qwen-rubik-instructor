<script lang="ts">
  // Desktop variant lives in HudBar's rail (above Guide); mobile variant is a
  // fixed FAB at the top-right. Each hides itself on the other breakpoint.
  let { layout, onclick }: { layout: 'desktop' | 'mobile'; onclick: () => void } = $props();
</script>

{#if layout === 'desktop'}
  <button type="button" class="challenge-desktop" {onclick}>
    <span class="icon" aria-hidden="true">⚡</span>
    <span class="label">Challenge Me</span>
  </button>
{:else}
  <button type="button" class="challenge-fab-mobile" {onclick}>
    ⚡ Challenge Me!
  </button>
{/if}

<style>
  .challenge-desktop {
    appearance: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 14px;
    font-family: inherit;
    color: var(--accent-a);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .challenge-desktop .icon {
    font-size: 18px;
    line-height: 1;
  }
  .challenge-desktop .label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .challenge-desktop:hover {
    border-color: var(--accent-a-dim);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 18px var(--accent-a-dim);
  }

  .challenge-fab-mobile {
    display: none;
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    right: 10px;
    z-index: 110;
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--accent-a);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    border-radius: 14px;
    padding: 12px 14px;
    min-height: 44px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media (max-width: 760px) {
    .challenge-desktop {
      display: none;
    }
    .challenge-fab-mobile {
      display: block;
    }
  }
</style>
