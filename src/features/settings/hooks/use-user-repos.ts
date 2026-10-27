import { useCallback, useEffect, useState } from 'react';

import { readUserRepos } from '@lib/github';
import type { GhError, UserReposSnapshot } from '@shared/github-contract';

/**
 * The `gh` account's repositories, fetched once per visit to the clone view.
 *
 * Local state, not a store: the list is transient view data that nothing else
 * reads, which is `clone-repo.ts`'s reasoning for staying out of a reducer.
 * `unavailable` is the browser demo or an IPC hiccup; the picker shows no list
 * then, and the field works exactly as it did before the picker existed.
 */

export type UserReposStatus =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; snapshot: UserReposSnapshot }
  | { state: 'failed'; error: GhError };

export function useUserRepos(): { status: UserReposStatus; retry: () => void } {
  const [status, setStatus] = useState<UserReposStatus>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;

    void readUserRepos().then((result) => {
      if (!live) return;
      if (result === null) setStatus({ state: 'unavailable' });
      else if (result.ok) setStatus({ state: 'ready', snapshot: result.value });
      else setStatus({ state: 'failed', error: result.error });
    });

    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { status, retry };
}
