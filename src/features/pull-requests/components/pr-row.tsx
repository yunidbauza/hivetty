import { GitPullRequest } from '@phosphor-icons/react';
import { memo } from 'react';

import { cn } from '@/lib/utils';
import type { HatcheryRow } from '@/types/pull-request';

import { Flap } from '@features/pull-requests/components/flap';
import { FLAP_TEXT } from '@features/shared/flap-tone';

interface PrRowProps {
  row: HatcheryRow;
  /** The PR the page shows. */
  open: boolean;
  onOpen: (row: HatcheryRow) => void;
}

const DRAFT_FLAPS = new Set(['LARVA', 'COCOONING']);

function Row({ row, open, onOpen }: PrRowProps) {
  const { pr, hatch } = row;
  const draft = DRAFT_FLAPS.has(hatch.flap);

  return (
    <button
      type="button"
      aria-current={open ? 'true' : undefined}
      aria-label={`#${String(pr.n)} ${pr.title}, ${hatch.flap}: ${hatch.github}`}
      title={hatch.github}
      onClick={() => onOpen(row)}
      className={cn(
        'flex w-full min-w-0 gap-2.5 rounded-lg px-2 py-[9px] text-left focus-visible:outline-2 focus-visible:outline-brand',
        open ? 'bg-active' : 'hover:bg-hover',
      )}
    >
      {/* Phosphor has no draft-PR glyph; the light weight stands in (R1). */}
      <GitPullRequest
        size={16}
        weight={draft ? 'light' : 'regular'}
        data-glyph={draft ? 'draft' : 'pr'}
        aria-hidden
        className={cn('mt-0.5 shrink-0', FLAP_TEXT[hatch.tone])}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1 truncate text-ui text-ink">{pr.title}</span>
          <Flap hatch={hatch} />
        </span>
        <span className="truncate tabular-nums text-ui-sm text-muted">
          #{pr.n} · {pr.repo}
        </span>
      </span>
    </button>
  );
}

/**
 * What the row draws, compared by value. `useHatchery()` rebuilds its rows on
 * every ledger append; a row whose PR the append did not name keeps its DOM.
 */
const sameRow = (a: PrRowProps, b: PrRowProps): boolean =>
  a.open === b.open &&
  a.onOpen === b.onOpen &&
  a.row.pr.url === b.row.pr.url &&
  a.row.pr.title === b.row.pr.title &&
  a.row.pr.repo === b.row.pr.repo &&
  a.row.hatch.flap === b.row.hatch.flap &&
  a.row.hatch.at === b.row.hatch.at &&
  a.row.hatch.tone === b.row.hatch.tone &&
  a.row.hatch.github === b.row.hatch.github;

/** One Hatchery row (HIVE-205): two lines, no box. */
export const PrRow = memo(Row, sameRow);
