<script lang="ts">
  import { contributors } from './contributors';
</script>

<section class="contributors">
  <h2 class="neon-heading">CONTRIBUTORS</h2>
  <div class="grid">
    {#each contributors as c, i (c.name)}
      <a class="card glass-panel" style="--i: {i}" href={c.githubUrl} target="_blank" rel="noreferrer">
        <img src={c.avatarUrl} alt={c.name} />
        <span class="name">{c.name}</span>
        <span class="role">{c.role}</span>
      </a>
    {/each}
  </div>
</section>

<style>
  .contributors {
    min-height: 50vh;
    padding: 64px 48px;
    text-align: center;
  }
  .contributors h2 {
    font-size: clamp(20px, 4vw, 32px);
  }
  .grid {
    margin-top: 32px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 140px;
    padding: 20px 16px;
    border-radius: 14px;
    text-decoration: none;
    color: var(--text);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    animation: card-pop linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 60%;
    animation-delay: calc(var(--i) * 80ms);
  }
  @keyframes card-pop {
    from {
      opacity: 0;
      scale: 0.85;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
  .card:hover {
    border-color: var(--accent-b-dim);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4), 0 0 18px var(--accent-b-dim);
  }
  .card img {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2px solid var(--panel-border);
  }
  .card .name {
    font-family: var(--font-display);
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .card .role {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  @supports not (animation-timeline: view()) {
    .card {
      animation: none;
      opacity: 1;
      scale: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
      opacity: 1;
      scale: 1;
    }
  }

  @media (max-width: 480px) {
    .contributors {
      padding: 40px 16px;
    }
    .card {
      width: 110px;
      padding: 16px 12px;
    }
  }
</style>
