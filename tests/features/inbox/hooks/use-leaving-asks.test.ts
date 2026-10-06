import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LEAVE_MS, useLeavingAsks } from '@features/inbox/hooks/use-leaving-asks';
import { notif, resetNotifIds } from '@tests/support/notifications';

const ask = (id: string) => notif({ id, kind: 'agent.ask', action: { type: 'ask', thread: id } });

describe('useLeavingAsks (HIVE-218)', () => {
  beforeEach(() => {
    resetNotifIds();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('holds a departed ask at its index for LEAVE_MS, then drops it', () => {
    const [a, b, c] = [ask('a'), ask('b'), ask('c')];
    const { result, rerender } = renderHook(({ rows }) => useLeavingAsks(rows), { initialProps: { rows: [a, b, c] } });
    rerender({ rows: [a, c] });
    expect(result.current.map((p) => [p.row.id, p.leaving])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(result.current.map((p) => p.row.id)).toEqual(['a', 'c']);
  });

  it('never holds a non-ask row', () => {
    const s = notif({ id: 's', kind: 'session.blocked', action: { type: 'session', entityId: 'nova' } });
    const { result, rerender } = renderHook(({ rows }) => useLeavingAsks(rows), { initialProps: { rows: [s] } });
    rerender({ rows: [] });
    expect(result.current).toEqual([]);
  });

  it('clears its timers on unmount', () => {
    const { rerender, unmount } = renderHook(({ rows }) => useLeavingAsks(rows), { initialProps: { rows: [ask('a')] } });
    rerender({ rows: [] });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
