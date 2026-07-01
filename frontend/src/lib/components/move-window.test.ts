import { describe, it, expect } from 'vitest';
import { moveWindow } from './move-window';

describe('moveWindow', () => {
  it('shows everything when the list fits', () => {
    expect(moveWindow(6, 2, 10)).toEqual({ start: 0, end: 6 });
    expect(moveWindow(10, 9, 10)).toEqual({ start: 0, end: 10 });
  });

  it('anchors to the start before the active move reaches the middle', () => {
    expect(moveWindow(30, 0, 10)).toEqual({ start: 0, end: 10 });
    expect(moveWindow(30, 3, 10)).toEqual({ start: 0, end: 10 });
  });

  it('centres the window on the active move mid-list', () => {
    // focus 15, max 10 -> start 10, end 20 (active stays visible with context)
    const w = moveWindow(30, 15, 10);
    expect(w).toEqual({ start: 10, end: 20 });
    expect(15).toBeGreaterThanOrEqual(w.start);
    expect(15).toBeLessThan(w.end);
  });

  it('pins to the tail near the end so it always shows `max`', () => {
    expect(moveWindow(30, 29, 10)).toEqual({ start: 20, end: 30 });
    expect(moveWindow(30, 28, 10)).toEqual({ start: 20, end: 30 });
  });

  it('handles no active move (activeIndex -1) by anchoring to the start', () => {
    expect(moveWindow(30, -1, 10)).toEqual({ start: 0, end: 10 });
  });
});
