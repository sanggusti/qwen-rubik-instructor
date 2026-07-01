// A sliding window over a long move list: at most `max` chips centred on the
// active move, so a long solve stage stays readable (with "…" on the clipped
// ends). The window follows the active move forward as playback advances.
export function moveWindow(
  total: number,
  activeIndex: number,
  max: number
): { start: number; end: number } {
  if (total <= max) return { start: 0, end: total };
  const focus = activeIndex < 0 ? 0 : Math.min(activeIndex, total - 1);
  let start = Math.max(0, focus - Math.floor(max / 2));
  const end = Math.min(total, start + max);
  start = Math.max(0, end - max); // pull back when near the tail so we always show `max`
  return { start, end };
}
