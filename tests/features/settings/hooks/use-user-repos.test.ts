import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GhResult, UserReposSnapshot } from '@shared/github-contract';

import { useUserRepos } from '@features/settings/hooks/use-user-repos';
import { readUserRepos } from '@lib/github';

vi.mock('@lib/github', () => ({ readUserRepos: vi.fn() }));

const read = vi.mocked(readUserRepos);

const SNAPSHOT: UserReposSnapshot = { repos: [], total: 0 };
const READY: GhResult<UserReposSnapshot> = { ok: true, value: SNAPSHOT };
const OFFLINE_ERROR = { kind: 'offline' as const, message: 'Could not reach GitHub.' };
const OFFLINE: GhResult<UserReposSnapshot> = { ok: false, error: OFFLINE_ERROR };

beforeEach(() => {
  read.mockReset();
});

describe('useUserRepos', () => {
  it('starts loading and becomes ready with the snapshot', async () => {
    read.mockResolvedValue(READY);
    const { result } = renderHook(() => useUserRepos());

    expect(result.current.status).toEqual({ state: 'loading' });
    await waitFor(() => {
      expect(result.current.status).toEqual({ state: 'ready', snapshot: SNAPSHOT });
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when there is no bridge', async () => {
    read.mockResolvedValue(null);
    const { result } = renderHook(() => useUserRepos());
    await waitFor(() => {
      expect(result.current.status).toEqual({ state: 'unavailable' });
    });
  });

  it('fails with the error, and retry fetches again', async () => {
    read.mockResolvedValueOnce(OFFLINE).mockResolvedValueOnce(READY);
    const { result } = renderHook(() => useUserRepos());

    await waitFor(() => {
      expect(result.current.status).toEqual({ state: 'failed', error: OFFLINE_ERROR });
    });

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toEqual({ state: 'loading' });
    await waitFor(() => {
      expect(result.current.status.state).toBe('ready');
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('ignores a reply that lands after unmount', async () => {
    let resolve: (value: GhResult<UserReposSnapshot>) => void = () => undefined;
    read.mockReturnValue(
      new Promise((settle) => {
        resolve = settle;
      }),
    );
    const { result, unmount } = renderHook(() => useUserRepos());

    unmount();
    await act(async () => {
      resolve(READY);
      await Promise.resolve();
    });
    expect(result.current.status).toEqual({ state: 'loading' });
  });
});
