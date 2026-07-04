// Reactive session for Google-authenticated challenge players. The bearer
// token lives in localStorage (key rubik-auth-token); member details are
// re-fetched from /auth/me on each init so a revoked/expired token clears
// itself.

import { getMe, logout as apiLogout, setUsername as apiSetUsername, type Member } from '../api/auth';

const TOKEN_KEY = 'rubik-auth-token';

class AuthStore {
  member: Member | null = $state(null);
  token: string | null = $state(null);
  isLoaded: boolean = $state(false);
  /** One-shot message from a failed OAuth redirect (set by the root layout). */
  lastError: string | null = $state(null);

  /** Restore the session from localStorage. Called once from the root layout. */
  async init(): Promise<void> {
    const token = readToken();
    if (!token) {
      this.isLoaded = true;
      return;
    }
    this.token = token;
    const member = await getMe(token);
    if (member) {
      this.member = member;
    } else {
      // invalid/expired token — drop it so we don't retry every load
      this.token = null;
      writeToken(null);
    }
    this.isLoaded = true;
  }

  /** Store a fresh token from the OAuth redirect, then load the member. */
  async adoptToken(token: string): Promise<void> {
    writeToken(token);
    this.isLoaded = false;
    await this.init();
  }

  async setUsername(username: string): Promise<string | null> {
    if (!this.token) return 'Not signed in.';
    const error = await apiSetUsername(this.token, username);
    if (!error && this.member) {
      this.member = { ...this.member, username, hasUsername: true };
    }
    return error;
  }

  logout(): void {
    if (this.token) void apiLogout(this.token);
    this.token = null;
    this.member = null;
    writeToken(null);
  }
}

function readToken(): string | null {
  try {
    return localStorage?.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage?.setItem(TOKEN_KEY, token);
    else localStorage?.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const authStore = new AuthStore();
