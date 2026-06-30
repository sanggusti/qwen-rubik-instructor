// Bridge to the Qwen backend: POST the cube state (or a topic) to an SSE
// endpoint and assemble the streamed beats/steps into a Walkthrough / Lesson the
// existing engines can play. EventSource is GET-only, so we read the fetch body
// stream and parse `data: ...` frames by hand.

import { PUBLIC_BACKEND_URL } from '$env/static/public';
import type { State } from '../cube/state';
import type { Walkthrough, Beat } from '../education/walkthrough';
import type { Lesson, LessonStep } from '../education/lesson_types';
import type { Level, Method, MemoryDigest } from '../education/profile';

const BASE_URL = PUBLIC_BACKEND_URL;

export interface GenerateOptions {
  topic?: string;
  state?: State;
  /** Learner persona — personalises method, narration, and pacing. */
  level?: Level;
  method?: Method;
  /** Compact performance summary so Qwen can remember and adapt. */
  memory?: MemoryDigest;
  /** Called as each beat/step arrives, for progress UI. */
  onProgress?: (done: number, total: number) => void;
}

function requestBody(opts: GenerateOptions): Record<string, unknown> {
  return {
    topic: opts.topic,
    state: opts.state,
    level: opts.level,
    method: opts.method,
    memory: opts.memory
  };
}

interface MetaEvent {
  type: 'meta';
  kind: 'walkthrough' | 'lesson';
  id: string;
  title: string;
  description: string;
  track?: Lesson['track'];
  audience?: string;
  frameCount: number;
}

async function* streamEvents(path: string, body: unknown): AsyncGenerator<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = `Backend returned ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (!res.body) throw new Error('Backend returned no stream');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (frame.startsWith('data: ')) {
        yield JSON.parse(frame.slice('data: '.length));
      }
    }
  }
}

function requireMeta(event: Record<string, unknown>, kind: MetaEvent['kind']): MetaEvent {
  if (event.type !== 'meta' || event.kind !== kind) {
    throw new Error('Unexpected response from backend (no matching meta event)');
  }
  return event as unknown as MetaEvent;
}

export interface AskOptions {
  question: string;
  /** The stage the learner is on, and the moves in play — used to ground the answer. */
  stage?: string;
  moves?: string[];
  level?: Level;
  memory?: MemoryDigest;
}

// Ask Qwen a free-form question about the current step. Non-streaming: the
// backend grounds the answer in the moves in play and returns one short reply.
export async function askQwen(opts: AskOptions): Promise<string> {
  const res = await fetch(`${BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  });
  if (!res.ok) {
    let detail = `Backend returned ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return ((await res.json()) as { text: string }).text;
}

export async function generateWalkthrough(opts: GenerateOptions): Promise<Walkthrough> {
  const beats: Beat[] = [];
  let meta: MetaEvent | null = null;
  for await (const event of streamEvents('/narrate/walkthrough', requestBody(opts))) {
    if (event.type === 'meta') {
      meta = requireMeta(event, 'walkthrough');
    } else if (event.type === 'beat') {
      beats.push(event.beat as Beat);
      opts.onProgress?.(beats.length, meta?.frameCount ?? beats.length);
    }
  }
  if (!meta) throw new Error('Backend stream ended without content');
  return { id: meta.id, title: meta.title, description: meta.description, beats };
}

export async function generateLesson(opts: GenerateOptions): Promise<Lesson> {
  const steps: LessonStep[] = [];
  let meta: MetaEvent | null = null;
  for await (const event of streamEvents('/narrate/lesson', requestBody(opts))) {
    if (event.type === 'meta') {
      meta = requireMeta(event, 'lesson');
    } else if (event.type === 'step') {
      steps.push(event.step as LessonStep);
      opts.onProgress?.(steps.length, meta?.frameCount ?? steps.length);
    }
  }
  if (!meta) throw new Error('Backend stream ended without content');
  return {
    id: meta.id,
    track: meta.track ?? 'beginner',
    title: meta.title,
    audience: meta.audience ?? '',
    description: meta.description,
    steps
  };
}
