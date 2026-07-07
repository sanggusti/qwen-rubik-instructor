<script lang="ts">
  const ITEMS: { id: string; label: string }[] = [
    { id: 'section-play', label: "Let's Play" },
    { id: 'section-challenge', label: 'Challenge Me' },
    { id: 'section-blogs', label: 'Blogs' },
    { id: 'section-contributors', label: 'Contributor' }
  ];

  let {
    active,
    solid,
    onNavigate
  }: { active: string; solid: boolean; onNavigate: (id: string) => void } = $props();
</script>

<header class="landing-header" class:solid>
  <nav>
    {#each ITEMS as item (item.id)}
      <button
        type="button"
        class="nav-item"
        class:is-active={active === item.id}
        onclick={() => onNavigate(item.id)}
      >
        {item.label}
      </button>
    {/each}
  </nav>
</header>

<style>
  .landing-header {
    position: fixed;
    top: 16px;
    left: 50%;
    translate: -50% 0;
    z-index: 30;
    max-width: calc(100vw - 24px);
    border-radius: 999px;
    padding: 6px;
    box-sizing: border-box;
    /* Transparent over the hero scene — only the item labels show. Fades in
       a glass-panel background once scrolled past the hero. */
    background: transparent;
    border: 1px solid transparent;
    box-shadow: none;
    -webkit-backdrop-filter: blur(0px);
    backdrop-filter: blur(0px);
    transition:
      background 0.3s ease,
      border-color 0.3s ease,
      box-shadow 0.3s ease,
      backdrop-filter 0.3s ease;
  }

  .landing-header.solid {
    background: var(--panel-bg);
    border-color: var(--panel-border);
    box-shadow:
      0 10px 40px rgba(0, 0, 0, 0.5),
      0 0 24px var(--accent-a-dim),
      0 1px 0 rgba(255, 255, 255, 0.06) inset;
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    backdrop-filter: blur(14px) saturate(140%);
  }

  nav {
    display: flex;
    gap: 4px;
  }

  .nav-item {
    appearance: none;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 18px;
    border-radius: 999px;
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
    transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
    white-space: nowrap;
    box-sizing: border-box;
  }

  .nav-item:hover {
    color: var(--text);
  }

  .nav-item.is-active {
    color: var(--accent-b);
    background: var(--accent-b-bg);
    box-shadow: 0 0 14px var(--accent-b-dim);
  }

  @media (max-width: 760px) {
    .landing-header {
      top: 0;
      left: 0;
      translate: none;
      width: 100%;
      max-width: 100%;
      border-radius: 0;
      padding: max(6px, env(safe-area-inset-top)) 4px 6px;
      /* Full-width flush bar, not a floating pill — a bottom-only hairline
         and a tight downward shadow keep it looking attached to the box
         instead of the desktop pill's glow bleeding past the flat edges. */
      border-width: 0 0 1px 0;
    }
    .landing-header.solid {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
    }
    nav {
      justify-content: space-between;
      gap: 2px;
      /* Not overflow-x: auto — items fit down to 320px via flex:1 below, and
         "auto" here would force overflow-y to auto too (CSS's overflow-x/y
         are coupled), clipping the active pill's box-shadow glow flush
         against the nav's own bounds instead of letting it fade out. */
    }
    .nav-item {
      flex: 1;
      min-width: 0;
      padding: 10px 4px;
      font-size: 9px;
      min-height: 44px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 380px) {
    .nav-item {
      font-size: 8px;
      letter-spacing: 0.03em;
      padding: 10px 2px;
    }
  }
</style>
