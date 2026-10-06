import { classifyLogLine, type LogTone } from '@/lib/checks-graph';
import { cn } from '@/lib/utils';

import { SkeletonBar } from '@features/shared/components/skeleton-bar';
import { SourceProblem } from '@features/shared/components/source-problem';
import type { PrLogEntry } from '@stores/hive-store';

const TONE: Record<LogTone, string> = { muted: 'text-muted', fail: 'text-red', plain: 'text-ink' };

/**
 * A failed job's log, cut to the failure in main (HIVE-206): passing lines
 * muted, the failure and its marked source line red, gh's prefixes gone.
 */
export function JobLog({ entry, onRetry }: { entry: PrLogEntry | undefined; onRetry: () => void }) {
  if (entry?.state === 'failed') return <div className="pt-3"><SourceProblem message={entry.problem ?? 'Could not read the log.'} onRetry={onRetry} /></div>;
  if (entry?.state !== 'ok' || entry.log === undefined) {
    return (
      <div role="status" aria-label="Loading the log" aria-busy className="mt-3 flex animate-pulse flex-col gap-2">
        <SkeletonBar className="w-[92%]" />
        <SkeletonBar className="w-[70%]" />
      </div>
    );
  }
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-border-soft bg-term-bg px-3.5 py-3 font-mono text-control leading-[1.55] whitespace-pre">
      {entry.log.truncated ? <span className="block text-muted">…</span> : null}
      {entry.log.lines.map((line, i) => {
        const tone = classifyLogLine(line);
        return (
          <span key={`${String(i)}:${line}`} data-tone={tone} className={cn('block', TONE[tone])}>{line === '' ? ' ' : line}</span>
        );
      })}
    </pre>
  );
}
