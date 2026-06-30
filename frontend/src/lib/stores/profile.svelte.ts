// Wraps education/profile.ts (already localStorage-backed) in a rune so
// LevelPanel.svelte reads the current level reactively. No storage format change.

import {
  appendHistory,
  buildMemoryDigest,
  loadProfile,
  setLevel,
  type HistoryEntry,
  type Level,
  type MemoryDigest,
  type UserProfile
} from '../education/profile';

class ProfileStore {
  profile: UserProfile = $state(loadProfile());

  setLevel(level: Level): void {
    this.profile = setLevel(level);
  }

  appendHistory(entry: HistoryEntry): void {
    this.profile = appendHistory(entry);
  }

  memoryDigest(): MemoryDigest {
    return buildMemoryDigest(this.profile);
  }
}

export const profileStore = new ProfileStore();
