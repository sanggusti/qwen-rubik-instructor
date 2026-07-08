<script lang="ts">
  let { label = 'Loading…' }: { label?: string } = $props();
</script>

<!-- Indeterminate progress: the Three.js/Threlte chunk this stands in for
     has no measurable download progress to track, so a sweeping bar is the
     honest signal — it says "working", not a fake percentage. -->
<div class="loading-bar" role="status" aria-live="polite">
  <span class="loading-bar__label">{label}</span>
  <div class="loading-bar__track">
    <div class="loading-bar__fill"></div>
  </div>
</div>

<style>
  .loading-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 28px;
    border-radius: 14px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
  }

  .loading-bar__label {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  .loading-bar__track {
    width: 160px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .loading-bar__fill {
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
    animation: loading-sweep 1.1s ease-in-out infinite;
  }

  @keyframes loading-sweep {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(350%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-bar__fill {
      animation-duration: 2.2s;
    }
  }
</style>
