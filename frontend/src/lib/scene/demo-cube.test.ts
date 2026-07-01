import { describe, it, expect } from 'vitest';
import { DemoCubeController } from './demo-cube';
import { solvedState } from '../cube/state';

function runToIdle(ctrl: DemoCubeController): void {
  let now = 0;
  for (let i = 0; i < 100000 && ctrl.isBusy(); i++) {
    now += 10000;
    ctrl.update(now);
  }
  if (ctrl.isBusy()) throw new Error('demo cube did not reach idle');
}

describe('DemoCubeController', () => {
  it('reports each move index in order as it plays, then holds', () => {
    const ctrl = new DemoCubeController();
    const applied: number[] = [];
    ctrl.onMoveApplied = (i) => applied.push(i);

    ctrl.seedAndPlay(solvedState(), ['R', 'U', "R'", "U'"]);
    runToIdle(ctrl);

    expect(applied).toEqual([0, 1, 2, 3]);
    expect(ctrl.isBusy()).toBe(false);
  });

  it('restarts the index count on each new seedAndPlay', () => {
    const ctrl = new DemoCubeController();
    const applied: number[] = [];
    ctrl.onMoveApplied = (i) => applied.push(i);

    ctrl.seedAndPlay(solvedState(), ['R', 'U']);
    runToIdle(ctrl);
    ctrl.seedAndPlay(solvedState(), ['F', 'B', 'L']);
    runToIdle(ctrl);

    expect(applied).toEqual([0, 1, 0, 1, 2]);
  });

  it('cancels an in-flight sequence when re-seeded', () => {
    const ctrl = new DemoCubeController();
    ctrl.seedAndPlay(solvedState(), ['R', 'U', 'F', 'B', 'L', 'D']);
    ctrl.update(0); // begin the first move (now in-flight)
    expect(ctrl.isBusy()).toBe(true);

    ctrl.seedAndPlay(solvedState(), ['R']);
    runToIdle(ctrl);
    expect(ctrl.isBusy()).toBe(false);
  });
});
