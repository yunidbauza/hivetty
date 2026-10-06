import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useThreadWrites } from '@features/pull-requests/use-thread-writes';
import { useHiveStore } from '@stores/hive-store';
import { hatchRow } from '@tests/support/hatchery';

const reply = vi.fn(() => Promise.resolve({ ok: true as const, value: true as const }));
const setResolved = vi.fn(() => Promise.resolve({ ok: true as const, value: true as const }));

beforeEach(() => {
  useHiveStore.getState().reset();
  useHiveStore.setState({ replyToPrThread: reply, setPrThreadResolved: setResolved });
});

describe('useThreadWrites', () => {
  it('binds the PR to the store’s thread actions', async () => {
    const { pr } = hatchRow();
    const { result } = renderHook(() => useThreadWrites(pr));
    await result.current?.reply('T', 'hi');
    await result.current?.setResolved('T', true);
    expect(reply).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 'T', 'hi');
    expect(setResolved).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 'T', true);
  });

  it('is undefined on a merged PR', () => {
    const { pr } = hatchRow({ state: 'merged' });
    expect(renderHook(() => useThreadWrites(pr)).result.current).toBeUndefined();
  });
});
