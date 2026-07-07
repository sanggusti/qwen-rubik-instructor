#!/usr/bin/env bash
# Regenerate docs/images/physical-*.gif from the Playwright recordings.
# 1) RECORD_GIFS=1 npx playwright test e2e/record-gifs.spec.ts --project=desktop --workers=1
# 2) ./scripts/make-physical-gifs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SCAN=$(ls test-results/record-gifs-record-scan*/video.webm)
GUIDED=$(ls test-results/record-gifs-record-guided*/video.webm)
OFFSET=$(cat test-results/gif2-offset.txt)

FILTERS='fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4'

# Scan flow: trim the page-load flash, speed up 1.5x.
ffmpeg -y -v error -ss 2.4 -i "$SCAN" \
  -vf "setpts=PTS/1.5,$FILTERS" ../docs/images/physical-scan.gif

# Guided flow: trim everything before "ready" (offset written by the spec).
ffmpeg -y -v error -ss "$OFFSET" -i "$GUIDED" \
  -vf "setpts=PTS/1.4,$FILTERS" ../docs/images/physical-guided.gif

ls -la ../docs/images/physical-*.gif
