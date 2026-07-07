// Client for POST /scan/assist — the Qwen-VL fallback for ambiguous sticker
// reads. Follows the narrate.ts conventions (PUBLIC_BACKEND_URL base, throw
// with the backend's `detail` on !ok).

import { PUBLIC_BACKEND_URL } from '$env/static/public';
import type { Color, FaceKey } from '../cube/state';

const BASE_URL = PUBLIC_BACKEND_URL ? PUBLIC_BACKEND_URL : 'http://localhost:8000';

export interface ScanAssistFace {
  face: FaceKey;
  /** JPEG/PNG data URL (or raw base64) of the face crop. */
  imageBase64: string;
  lowConfidenceCells?: number[];
}

export interface ScanAssistResult {
  faces: { face: FaceKey; cells: Color[] }[];
  /** True when the vision call failed and the server degraded gracefully. */
  degraded: boolean;
}

export async function scanAssist(faces: ScanAssistFace[]): Promise<ScanAssistResult> {
  const res = await fetch(`${BASE_URL}/scan/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ faces })
  });
  if (!res.ok) {
    let detail = `Backend returned ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return (await res.json()) as ScanAssistResult;
}
