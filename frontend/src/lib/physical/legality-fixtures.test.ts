// Cross-validation against the frozen fixture shared with the backend
// (backend/tests/fixtures/legality_fixtures.json). Python's legality.py loads
// the same file; both engines must agree on every case — the same convention
// as cube_fixtures.json for the move engine.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { State } from '../cube/state';
import { checkLegality } from './legality';

interface FixtureCase {
  name: string;
  state: State;
  legal: boolean;
  code?: string;
}

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../backend/tests/fixtures/legality_fixtures.json'
);

const CASES: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

describe('legality fixtures (shared with backend)', () => {
  it('has a healthy case count', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });

  for (const c of CASES) {
    it(c.name, () => {
      const res = checkLegality(c.state);
      expect(res.ok).toBe(c.legal);
      if (!res.ok) expect(res.code).toBe(c.code);
    });
  }
});
