import { ChatCircle, Check, Folder } from '@phosphor-icons/react';
import { useMemo } from 'react';

import { baseName, filesSummary, fileTree, threadMark } from '@/lib/pr-files';
import { cn } from '@/lib/utils';

import type { PrDetail } from '@shared/github-contract';
import { usePrFileFilter, usePrPageActions } from '@stores/ui-store';

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * The Files tab's tree (HIVE-207): "Filter files", the summary, folders by
 * their compressed path, and a row per file with its thread mark, its viewed
 * state (GitHub's; "changed" when pushed to since) and +/−.
 */
export function PrFileTree({ detail, selected, onSelect }: { detail: PrDetail; selected: string | null; onSelect: (path: string) => void }) {
  const filter = usePrFileFilter();
  const { setPrFileFilter } = usePrPageActions();
  const tree = useMemo(() => fileTree(detail.files, filter), [detail.files, filter]);
  const sum = filesSummary(detail.files, detail.changedFiles, detail.threads);

  return (
    <aside aria-label="Changed files" className="flex w-[200px] shrink-0 flex-col gap-px @min-[640px]:w-[250px] overflow-y-auto border-r border-border-soft p-2.5 text-control">
      <input
        type="text"
        aria-label="Filter files"
        placeholder="Filter files"
        value={filter}
        onChange={(event) => setPrFileFilter(event.target.value)}
        className="mb-1 rounded-lg border border-border-soft bg-transparent px-2.5 py-1.5 text-control text-ink outline-none placeholder:text-subtle focus:border-brand"
      />
      <p className="px-1.5 pt-1 pb-2 text-ui-sm text-muted">
        {`${plural(sum.files, 'file', 'files')} · ${plural(sum.openThreads, 'open thread', 'open threads')} · viewed ${String(sum.viewed)} of ${String(sum.files)}`}
        {detail.changedFiles > detail.files.length ? (
          <>
            {' · '}
            <a href={`${detail.url}/files`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {`showing ${String(detail.files.length)} · all on GitHub`}
            </a>
          </>
        ) : null}
      </p>
      {tree.length === 0 && filter !== '' ? <p className="px-1.5 py-2 text-muted">No file matches.</p> : null}
      {tree.map((group) => (
        <div key={group.dir} className="flex flex-col gap-px">
          {group.dir === '' ? null : (
            <div className="flex items-center gap-2 px-1.5 py-[5px] text-muted">
              <Folder size={13} aria-hidden className="text-subtle" />
              <span className="tabular-nums">{group.dir}</span>
            </div>
          )}
          {group.files.map((file) => {
            const mark = threadMark(file.path, detail.threads);
            return (
              <button
                key={file.path}
                type="button"
                aria-current={file.path === selected ? 'true' : undefined}
                onClick={() => onSelect(file.path)}
                className={cn(
                  'flex items-center gap-2 rounded-md py-[5px] pr-1.5 text-left hover:bg-hover',
                  group.dir === '' ? 'pl-1.5' : 'pl-[22px]',
                  file.path === selected && 'bg-panel-2',
                )}
              >
                <span className="truncate tabular-nums text-ink">{baseName(file.path)}</span>
                <span className="flex-1" />
                {mark === null ? null : (
                  <ChatCircle
                    size={12}
                    aria-label={mark === 'open' ? 'open thread' : 'resolved threads'}
                    className={mark === 'open' ? 'text-amber-text' : 'text-green'}
                  />
                )}
                {file.viewed === 'viewed' ? <Check size={11} aria-label="viewed" className="text-subtle" /> : null}
                {file.viewed === 'dismissed' ? <span className="text-micro text-amber-text">changed</span> : null}
                <span className="tabular-nums text-micro whitespace-nowrap text-muted">
                  {file.deletions === 0 ? `+${String(file.additions)}` : `+${String(file.additions)} −${String(file.deletions)}`}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
