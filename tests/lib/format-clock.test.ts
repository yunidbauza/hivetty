import { describe, expect, it } from 'vitest';

import { clockTime } from '@lib/format-clock';

describe('clockTime (HIVE-211)', () => {
  it('formats a clock time, hours and minutes', () => {
    expect(clockTime(new Date('2026-10-03T10:42:59').getTime())).toMatch(/10:42/);
  });
});
