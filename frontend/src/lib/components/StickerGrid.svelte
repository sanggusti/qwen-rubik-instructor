<script lang="ts">
  // The 54-sticker review/adjust grid: an unfolded cube net the user can
  // correct by tapping (tap cycles through the six colors). Centers are fixed
  // (they define each face). Doubles as full manual entry when the camera is
  // unavailable. Suspect stickers from a failed validation pulse red;
  // low-confidence reads from the classifier pulse amber.
  import type { Color, FaceKey, State } from '../cube/state';
  import type { StickerRef } from '../physical/legality';

  interface Props {
    state: State;
    confidence?: Record<FaceKey, number[]> | null;
    suspects?: StickerRef[];
    onCell(face: FaceKey, index: number, color: Color): void;
  }

  const { state, confidence = null, suspects = [], onCell }: Props = $props();

  const CYCLE: Color[] = ['U', 'D', 'L', 'R', 'F', 'B'];
  const COLOR_NAMES: Record<Color, string> = {
    U: 'white',
    D: 'yellow',
    L: 'orange',
    R: 'red',
    F: 'green',
    B: 'blue'
  };

  function next(color: Color): Color {
    return CYCLE[(CYCLE.indexOf(color) + 1) % CYCLE.length];
  }

  function isSuspect(face: FaceKey, index: number): boolean {
    return suspects.some((s) => s.face === face && s.index === index);
  }

  function isUncertain(face: FaceKey, index: number): boolean {
    return (confidence?.[face]?.[index] ?? 1) < 0.5;
  }

  // Unfolded net:      U
  //                 L  F  R  B
  //                    D
  const NET: (FaceKey | null)[][] = [
    [null, 'U', null, null],
    ['L', 'F', 'R', 'B'],
    [null, 'D', null, null]
  ];
</script>

<div class="net" role="group" aria-label="Cube stickers">
  {#each NET as row, r (r)}
    <div class="net-row">
      {#each row as face, c (c)}
        {#if face}
          <div class="face" aria-label="{COLOR_NAMES[state[face][4]]} side">
            {#each state[face] as cell, i (i)}
              <button
                type="button"
                class="cell c-{cell}"
                class:suspect={isSuspect(face, i)}
                class:uncertain={!isSuspect(face, i) && isUncertain(face, i)}
                class:center={i === 4}
                disabled={i === 4}
                aria-label="{COLOR_NAMES[cell]} sticker"
                onclick={() => onCell(face, i, next(cell))}
              ></button>
            {/each}
          </div>
        {:else}
          <div class="face gap" aria-hidden="true"></div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .net {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .net-row {
    display: flex;
    gap: 6px;
  }
  .face {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 3px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
  }
  .face.gap {
    background: transparent;
    visibility: hidden;
  }
  .cell {
    appearance: none;
    width: clamp(16px, 4.4vw, 26px);
    height: clamp(16px, 4.4vw, 26px);
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    cursor: pointer;
    padding: 0;
  }
  .cell.center {
    cursor: default;
    border-style: double;
    border-width: 3px;
  }
  .cell.c-U { background: #ffffff; }
  .cell.c-D { background: #ffd500; }
  .cell.c-L { background: #ff8c1a; }
  .cell.c-R { background: #d63040; }
  .cell.c-F { background: #2fae54; }
  .cell.c-B { background: #2f6bd6; }
  .cell.suspect {
    outline: 2px solid #ff5d5d;
    animation: pulse 1s ease-in-out infinite;
  }
  .cell.uncertain {
    outline: 2px solid #ffb84d;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% { outline-color: transparent; }
  }
</style>
