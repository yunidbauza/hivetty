import { Fragment, useCallback, useMemo, useState } from 'react';

import { lineKey, placeThreads } from '@/lib/pr-files';
import { splitRows, type DiffFile, type DiffLine } from '@/lib/unified-diff';
import { cn } from '@/lib/utils';

import { SegmentedControl } from '@components/ui/segmented-control';
import { DiffRow, type SelectLine } from '@features/pull-requests/components/pr-diff-row';
import { ThreadCard, type ThreadWrites } from '@features/pull-requests/components/thread-card';
import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import type { GhResult, PrFile, PrThread } from '@shared/github-contract';
import { usePrDiffView, usePrPageActions, type PrDiffView } from '@stores/ui-store';

const VIEWS = [
  { value: 'unified', label: 'Unified' },
  { value: 'split', label: 'Split' },
] as const satisfies readonly { value: PrDiffView; label: string }[];

/**
 * Past this many rows a file (a lockfile, a generated bundle) waits behind
 * "Show full diff". Rows are the current view's: lines in Unified, paired rows
 * in Split, so Split shows at least as many lines. The offer still says
 * "lines" in Split, where the number is rows: an accepted approximation.
 */
export const DIFF_ROW_CAP = 2_000;

/** How many of each hunk's rows to draw: the cap spent in order, across hunk boundaries. */
export function capRows(counts: readonly number[], cap: number): number[] {
  let left = cap;
  return counts.map((count) => {
    const shown = Math.min(count, left);
    left -= shown;
    return shown;
  });
}

/** A selected gutter number: its side too, since a removed line and an added one can share a number. */
interface Selection {
  side: 'L' | 'R';
  n: number;
  /** Where the editor opens: always a new-side line. */
  open: number;
}

/**
 * The new-side line a row opens the editor at: its own, else (a removed line)
 * the next line the hunk keeps on the new side, else the last one before it.
 */
function openLineOf(lines: DiffLine[], index: number): number {
  const own = lines[index]?.newN;
  if (own !== null && own !== undefined) return own;
  const next = lines.slice(index + 1).find((line) => line.newN !== null)?.newN;
  if (next !== null && next !== undefined) return next;
  const before = lines.slice(0, index).findLast((line) => line.newN !== null)?.newN;
  return before ?? 1;
}

/**
 * The selected file's diff (HIVE-207): the header (path, +/−, Viewed, Unified
 * | Split, Open in the editor) and plain mono rows in the editor's font and
 * palette — no highlighting, so the editor seam is untouched.
 */
export interface PrDiffProps {
  file: PrFile;
  diff: DiffFile | null;
  threads: PrThread[];
  /** The diff read's failure; over the diff when an older text is still shown (#22), else in its place. */
  problem?: string;
  /** No text yet: the first read, or an entry the slice evicted. */
  loading?: boolean;
  prUrl: string;
  readOnly: boolean;
  onViewed: (viewed: boolean) => Promise<GhResult<true>>;
  onOpenFile?: (path: string, line: number) => void;
  /** Read the diff again after a failed read; the head has not moved, so nothing else would. */
  onRetry?: () => void;
  writes?: ThreadWrites;
  fixerOnIt: boolean;
}

/** The diff read's failure, with Retry when the parent can re-read. */
function ProblemLine({ problem, onRetry, className }: { problem: string | undefined; onRetry?: () => void; className: string }) {
  if (problem === undefined) return null;
  return (
    <p className={cn('flex items-center gap-2 font-sans text-control text-amber-text', className)}>
      {problem}
      {onRetry === undefined ? null : (
        <button type="button" onClick={onRetry} className="text-brand hover:underline">
          Retry
        </button>
      )}
    </p>
  );
}

/** With nothing selected, the editor opens at the first changed line. */
function firstOpenLine(diff: DiffFile | null): number {
  for (const hunk of diff?.hunks ?? []) {
    const i = hunk.lines.findIndex((line) => line.kind !== 'context');
    if (i >= 0) return openLineOf(hunk.lines, i);
  }
  return 1;
}

export function PrDiff({ file, diff, threads, problem, loading = false, prUrl, readOnly, onViewed, onOpenFile, onRetry, writes, fixerOnIt }: PrDiffProps) {
  const view = usePrDiffView();
  const { setPrDiffView } = usePrPageActions();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [viewedProblem, setViewedProblem] = useState<string | null>(null);
  // A re-toggle mid-write would roll back to the wrong state, so Viewed waits for its write (#22).
  const [pending, setPending] = useState(false);
  const openAt = selected?.open ?? firstOpenLine(diff);
  const showable = diff !== null && !diff.binary && diff.hunks.length > 0;
  const placed = useMemo(() => (diff === null ? null : placeThreads(diff, threads)), [diff, threads]);
  const select = useCallback<SelectLine>(
    (side, h, at) => {
      const lines = diff?.hunks[h]?.lines;
      const line = lines?.[at];
      if (!lines || !line) return;
      const n = side === 'L' ? line.oldN : line.newN;
      if (n !== null) setSelected({ side, n, open: openLineOf(lines, at) });
    },
    [diff],
  );
  const split = useMemo(() => diff?.hunks.map(splitRows) ?? [], [diff]);
  const [full, setFull] = useState(false);
  const counts = useMemo(
    () => (view === 'unified' ? (diff?.hunks.map((hunk) => hunk.lines.length) ?? []) : split.map((rows) => rows.length)),
    [view, diff, split],
  );
  const shown = useMemo(() => capRows(counts, full ? Infinity : DIFF_ROW_CAP), [counts, full]);
  const hidden = counts.reduce((a, b) => a + b, 0) - shown.reduce((a, b) => a + b, 0);
  // Threads anchored on rows past the cap draw nowhere until the full diff is shown, so the offer names them.
  const hiddenThreads = useMemo(() => {
    if (placed === null || diff === null || hidden === 0) return 0;
    const drawn = new Set<string>();
    const rest = new Set<string>();
    diff.hunks.forEach((hunk, h) => {
      const cut = shown[h] ?? 0;
      const ends: [number | null, number | null][] =
        view === 'unified' ? hunk.lines.map((line) => [line.oldN, line.newN]) : (split[h] ?? []).map((row) => [row.left?.oldN ?? null, row.right?.newN ?? null]);
      ends.forEach(([oldN, newN], i) => {
        const into = i < cut ? drawn : rest;
        if (oldN !== null) into.add(lineKey('L', oldN));
        if (newN !== null) into.add(lineKey('R', newN));
      });
    });
    let count = 0;
    for (const [key, list] of placed.at) if (rest.has(key) && !drawn.has(key)) count += list.length;
    return count;
  }, [placed, diff, hidden, shown, view, split]);

  const card = (thread: PrThread) => (
    <div key={thread.id} data-thread={thread.id} className="my-1.5 mr-[18px] ml-[72px] font-sans">
      <ThreadCard thread={thread} fixerOnIt={fixerOnIt && !thread.isResolved} onOpenFile={onOpenFile} writes={writes} />
    </div>
  );
  const under = (key: string) => placed?.at.get(key)?.map(card);

  const toggleViewed = (next: boolean) => {
    setViewedProblem(null);
    setPending(true);
    void onViewed(next).then((result) => {
      setPending(false);
      if (!result.ok) setViewedProblem(result.error.message);
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2.5 border-b border-border-soft px-[18px] py-2.5 text-control">
        <h2 className="truncate tabular-nums text-ink">{file.path}</h2>
        <span className="tabular-nums text-green">{`+${String(file.additions)}`}</span>
        <span className="tabular-nums text-red">{`−${String(file.deletions)}`}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-control text-muted">
          <input
            type="checkbox"
            aria-label="Viewed"
            className="accent-brand-fill"
            checked={file.viewed === 'viewed'}
            disabled={readOnly || pending}
            onChange={(event) => toggleViewed(event.target.checked)}
          />
          Viewed
          {file.viewed === 'dismissed' ? <span className="text-amber-text">changed since</span> : null}
        </label>
        <SegmentedControl label="Diff view" options={VIEWS} value={view} onChange={setPrDiffView} />
        {onOpenFile !== undefined && diff?.status !== 'deleted' ? (
          <button type="button" onClick={() => onOpenFile(file.path, openAt)} className="text-control text-brand hover:underline">
            Open in the editor
          </button>
        ) : null}
      </div>
      {viewedProblem === null ? null : <p className="px-[18px] pt-2 text-control text-amber-text">{viewedProblem}</p>}
      <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-control leading-[1.75]">
        {loading ? (
          <div role="status" aria-label="Loading diff" aria-busy className="flex animate-pulse flex-col gap-2 px-[18px] pt-2">
            <SkeletonBar className="w-[92%]" />
            <SkeletonBar className="w-[84%]" />
            <SkeletonBar className="w-[58%]" />
          </div>
        ) : showable ? (
          <>
            <ProblemLine problem={problem} onRetry={onRetry} className="px-[18px] pb-2" />
            {placed?.outdated.map(card)}
            {diff.hunks.map((hunk, h) => {
              const rows = shown[h] ?? 0;
              return rows === 0 ? null : (
              <div key={`${String(h)}${hunk.header}`}>
                <div className="px-[18px] py-0.5 text-subtle">{hunk.header}</div>
                {view === 'unified'
                  ? hunk.lines.slice(0, rows).map((line, i) => {
                      const side = line.newN === null ? 'L' : 'R';
                      const n = line.newN ?? line.oldN;
                      return (
                      <Fragment key={i}>
                        <DiffRow
                          line={line}
                          n={n}
                          side={side}
                          hunk={h}
                          at={i}
                          onSelect={select}
                          selected={n !== null && selected?.side === side && selected.n === n}
                        />
                        {line.oldN !== null && line.kind !== 'context' ? under(lineKey('L', line.oldN)) : null}
                        {line.newN !== null ? under(lineKey('R', line.newN)) : null}
                        {line.kind === 'context' && line.oldN !== null ? under(lineKey('L', line.oldN)) : null}
                      </Fragment>
                      );
                    })
                  : (split[h] ?? []).slice(0, rows).map((row, i) => (
                      <Fragment key={i}>
                        <div data-testid={`split-row-${String(i)}`} className="grid grid-cols-2">
                          <div data-side="left" className="min-w-0 border-r border-border-soft">
                            {row.left === null ? (
                              <div className="h-full" />
                            ) : (
                              <DiffRow
                                line={row.left}
                                n={row.left.oldN}
                                side="L"
                                wrap
                                hunk={h}
                                at={row.leftAt ?? 0}
                                onSelect={select}
                                selected={selected?.side === 'L' && selected.n === row.left.oldN}
                              />
                            )}
                          </div>
                          <div data-side="right" className="min-w-0">
                            {row.right === null ? (
                              <div className="h-full" />
                            ) : (
                              <DiffRow
                                line={row.right}
                                n={row.right.newN}
                                side="R"
                                wrap
                                hunk={h}
                                at={row.rightAt ?? 0}
                                onSelect={select}
                                selected={selected?.side === 'R' && selected.n === row.right.newN}
                              />
                            )}
                          </div>
                        </div>
                        {row.left !== null && row.left.oldN !== null ? under(lineKey('L', row.left.oldN)) : null}
                        {row.right !== null && row.right.newN !== null ? under(lineKey('R', row.right.newN)) : null}
                      </Fragment>
                    ))}
              </div>
              );
            })}
            {hidden > 0 ? (
              <p className="flex items-center gap-2 px-[18px] py-2 font-sans text-control text-muted">
                {`${String(hidden)} more ${hidden === 1 ? 'line' : 'lines'}${hiddenThreads === 0 ? '' : `, with ${String(hiddenThreads)} review ${hiddenThreads === 1 ? 'thread' : 'threads'}`}`}
                <button type="button" onClick={() => setFull(true)} className="text-brand hover:underline">
                  Show full diff
                </button>
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-1 px-[18px] py-4 font-sans text-ui">
            <p className="text-muted">No diff to show</p>
            <ProblemLine problem={problem} onRetry={onRetry} className="" />
            <a href={`${prUrl}/files`} target="_blank" rel="noreferrer" className="text-control text-brand hover:underline">
              See it on GitHub
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
