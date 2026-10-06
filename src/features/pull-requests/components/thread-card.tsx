import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@components/ui/button';
import { Markdown } from '@features/shared/components/markdown';
import type { GhResult, PrThread } from '@shared/github-contract';

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** The hunk's last lines with the new side's numbers; a removed line has none. */
export function hunkTail(hunk: string, count = 4): { n: number | null; text: string }[] {
  const [header = '', ...lines] = hunk.split('\n');
  let next = Number(HUNK_HEADER.exec(header)?.[1] ?? 0);
  const numbered = lines.map((text) => ({ n: text.startsWith('-') ? null : next++, text }));
  return numbered.slice(-count);
}

function Chip({ thread, fixerOnIt }: { thread: PrThread; fixerOnIt: boolean }) {
  const [text, tone] = thread.isResolved
    ? ['resolved', 'text-green bg-green-strong']
    : fixerOnIt
      ? ['fixer on it', 'text-amber-text bg-amber-strong']
      : ['open', 'text-muted bg-chip'];
  return <span className={cn('rounded-md px-[7px] py-0.5 tabular-nums text-micro font-semibold', tone)}>{text}</span>;
}

/** The thread's writes (HIVE-207); absent on a read-only page. */
export interface ThreadWrites {
  reply: (threadId: string, body: string) => Promise<GhResult<true>>;
  setResolved: (threadId: string, resolved: boolean) => Promise<GhResult<true>>;
}

/**
 * One review thread (HIVE-205): path:line, its state, the hunk's last lines,
 * the comment and the replies. Open the file, and Reply, Resolve and Unresolve
 * when `writes` is given (HIVE-207). Shared with HIVE-207's Files tab.
 */
export function ThreadCard({
  thread,
  fixerOnIt,
  onOpenFile,
  writes,
}: {
  thread: PrThread;
  /** The thread is open and the fixer holds the PR (D12). */
  fixerOnIt: boolean;
  /** Absent when the PR has no session or project to open it in (D19). */
  onOpenFile?: (path: string, line: number) => void;
  /** Absent on a read-only page, as a merged PR's is (D11). */
  writes?: ThreadWrites;
}) {
  const [first, ...replies] = thread.comments;
  const line = thread.line ?? thread.originalLine;
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const where = `${thread.path}${line === null ? '' : `:${String(line)}`}`;

  const settle = (result: GhResult<true>, onOk: () => void) => {
    setBusy(false);
    if (result.ok) onOk();
    else setProblem(result.error.message);
  };
  const post = () => {
    const body = draft.trim();
    if (writes === undefined || body === '') return;
    setBusy(true);
    setProblem(null);
    void writes.reply(thread.id, body).then((result) =>
      settle(result, () => {
        setDraft('');
        setReplying(false);
      }),
    );
  };
  const toggle = () => {
    if (writes === undefined) return;
    setBusy(true);
    setProblem(null);
    void writes.setResolved(thread.id, !thread.isResolved).then((result) => settle(result, () => undefined));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border-soft bg-panel text-control">
      <div className="flex items-center gap-2 border-b border-border-soft px-2.5 py-[7px] text-control">
        <span className="tabular-nums text-ink">
          <span>{thread.path}</span>
          {line === null ? null : <span className="text-muted">{`:${String(line)}`}</span>}
        </span>
        {thread.isOutdated ? <span className="text-micro text-subtle">outdated</span> : null}
        <span className="flex-1" />
        <Chip thread={thread} fixerOnIt={fixerOnIt} />
      </div>
      {first ? (
        <>
          <pre className="overflow-x-auto bg-term-bg px-2.5 py-2 font-mono text-control leading-[1.55] text-muted">
            {hunkTail(first.diffHunk).map((row, i) => (
              <div key={i}>
                <span className="inline-block w-[30px] text-subtle">{row.n ?? ''}</span>
                {row.text}
              </div>
            ))}
          </pre>
          <div className="px-2.5 pt-[9px] pb-1">
            <Markdown source={first.body} />
          </div>
        </>
      ) : null}
      {replies.map((reply) => (
        <div key={reply.url} className="flex gap-2 px-2.5 py-1.5 text-muted">
          <span className="font-semibold text-ink">{reply.author ?? 'ghost'}</span>
          <div className="min-w-0">
            <Markdown source={reply.body} />
          </div>
        </div>
      ))}
      {writes !== undefined || (onOpenFile !== undefined && line !== null) ? (
        <div className="flex gap-3.5 px-2.5 pt-1.5 pb-[9px] text-control">
          {writes === undefined ? null : (
            <>
              <button type="button" onClick={() => setReplying(true)} className="text-brand hover:underline">
                Reply
              </button>
              <Button
                variant="ghost"
                onClick={toggle}
                pending={busy}
                className="rounded-none border-0 p-0 text-[length:inherit] leading-normal text-brand hover:bg-transparent hover:text-brand hover:underline aria-disabled:text-subtle"
              >
                {thread.isResolved ? 'Unresolve' : 'Resolve'}
              </Button>
            </>
          )}
          {onOpenFile !== undefined && line !== null ? (
            <button type="button" onClick={() => onOpenFile(thread.path, line)} className="text-brand hover:underline">
              Open the file
            </button>
          ) : null}
        </div>
      ) : null}
      {replying ? (
        <div className="flex flex-col gap-2 border border-transparent border-t-border-soft px-2.5 py-2 focus-within:border-brand">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Reply to ${where}`}
            className="resize-y bg-transparent text-control text-ink outline-none placeholder:text-subtle"
            placeholder="Reply…"
          />
          <div className="flex justify-end gap-2 text-control">
            <button type="button" onClick={() => setReplying(false)} className="text-muted hover:underline">
              Cancel
            </button>
            <Button
              variant="primary"
              onClick={post}
              disabled={draft.trim() === ''}
              pending={busy}
              aria-label="Post reply"
            >
              {busy ? 'Posting…' : 'Reply'}
            </Button>
          </div>
        </div>
      ) : null}
      {/* Always mounted: a live region that mounts with its text is not reliably announced (HIVE-225). */}
      <div role="status">
        {problem === null ? null : <p className="px-2.5 pb-2 text-control text-amber-text">{problem}</p>}
      </div>
    </div>
  );
}
