<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div class="panel glass-panel">
  {@render children?.()}
</div>

<style>
  .panel {
    color: var(--text);
    border-radius: 14px;
    padding: 14px 16px 16px;
    font-size: 12px;
    line-height: 1.45;
    width: min(420px, calc(100vw - 48px));
    max-height: min(78vh, calc(100vh - 48px));
    overflow-y: auto;
  }
  .panel::-webkit-scrollbar {
    width: 6px;
  }
  .panel::-webkit-scrollbar-thumb {
    background: var(--accent-b-dim);
    border-radius: 6px;
  }
</style>
