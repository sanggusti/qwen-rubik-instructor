import './style.css';
import { createScene } from './scene/scene';
import { CubeMesh } from './scene/cube/cube';
import { MoveAnimator } from './scene/cube/animator';
import { attachKeyboard } from './ui/controls/keyboard';
import { attachDragControls } from './ui/controls/drag-controls';
import { DebuggerPanel } from './ui/debugger';
import { LessonsPanel } from './ui/lessons_panel';
import { LessonEngine, type LessonApi } from './education/lesson_engine';
import { LESSON_CATALOG } from './education/lesson_catalog';
import { PracticePanel } from './ui/practice_panel';
import { PracticeEngine, type PracticeApi } from './education/practice_engine';
import { PRACTICE_DRILLS } from './education/practice_drills';
import { CubeView } from './scene/cube/cube_view';
import type { CubeletType } from './scene/cube/cubelets';
import { ExplorePanel } from './ui/explore_panel';
import { WalkthroughEngine } from './education/walkthrough';
import { WALKTHROUGHS } from './education/walkthroughs';
import { generateWalkthrough, generateLesson, askQwen, solveCube } from './education/remote_content';
import { loadProfile, setLevel, appendHistory, buildMemoryDigest, LEVELS, type Level, type MemoryDigest } from './education/profile';
import { recommendNext, reasonText } from './education/recommendation';
import { Hud } from './ui/hud';
import { StageCaption } from './ui/stage_caption';
import { applyMove, solvedState, isSolved, cloneState, type State } from './core/state';
import { generateScramble } from './scene/cube/scramble';
import DEBUG_CONFIG from './configs/debug-config';

// Standby ("breathing") animation tuning. After a short idle delay the cube
// slowly yaws and bobs; any interaction or an active lesson/drill eases it back
// to its default resting pose.
const IDLE_DELAY_MS = 2500; // inactivity before the standby drift begins
const IDLE_YAW_SPEED = 0.00025; // radians per ms
const IDLE_BOB_FREQ = 0.0012; // radians per ms
const IDLE_BOB_AMP = 0.06; // world units
const IDLE_EASE_TAU = 140; // ms time-constant for easing home
const LESSON_HIGHLIGHT_FADE_MS = 220; // matches the walkthrough emphasis fade
const LESSON_HIGHLIGHT_HOLD_MS = 1100; // how long a step's spotlight pulses before easing back

declare global {
  interface Window {
    rubikInstructor?: RubikInstructorApi;
  }
}

export interface RubikInstructorApi {
  applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
  scramble(length?: number): string[];
  reset(): void;
  getState(): State;
  isSolved(): boolean;
  isBusy(): boolean;
  /** Subscribe to completed moves (after each animated quarter-turn settles). */
  onMove(fn: (move: string, state: State) => void): () => void;
}

function boot(container: HTMLElement): void {
  const ctx = createScene(container);

  const cube = new CubeMesh();
  ctx.scene.add(cube.root);

  const cubeView = new CubeView(cube);

  const animator = new MoveAnimator(cube, cube.root);

  let state: State = solvedState();

  const debuggerPanel = !DEBUG_CONFIG.withoutUIMode ? new DebuggerPanel(container) : null;
  debuggerPanel?.render(state);

  const moveSubscribers = new Set<(m: string, s: State) => void>();
  let lessonEngine: LessonEngine | null = null;
  let practiceEngine: PracticeEngine | null = null;
  let walkthroughEngine: WalkthroughEngine | null = null;

  // Standby animation state. The drift is an "attract" animation: it plays at
  // the start while the cube is untouched and stops for good once the learner
  // makes their first move, so it never competes with their rhythm. A full Reset
  // re-arms it.
  let idleEnabled = true; // false while a lesson/drill is active
  let hasInteracted = false; // true after the learner's first move; ends the attract drift
  let pointerActive = false; // true while the user is dragging/pressing
  let lastActivityTs = performance.now();
  let lastFrameTs = lastActivityTs;
  const markActivity = (): void => { lastActivityTs = performance.now(); };

  animator.onMoveStart = () => { hasInteracted = true; markActivity(); };
  animator.onMoveComplete = (name) => {
    markActivity();
    applyMove(state, name);
    debuggerPanel?.pushMove(name, performance.now());
    debuggerPanel?.render(state);
    for (const fn of moveSubscribers) {
      try { fn(name, cloneState(state)); } catch (e) { console.error(e); }
    }
  };

  function resetCube(): void {
    if (animator.isBusy()) return;
    cube.root.clear();
    cube.cubies.length = 0;
    const fresh = new CubeMesh();
    for (const c of fresh.cubies) {
      cube.root.add(c.mesh);
      cube.cubies.push(c);
    }
    state = solvedState();
    cubeView.rebind();
    debuggerPanel?.reset();
    debuggerPanel?.render(state);
    lessonEngine?.handleCubeReset();
    practiceEngine?.handleCubeReset();
    // Re-arm the attract drift: a fresh, untouched cube breathes again.
    hasInteracted = false;
    markActivity();
  }

  attachKeyboard(animator, { onReset: resetCube });
  attachDragControls(cube, animator, ctx.camera, ctx.renderer.domElement);

  // Pause the standby drift while the user is interacting with the canvas.
  container.addEventListener('pointerdown', () => { pointerActive = true; markActivity(); });
  window.addEventListener('pointerup', () => { pointerActive = false; markActivity(); });

  function updateIdle(now: number, dt: number): void {
    const idleReady = now - lastActivityTs > IDLE_DELAY_MS;
    const resting =
      idleEnabled && !hasInteracted && idleReady && !animator.isBusy() && !pointerActive;
    if (resting) {
      cube.root.rotation.y += IDLE_YAW_SPEED * dt;
      cube.root.position.y = Math.sin(now * IDLE_BOB_FREQ) * IDLE_BOB_AMP;
    } else {
      // Ease orientation + bob back to the default resting pose (shortest path).
      const k = 1 - Math.exp(-dt / IDLE_EASE_TAU);
      let a = cube.root.rotation.y % (Math.PI * 2);
      if (a > Math.PI) a -= Math.PI * 2;
      else if (a < -Math.PI) a += Math.PI * 2;
      cube.root.rotation.y = a * (1 - k);
      cube.root.position.y *= (1 - k);
    }
  }

  function tick(now: number): void {
    const dt = Math.min(now - lastFrameTs, 64);
    lastFrameTs = now;
    animator.update(now);
    cubeView.update(now);
    updateIdle(now, dt);
    ctx.controls?.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const VALID = /^([UDLRFBMESxyz])('?)$/;
  const api: RubikInstructorApi = {
    applyMoves(moves) {
      const arr = typeof moves === 'string'
        ? moves.split(/\s+/).filter(Boolean)
        : moves;
      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const m of arr) {
        if (!VALID.test(m)) { rejected.push(m); continue; }
        animator.enqueue(m) ? accepted.push(m) : rejected.push(m);
      }
      return { accepted, rejected };
    },
    scramble(length = 20) {
      const seq = generateScramble(length);
      for (const m of seq) animator.enqueue(m);
      return seq;
    },
    reset() { resetCube(); },
    getState() { return cloneState(state); },
    isSolved() { return isSolved(state); },
    isBusy() { return animator.isBusy(); },
    onMove(fn) {
      moveSubscribers.add(fn);
      return () => moveSubscribers.delete(fn);
    }
  };
  window.rubikInstructor = api;

  if (!DEBUG_CONFIG.withoutUIMode) {
    // A single bottom-centre menu bar owns every panel as a mutually-exclusive
    // dropdown, keeping the corners and the cube clear. Opening a tab ends any
    // experience it doesn't own, so the side caption never goes stale.
    const hud = new Hud(container, (id) => {
      const keep = id === 'lessons' ? 'lesson'
        : id === 'practice' ? 'practice'
        : id === 'explore' ? 'walkthrough'
        : 'none';
      closeOthers(keep);
      // The "You" panel shows live memory, so refresh it whenever it's opened.
      if (id === 'level') youPanel.refresh();
    });

    // Learner profile (level / method / session history), persisted client-side
    // and sent with each generate request so the backend can personalise.
    let profile = loadProfile();

    const lessonApi: LessonApi = {
      applyMoves: api.applyMoves,
      getState: api.getState,
      isSolved: api.isSolved,
      reset: api.reset,
      onMove: api.onMove
    };
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    lessonEngine = new LessonEngine(lessonApi, LESSON_CATALOG, storage);

    const practiceApi: PracticeApi = {
      applyMoves: api.applyMoves,
      getState: api.getState,
      isSolved: api.isSolved,
      onMove: api.onMove
    };
    practiceEngine = new PracticeEngine(practiceApi, PRACTICE_DRILLS, () => Date.now(), storage);

    const defaultMoveMs = animator.durationMs;
    walkthroughEngine = new WalkthroughEngine(
      {
        applyMoves: api.applyMoves,
        reset: api.reset,
        isBusy: api.isBusy,
        setMoveDuration: (ms) => { animator.durationMs = ms ?? defaultMoveMs; }
      },
      WALKTHROUGHS,
      (type, opts) => cubeView.highlight(type, opts)
    );

    // The caption shows the active experience's text beside the cube; its close
    // button ends whichever experience currently owns it.
    const stage = new StageCaption(container, (owner) => {
      if (owner === 'lesson') lessonEngine?.closeLesson();
      else if (owner === 'practice') practiceEngine?.closeDrill();
      else if (owner === 'walkthrough') walkthroughEngine?.close();
    });

    // Only one experience runs at a time, so the caption has a single owner.
    // `keep: 'none'` ends every experience (used by tabs that own none, e.g. State).
    const closeOthers = (keep: 'lesson' | 'practice' | 'walkthrough' | 'none'): void => {
      if (keep !== 'lesson') lessonEngine?.closeLesson();
      if (keep !== 'practice') practiceEngine?.closeDrill();
      if (keep !== 'walkthrough') walkthroughEngine?.close();
    };

    const lessonsPanel = new LessonsPanel(
      container,
      lessonEngine,
      () => {
        // Keep the Lessons panel open: it now collapses to the active step's
        // controls (Next / Mark complete), so closing it would hide them.
        closeOthers('lesson');
      },
      async (report) => {
        closeOthers('lesson');
        const lesson = await generateLesson({
          state: api.getState(),
          level: profile.level,
          method: profile.method,
          memory: buildMemoryDigest(loadProfile()),
          onProgress: report
        });
        lessonEngine?.loadGenerated(lesson);
        profile = appendHistory({
          kind: 'lesson', method: profile.method,
          stages: lesson.steps.length, at: new Date().toISOString()
        });
        // Leave the panel open so the generated lesson's controls are visible.
      },
      (req) =>
        askQwen({
          ...req,
          level: profile.level,
          // Forward the live cube so Qwen grounds the answer in what's on screen.
          state: api.getState(),
          // Pass the current stage as context so the relevant memory ranks first.
          memory: buildMemoryDigest(loadProfile(), { context: req.stage })
        }),
      // "Get unstuck": ask the backend solver for the path from the live cube and
      // animate it (as assist moves, so it isn't counted as the learner's turns).
      async () => {
        const moves = await solveCube(api.getState());
        lessonEngine?.applyAssistMoves(moves);
      }
    );
    const practicePanel = new PracticePanel(container, practiceEngine, () => {
      closeOthers('practice');
      hud.close();
    });
    const explorePanel = new ExplorePanel(container, cubeView, walkthroughEngine, {
      onPlay: () => hud.close(),
      onSelectWalkthrough: () => closeOthers('walkthrough'),
      onGenerate: async (report) => {
        closeOthers('walkthrough');
        const wt = await generateWalkthrough({
          state: api.getState(),
          level: profile.level,
          method: profile.method,
          memory: buildMemoryDigest(loadProfile()),
          onProgress: report
        });
        walkthroughEngine?.loadGenerated(wt);
        profile = appendHistory({
          kind: 'walkthrough', method: profile.method,
          stages: wt.beats.length, at: new Date().toISOString()
        });
        hud.close();
      }
    });

    const helpEl = buildHelp();
    container.appendChild(helpEl);

    const youPanel = buildYouPanel(profile.level, (lv) => {
      profile = setLevel(lv);
      youPanel.refresh();
    });
    container.appendChild(youPanel.el);

    // A client-side "welcome back" nod from memory, so cross-session continuity
    // shows even when the Qwen backend is absent (its welcome lives in frame 0).
    maybeShowWelcomeBack(container, buildMemoryDigest(loadProfile()));

    hud.register('lessons', 'Lessons', lessonsPanel.el);
    hud.register('practice', 'Practice', practicePanel.el);
    hud.register('explore', 'Explore', explorePanel.el);
    hud.register('level', 'You', youPanel.el);
    if (debuggerPanel) hud.register('debugger', 'State', debuggerPanel.el);
    hud.register('help', 'Help', helpEl);
    hud.action('Scramble', () => api.scramble());
    hud.action('Reset', () => resetCube());

    // Feed the active experience's current text into the side caption, and
    // pulse a spotlight on the cubelet class the current lesson step teaches
    // (cross edges, corners, …): emphasise it briefly when the step appears, then
    // ease back to full colour so the learner works on a normal-looking cube.
    // Only fires when the step's highlight changes, so a move mid-step doesn't
    // re-pulse.
    let lessonHighlight: CubeletType | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    const pulseHighlight = (h: CubeletType | null): void => {
      if (highlightTimer) clearTimeout(highlightTimer);
      cubeView.highlight(h, { fadeMs: LESSON_HIGHLIGHT_FADE_MS });
      if (h) {
        highlightTimer = setTimeout(
          () => cubeView.highlight(null, { fadeMs: LESSON_HIGHLIGHT_FADE_MS }),
          LESSON_HIGHLIGHT_HOLD_MS
        );
      }
    };
    lessonEngine.subscribe((s) => {
      const next = s.lesson ? s.step.highlight ?? null : null;
      if (next !== lessonHighlight) {
        lessonHighlight = next;
        pulseHighlight(next);
      }
      if (s.lesson) stage.set('lesson', s.lesson.title, `${s.step.title} — ${s.step.body}`);
      else stage.clear('lesson');
    });
    practiceEngine.subscribe((s) => {
      if (s.drill) {
        const body = s.completed
          ? `Drill complete ✓  Score ${s.score}/${s.roundCount}`
          : `${s.drill.prompt}  ·  ${s.evaluation.message}`;
        stage.set('practice', s.drill.title, body);
      } else {
        stage.clear('practice');
      }
    });
    walkthroughEngine.subscribe((s) => {
      if (s.walkthrough) {
        stage.set('walkthrough', s.walkthrough.title, s.beat.text, true);
        stage.setMove(
          s.currentMove ? `${s.currentMove} · ${s.moveIndex + 1}/${s.moveCount}` : null
        );
      } else {
        stage.clear('walkthrough');
      }
    });

    // Stop the standby drift and recentre the cube while a lesson, drill, or
    // walkthrough is active; resume it once all are closed.
    const refreshIdle = (): void => {
      const active = !!lessonEngine?.getCurrentLesson()
        || !!practiceEngine?.getCurrentDrill()
        || !!walkthroughEngine?.isPlaying();
      idleEnabled = !active;
      if (active) markActivity();
    };
    lessonEngine.subscribe(refreshIdle);
    practiceEngine.subscribe(refreshIdle);
    walkthroughEngine.subscribe(refreshIdle);
  }

  // Notify any host (e.g. Gradio) that may be waiting on the API to attach.
  window.dispatchEvent(new CustomEvent('rubik-instructor-ready'));
}

const LEVEL_LABELS: Record<Level, string> = {
  newbie: 'Newbie',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
};

interface YouPanel {
  el: HTMLElement;
  refresh: () => void;
}

// The "You" panel: a persona selector (newbie / intermediate / advanced) plus a
// "What I remember" view that makes the learner's memory legible — mastered
// skills, the struggles the agent is still tracking (these fade and drop over
// time), skills due for review, and the next lesson it recommends.
function buildYouPanel(current: Level, onChange: (level: Level) => void): YouPanel {
  const el = document.createElement('div');
  el.id = 'level';

  const section = document.createElement('div');
  section.className = 'exp-section';
  section.textContent = 'Your level';
  el.appendChild(section);

  const row = document.createElement('div');
  row.className = 'exp-row';
  const buttons = new Map<Level, HTMLButtonElement>();
  let active = current;
  const refreshButtons = (): void => {
    for (const [lv, btn] of buttons) btn.classList.toggle('is-active', lv === active);
  };
  for (const lv of LEVELS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'exp-btn';
    btn.textContent = LEVEL_LABELS[lv];
    btn.addEventListener('click', () => {
      active = lv;
      refreshButtons();
      onChange(lv);
    });
    buttons.set(lv, btn);
    row.appendChild(btn);
  }
  el.appendChild(row);

  const hint = document.createElement('p');
  hint.className = 'exp-hint';
  hint.textContent =
    'Newbie: gentle, layer-by-layer. Intermediate / Advanced: CFOP framing and terser cues.';
  el.appendChild(hint);

  const memSection = document.createElement('div');
  memSection.className = 'exp-section';
  memSection.textContent = 'What I remember';
  el.appendChild(memSection);

  const memEl = document.createElement('div');
  memEl.className = 'you-memory';
  el.appendChild(memEl);

  const line = (label: string, value: string): void => {
    const p = document.createElement('p');
    p.className = 'exp-hint';
    const b = document.createElement('b');
    b.textContent = `${label}: `;
    p.appendChild(b);
    p.appendChild(document.createTextNode(value));
    memEl.appendChild(p);
  };

  const renderMemory = (): void => {
    memEl.replaceChildren();
    const digest = buildMemoryDigest(loadProfile());
    if (digest.sessions === 0 && !digest.mastered.length && !digest.struggles.length) {
      line('New here', 'take a lesson and I’ll start remembering how you’re doing.');
      return;
    }
    line('Sessions', String(digest.sessions));
    line('Mastered', digest.mastered.length ? digest.mastered.join(', ') : '—');
    line(
      'Working on',
      digest.struggles.length
        ? digest.struggles.map((s) => `${s.label ?? s.stage} (${s.mistakes} slips)`).join(', ')
        : '—'
    );
    if (digest.dueForReview.length) line('Due for review', digest.dueForReview.join(', '));
    const rec = recommendNext(loadProfile());
    if (rec) line('Recommended next', `${rec.lesson.title} — ${reasonText(rec.reason)}`);
  };

  renderMemory();
  refreshButtons();
  return { el, refresh: () => { renderMemory(); refreshButtons(); } };
}

// A dismissible "welcome back" bar driven purely by client-side memory.
function maybeShowWelcomeBack(container: HTMLElement, digest: MemoryDigest): void {
  const hasMemory =
    digest.sessions > 0 ||
    digest.mastered.length > 0 ||
    digest.struggles.length > 0 ||
    digest.dueForReview.length > 0;
  if (!hasMemory) return;
  const bar = document.createElement('div');
  bar.id = 'welcome-back';

  const parts = ['Welcome back.'];
  if (digest.sessions > 0) parts.push(`${digest.sessions} session${digest.sessions === 1 ? '' : 's'} so far.`);
  if (digest.dueForReview.length) parts.push(`Time to refresh: ${digest.dueForReview[0]}.`);
  else if (digest.struggles.length) {
    const s = digest.struggles[0];
    parts.push(`Last time you worked on: ${s.label ?? s.stage}.`);
  } else if (digest.mastered.length) parts.push(`You’ve already got: ${digest.mastered[0]}.`);

  const msg = document.createElement('span');
  msg.textContent = parts.join(' ');
  bar.appendChild(msg);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'welcome-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss');
  close.addEventListener('click', () => bar.remove());
  bar.appendChild(close);

  container.appendChild(bar);
}

function buildHelp(): HTMLElement {
  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = `
    <div><b>Drag</b> a face to rotate that layer</div>
    <div><b>U/D/L/R/F/B</b> face turns &nbsp; <b>M/E/S</b> middle slices &nbsp; <b>X/Y/Z</b> whole cube</div>
    <div><b>Shift</b>+key = prime (counter-clockwise) &nbsp; <b>Space</b> = scramble &nbsp; <b>Enter</b> = reset</div>
  `;
  return help;
}

function start(): void {
  const el = document.getElementById('app');
  if (el) { boot(el); return; }
  // The bundle may load before Gradio injects #app. Watch for it.
  const obs = new MutationObserver(() => {
    const target = document.getElementById('app');
    if (target) {
      obs.disconnect();
      boot(target);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
