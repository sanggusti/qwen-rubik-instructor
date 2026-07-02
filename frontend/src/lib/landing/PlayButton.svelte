<script lang="ts">
  let { label, onPlay }: { label: string; onPlay: () => void } = $props();
</script>

<button type="button" class="play-btn" onclick={onPlay}>
  <span class="ring"></span>
  <span class="ring ring-delay"></span>
  {label}
</button>

<style>
  .play-btn {
    position: relative;
    appearance: none;
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 18px;
    padding: 16px 40px;
    border-radius: 999px;
    border: 2px solid var(--accent-y);
    color: #2b1700;
    background: linear-gradient(135deg, var(--accent-y) 0%, var(--accent-y-2) 100%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5), 0 0 24px var(--accent-y-dim);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .play-btn:hover {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 36px var(--accent-y-dim);
  }
  .play-btn:active {
    transform: scale(0.94);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), 0 0 14px var(--accent-y-dim);
  }
  .ring {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 2px solid var(--accent-y);
    opacity: 0;
    z-index: -1;
    animation: radar-ping 2.2s ease-out infinite;
  }
  .ring-delay {
    animation-delay: 1.1s;
  }
  @keyframes radar-ping {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.8);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: none;
      opacity: 0;
    }
  }
  @media (max-width: 480px) {
    .play-btn {
      padding: 14px 32px;
      font-size: 16px; /* still clears the 44px touch-target minimum */
    }
  }
</style>
