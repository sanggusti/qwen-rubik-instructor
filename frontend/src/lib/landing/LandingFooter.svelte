<footer class="footer glass-panel">
  <span>© 2026 Qwen Rubik Instructor</span>
  <nav>
    <a href="https://github.com/sanggusti/qwen-rubik-instructor" target="_blank" rel="noreferrer">GitHub</a>
    <a href="https://github.com/sanggusti/qwen-rubik-instructor/blob/main/LICENSE" target="_blank" rel="noreferrer">
      MIT License
    </a>
  </nav>
</footer>

<style>
  .footer {
    scroll-snap-align: end;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 0 24px 24px;
    padding: 20px 28px;
    border-radius: 14px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-dim);
  }
  .footer nav {
    display: flex;
    gap: 20px;
  }
  .footer a {
    color: var(--accent-b);
    text-decoration: none;
    letter-spacing: 0.04em;
  }
  .footer a:hover {
    text-shadow: 0 0 8px var(--accent-b-dim);
  }
  @media (max-width: 480px) {
    .footer {
      flex-direction: column;
      align-items: flex-start;
      margin: 0 16px 16px;
      padding: 16px 20px;
    }
  }
</style>
