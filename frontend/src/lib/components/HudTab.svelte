<script lang="ts">
  let { label, active, onclick }: { label: string; active: boolean; onclick: () => void } = $props();
</script>

<button type="button" class="hud-tab" class:is-active={active} {onclick}>{label}</button>

<style>
  .hud-tab {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    color: var(--accent-a);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: left;
    min-height: 36px;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .hud-tab:hover {
    color: var(--text);
    border-color: var(--accent-b-dim);
  }
  .hud-tab.is-active {
    color: var(--accent-b);
    border-color: var(--accent-b);
    background: var(--accent-b-bg);
    box-shadow: 0 0 14px var(--accent-b-dim);
  }

  @media (max-width: 760px) {
    .hud-tab {
      padding: 11px 14px;
      font-size: 12px;
      min-height: 44px;
    }
  }
</style>
