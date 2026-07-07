// Shared "solve my cube" flow: generate a Qwen walkthrough from the live
// cube state, load it, and capture it for the /review canvas. Used by
// ExplorePanel (digital) and PhysicalPanel (scanned physical cube) so review
// capture and history behave identically for both.

import { generateWalkthrough } from '../api/narrate';
import { syncReviewSession } from '../api/review';
import { loadReviewSession, recordSolve } from '../review/session';
import { cubeStore } from '../stores/cube.svelte';
import { profileStore } from '../stores/profile.svelte';
import { walkthroughStore } from '../stores/walkthrough.svelte';
import type { Walkthrough } from './walkthrough';

export async function generateSolveWalkthrough(
  onStatus?: (message: string) => void
): Promise<Walkthrough> {
  onStatus?.('Asking Qwen to plan your solve…');
  const wt = await generateWalkthrough({
    state: cubeStore.getState(),
    level: profileStore.profile.level,
    method: profileStore.profile.method,
    memory: profileStore.memoryDigest(),
    userId: profileStore.profile.sessionId,
    onProgress: (done, total) => {
      onStatus?.(`Generating narration… beat ${done} of ${total}`);
    }
  });
  walkthroughStore.loadGenerated(wt);
  // Capture for the /review canvas (localStorage), then best-effort mirror to
  // the backend so it follows the learner across devices.
  recordSolve(wt, profileStore.profile.level, profileStore.profile.method);
  const captured = loadReviewSession();
  if (captured?.solve) {
    void syncReviewSession(profileStore.profile.sessionId, captured);
  }
  profileStore.appendHistory({
    kind: 'walkthrough',
    method: profileStore.profile.method,
    stages: wt.beats.length,
    at: new Date().toISOString()
  });
  return wt;
}
