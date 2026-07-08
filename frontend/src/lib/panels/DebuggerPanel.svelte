<script lang="ts">
  import { onMount } from 'svelte';
  import { cubeStore } from '../stores/cube.svelte';
  import { FACE_COLORS } from '../scene/face-colors';
  import type { FaceKey } from '../cube/state';

  const FACE_ORDER: FaceKey[] = ['U', 'L', 'F', 'R', 'B', 'D'];
  const HISTORY_LIMIT = 20;

  let history = $state<string[]>([]);

  onMount(() => {
    const offMove = cubeStore.onMove((move) => {
      history = [...history, move].slice(-HISTORY_LIMIT);
    });
    const offReset = cubeStore.onReset(() => { history = []; });
    return () => {
      offMove();
      offReset();
    };
  });

  function hex(faceColor: number): string {
    return '#' + faceColor.toString(16).padStart(6, '0');
  }
</script>

<div class="dbg-head">
  <h3>Rubik's Debugger</h3>
</div>

<div class="row">
  <span>Solved:</span>
  <span class={cubeStore.isSolved ? 'solved-yes' : 'solved-no'}>{cubeStore.isSolved ? 'yes' : 'no'}</span>
</div>

<div class="faces">
  {#each FACE_ORDER as face (face)}
    <div class="face">
      <div class="label">{face}</div>
      {#each cubeStore.state[face] as color, i (i)}
        <div class="sticker" style:background={hex(FACE_COLORS[color])}></div>
      {/each}
    </div>
  {/each}
</div>

<div class="hist-title">History</div>
<div class="history">{history.join(' ')}</div>

<style>
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-a);
    text-shadow: 0 0 12px var(--accent-a-dim);
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-dim);
  }
  .solved-yes {
    color: var(--ok);
    text-shadow: 0 0 10px var(--ok-dim);
  }
  .solved-no {
    color: var(--no);
  }
  .faces {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 8px;
    margin: 10px 0;
  }
  .face {
    display: grid;
    grid-template-columns: repeat(3, 11px);
    grid-template-rows: repeat(3, 11px);
    gap: 1.5px;
    padding: 3px;
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 5px;
  }
  .face .label {
    grid-column: 1 / span 3;
    text-align: center;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: #8ea0bf;
    margin-bottom: 2px;
  }
  .sticker {
    width: 11px;
    height: 11px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .hist-title {
    margin-top: 8px;
    color: #8ea0bf;
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .history {
    margin-top: 4px;
    max-height: 80px;
    overflow-y: auto;
    font-size: 11px;
    color: #e6edf6;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.04);
    padding: 6px 8px;
    border-radius: 7px;
    white-space: normal;
    word-break: break-word;
  }
</style>
