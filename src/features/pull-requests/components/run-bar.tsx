import { FlowArrow } from '@phosphor-icons/react';

import { useRelativeTime } from '@/hooks/use-relative-time';
import type { Push } from '@/lib/checks-graph';
import { cn } from '@/lib/utils';

const SQUARE: Record<Push['state'], string> = {
  passed: 'bg-green opacity-75',
  failed: 'bg-red',
  running: 'border-[1.5px] border-green bg-transparent',
};

/**
 * The Checks tab's run bar (HIVE-206): the shown run, its commit and age, the
 * last eight pushes as squares (oldest left; a click shows that push), and a
 * chip per workflow file in the graph. "fixer's push" waits on a source (D15).
 */
export function RunBar({ pushes, shown, files, onShow }: { pushes: Push[]; shown: Push; files: string[]; onShow: (sha: string) => void }) {
  const age = useRelativeTime(Date.parse(shown.startedAt));
  // useRelativeTime spells "4m" or "now"; the bar reads it as a sentence.
  const started = age === 'now' ? 'just now' : `${age} ago`;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-soft px-6 py-3 text-control">
      <span className="tabular-nums text-ink">{`Run #${String(shown.number)}`}</span>
      <span className="min-w-0 truncate text-muted">{`on ${shown.sha.slice(0, 7)} · started ${started}`}</span>
      <span className="flex gap-[3px]">
        {pushes.map((push) => (
          <button
            key={push.sha}
            type="button"
            data-state={push.state}
            aria-pressed={push.sha === shown.sha}
            aria-label={`Run #${String(push.number)}, ${push.state}, ${push.sha.slice(0, 7)}`}
            onClick={() => onShow(push.sha)}
            className={cn('h-[14px] w-[9px] rounded-xs', SQUARE[push.state], push.sha === shown.sha && 'outline outline-1 outline-offset-1 outline-ink')}
          />
        ))}
      </span>
      <span className="text-muted">last 8 runs</span>
      <span className="flex-1" />
      {files.map((file) => (
        <span key={file} className="flex items-center gap-[5px] tabular-nums text-control text-muted">
          <FlowArrow size={13} aria-hidden />
          {file}
        </span>
      ))}
    </div>
  );
}
