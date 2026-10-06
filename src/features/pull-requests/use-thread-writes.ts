import { useMemo } from 'react';

import type { Pr } from '@/types/pull-request';

import type { ThreadWrites } from '@features/pull-requests/components/thread-card';
import { usePrThreadActions } from '@stores/hive-store';

/** A PR's thread writes for its cards (HIVE-207); none on a merged PR, whose page is read-only (D11). */
export function useThreadWrites(pr: Pr): ThreadWrites | undefined {
  const { reply, setResolved } = usePrThreadActions();
  const merged = pr.state === 'merged';
  return useMemo(
    () =>
      merged
        ? undefined
        : {
            reply: (threadId: string, body: string) => reply(pr.owner, pr.repo, pr.n, threadId, body),
            setResolved: (threadId: string, resolved: boolean) =>
              setResolved(pr.owner, pr.repo, pr.n, threadId, resolved),
          },
    [merged, reply, setResolved, pr.owner, pr.repo, pr.n],
  );
}
