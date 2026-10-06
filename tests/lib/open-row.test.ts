import { describe, expect, it } from 'vitest';

import { openRowIndex } from '@lib/open-row';

/** Which row a list place shows: the last one, else the next, else the first. */
describe('openRowIndex', () => {
  const keys = ['a', 'b', 'c'];

  it('shows the first row when nothing was shown', () => {
    expect(openRowIndex(keys, null, -1)).toBe(0);
  });

  it('shows the last row shown while it is listed, wherever it moved', () => {
    expect(openRowIndex(keys, 'b', 1)).toBe(1);
    expect(openRowIndex(['b', 'a', 'c'], 'b', 1)).toBe(0);
  });

  it('shows the row that came next when the last one leaves', () => {
    expect(openRowIndex(['a', 'c'], 'b', 1)).toBe(1);
  });

  it('wraps to the first when the one that left was the last row', () => {
    expect(openRowIndex(['a', 'b'], 'c', 2)).toBe(0);
  });

  it('keeps a row opened from outside the list', () => {
    expect(openRowIndex(keys, 'z', -1)).toBe(-1);
    expect(openRowIndex([], 'z', -1)).toBe(-1);
  });

  it('shows nothing with nothing listed', () => {
    expect(openRowIndex([], null, -1)).toBeNull();
    expect(openRowIndex([], 'b', 1)).toBeNull();
  });
});
