<script lang="ts">
  import { authStore } from '../auth/store.svelte';
  import { redirectToGoogle } from '../api/auth';

  // Step 1 (signed out): Google sign-in. Step 2 (signed in, no username yet):
  // pick a username. When both are done the parent starts the challenge.
  let { onClose, onReady }: { onClose: () => void; onReady: () => void } = $props();

  const step = $derived(authStore.member ? 2 : 1);

  let username = $state('');
  let usernameError = $state<string | null>(null);
  let saving = $state(false);

  const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

  async function saveUsername(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const value = username.trim();
    if (!USERNAME_RE.test(value)) {
      usernameError = 'Usernames are 2–24 letters, digits or underscores.';
      return;
    }
    saving = true;
    usernameError = await authStore.setUsername(value);
    saving = false;
    if (!usernameError) onReady();
  }

  function signIn(): void {
    authStore.lastError = null;
    redirectToGoogle();
  }
</script>

<div
  class="modal-backdrop auth-modal"
  onclick={onClose}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
  role="presentation"
>
  <div
    class="dialog"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label="Challenge sign in"
    tabindex="-1"
  >
    {#if step === 1}
      <h2>⚡ Challenge Mode</h2>
      <p class="blurb">Sign in to race the clock and claim your spot on the leaderboard.</p>
      {#if authStore.lastError}
        <p class="error">{authStore.lastError}</p>
      {/if}
      <button type="button" class="primary google-btn" onclick={signIn}>
        Sign in with Google
      </button>
      <button type="button" class="ghost" onclick={onClose}>Cancel</button>
    {:else}
      <h2>Pick a username</h2>
      <p class="blurb">This is the name that shows on the leaderboard.</p>
      <form class="username-step" onsubmit={saveUsername}>
        <input
          type="text"
          placeholder="e.g. cube_master"
          maxlength="24"
          bind:value={username}
          aria-label="Username"
        />
        {#if usernameError}
          <p class="error">{usernameError}</p>
        {/if}
        <button type="submit" class="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save & start'}
        </button>
        <button type="button" class="ghost" onclick={onClose}>Cancel</button>
      </form>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(2, 1, 6, 0.6);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(92vw, 360px);
    padding: 22px;
    border-radius: 14px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  }
  h2 {
    margin: 0;
    font-size: 16px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-a);
  }
  .blurb {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--accent-r, #ff5c5c);
  }
  .username-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  input {
    font-family: inherit;
    font-size: 13px;
    padding: 10px 12px;
    border-radius: 8px;
    color: inherit;
    background: rgba(2, 1, 6, 0.5);
    border: 1px solid var(--panel-border);
  }
  input:focus {
    outline: none;
    border-color: var(--accent-a);
  }
  .primary,
  .ghost {
    appearance: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 12px;
    border-radius: 8px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .primary {
    color: var(--accent-a);
    background: var(--panel-bg);
    border: 1px solid var(--accent-a);
  }
  .primary:hover {
    box-shadow: 0 0 18px var(--accent-a-dim, var(--accent-a));
  }
  .primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .ghost {
    color: var(--text-dim);
    background: transparent;
    border: 1px solid var(--panel-border);
  }
  .ghost:hover {
    border-color: var(--accent-b-dim);
  }
</style>
