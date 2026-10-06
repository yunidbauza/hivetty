import { useEffect, useMemo } from 'react';

import { fileTree, firstFile } from '@/lib/pr-files';
import type { Pr } from '@/types/pull-request';

import { PrDiff } from '@features/pull-requests/components/pr-diff';
import { PrFileTree } from '@features/pull-requests/components/pr-file-tree';
import { useThreadWrites } from '@features/pull-requests/use-thread-writes';
import type { PrDetail } from '@shared/github-contract';
import { prKey, useLoadPrDiff, useParsedPrDiff, usePrDiff, useSetPrFileViewed } from '@stores/hive-store';
import { usePrFile, usePrPageActions } from '@stores/ui-store';

/**
 * The PR page's Files tab (HIVE-207): the tree beside the selected file's
 * diff. The diff is read at the detail's head sha, so the page's 60s detail
 * poll moving the head re-reads it; never on a timer of its own.
 */
export function PrFiles({ pr, detail, fixerOnIt, onOpenFile }: { pr: Pr; detail: PrDetail; fixerOnIt: boolean; onOpenFile?: (path: string, line: number) => void }) {
  const key = prKey(pr.owner, pr.repo, pr.n);
  const load = useLoadPrDiff();
  const entry = usePrDiff(key);
  const parsed = useParsedPrDiff(key);
  const setViewed = useSetPrFileViewed();
  const writes = useThreadWrites(pr);
  const chosen = usePrFile();
  const { setPrFile } = usePrPageActions();

  useEffect(() => {
    void load(pr.owner, pr.repo, pr.n, detail.headSha);
  }, [load, pr.owner, pr.repo, pr.n, detail.headSha]);

  /* A chosen path no longer in the list falls back here, in render, not in the store. */
  const all = useMemo(() => fileTree(detail.files), [detail.files]);
  const path = chosen !== null && detail.files.some((f) => f.path === chosen) ? chosen : firstFile(all, detail.threads);
  const file = detail.files.find((f) => f.path === path);
  const diff = parsed?.find((d) => d.path === path) ?? null;
  /* A missing entry is normal (the slice evicts past its cap): it reads as loading, as a first read does (#22). */
  const loading = entry === undefined || (entry.state === 'loading' && entry.text === undefined);

  return (
    <div className="flex min-h-0 flex-1">
      <PrFileTree detail={detail} selected={path} onSelect={setPrFile} />
      {file === undefined ? (
        <p className="px-[18px] py-4 text-ui text-muted">No files changed.</p>
      ) : (
        <PrDiff
          key={file.path}
          file={file}
          diff={diff}
          threads={detail.threads}
          problem={entry?.state === 'failed' ? entry.problem : undefined}
          loading={loading}
          prUrl={pr.url}
          readOnly={pr.state === 'merged'}
          onViewed={(viewed) => setViewed(pr.owner, pr.repo, pr.n, file.path, viewed)}
          onOpenFile={onOpenFile}
          onRetry={() => void load(pr.owner, pr.repo, pr.n, detail.headSha)}
          writes={writes}
          fixerOnIt={fixerOnIt}
        />
      )}
    </div>
  );
}
