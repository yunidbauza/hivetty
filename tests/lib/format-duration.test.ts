import { describe, expect, it } from 'vitest';

import { formatDuration } from '@lib/format-duration';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [59_000, '59s'],
    [60_000, '1m 0s'],
    [328_000, '5m 28s'],
    [3_771_000, '1h 2m'],
    [94_440_000, '26h 14m'],
    [-5_000, '0s'],
  ])('%i ms reads %s', (ms, label) => {
    expect(formatDuration(ms)).toBe(label);
  });
});
