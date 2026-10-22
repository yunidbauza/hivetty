import { describe, expect, it } from 'vitest';

import { isPlanFilePath } from '@shared/plan-contract';

describe('plan contract: the hook-facing helpers (HIVE-236)', () => {
  it('recognises a hive:plan file one level under .hive/plans', () => {
    expect(isPlanFilePath('/r/.hive/plans/2026-10-21-x.md')).toBe(true);
    expect(isPlanFilePath('/r/.hive/plans/deep/x.md')).toBe(false);
    expect(isPlanFilePath(42)).toBe(false);
  });
});
