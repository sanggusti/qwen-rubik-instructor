import { describe, it, expect } from 'vitest';
import { CubeMesh, CUBIE_SIZE, CUBIE_GAP } from '../scene/cube';
import { SequenceScrubber } from './scrub';
import { FULL_SEQUENCE } from './solve-sequence';

const STEP = CUBIE_SIZE + CUBIE_GAP;

// Round to 6 decimals and normalize -0 so float sign noise can't fail equality.
function round6(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

function transforms(cube: CubeMesh) {
  return cube.cubies.map(c => ({
    pos: c.mesh.position.toArray().map(round6),
    quat: c.mesh.quaternion.toArray().map(round6),
    coord: c.coord.toArray()
  }));
}

describe('SequenceScrubber', () => {
  it('scrubbing forward then back returns every cubie to its home transform', () => {
    const cube = new CubeMesh();
    const home = transforms(cube);
    const scrubber = new SequenceScrubber(cube, FULL_SEQUENCE);

    for (let t = 0; t < scrubber.length; t += 0.37) scrubber.setProgress(t);
    scrubber.setProgress(scrubber.length);
    for (let t = scrubber.length; t > 0; t -= 0.29) scrubber.setProgress(t);
    scrubber.setProgress(0);

    expect(transforms(cube)).toEqual(home);
  });

  it('incremental fractional scrubbing matches a single jump to the end', () => {
    const stepwise = new CubeMesh();
    const oneShot = new CubeMesh();
    const a = new SequenceScrubber(stepwise, FULL_SEQUENCE);
    const b = new SequenceScrubber(oneShot, FULL_SEQUENCE);

    for (let t = 0; t < a.length; t += 0.113) a.setProgress(t);
    a.setProgress(a.length);
    b.setProgress(b.length);

    expect(transforms(stepwise)).toEqual(transforms(oneShot));
  });

  it('a partial turn is fully undone when progress snaps back to the floor', () => {
    const scrubbed = new CubeMesh();
    const reference = new CubeMesh();
    const a = new SequenceScrubber(scrubbed, FULL_SEQUENCE);
    const b = new SequenceScrubber(reference, FULL_SEQUENCE);

    a.setProgress(3.5);
    a.setProgress(3);
    b.setProgress(3);

    expect(transforms(scrubbed)).toEqual(transforms(reference));
  });

  it('ends on exact lattice positions after the full sequence', () => {
    const cube = new CubeMesh();
    new SequenceScrubber(cube, FULL_SEQUENCE).setProgress(FULL_SEQUENCE.length);
    for (const { mesh } of cube.cubies) {
      for (const v of mesh.position.toArray()) {
        expect(Math.abs(v / STEP - Math.round(v / STEP))).toBeLessThan(1e-9);
      }
    }
  });
});
