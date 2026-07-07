# Scanner fixture corpus

Ground-truth labeled cube-face images for the physical-scanning pipeline
(`sampler.ts` → `color-classify.ts` → `legality.ts`). The pipeline is pure
functions over plain RGBA buffers, so the whole scanner is tested here in
node — no camera, no browser.

## Contents

- `synthetic/` + `labels.json` — generated face renders under controlled
  conditions (normal / warm white-balance cast / dim / specular glare).
  Regenerate with `npx vite-node scripts/gen-face-fixtures.ts` (deterministic).
  Labels carry exact ground truth by construction.
- `real/` + `labels-real.json` — photos from the internet, hand-labeled.
  Currently face crops from [qbr](https://github.com/kkoomen/qbr) (MIT)
  demo images. Tested in `real-photos.test.ts` against nominal colors
  (a single face photo has no 6-center anchor set).

## Adding your own photos

Drop a face-on photo crop (stickers filling ~90% of a square PNG) into
`real/` and append an entry to `labels-real.json`:

```json
{ "file": "real/my-photo.png", "source": "own webcam", "face": "U", "cells": "BUDRULFDL" }
```

`cells` is the 9 sticker letters in facelet order (0..8, row-major,
viewer perspective) using face letters as colors: U=white, D=yellow,
L=orange, R=red, F=green, B=blue.

The shared TS↔Python legality fixture lives at
`backend/tests/fixtures/legality_fixtures.json`; regenerate with
`npx vite-node scripts/gen-legality-fixtures.ts` (self-checks against the TS
implementation before writing).
