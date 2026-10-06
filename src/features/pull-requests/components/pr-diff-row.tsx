import { memo } from 'react';

import type { DiffLine } from '@/lib/unified-diff';
import { cn } from '@/lib/utils';

export type DiffSide = 'L' | 'R';
/** One callback for every row of a file: the row says where it is. */
export type SelectLine = (side: DiffSide, hunk: number, at: number) => void;

export interface DiffRowProps {
  line: DiffLine;
  n: number | null;
  side: DiffSide;
  selected: boolean;
  /** The hunk's index in the file, and the line's in the hunk. */
  hunk: number;
  at: number;
  onSelect: SelectLine;
  /** Split's: a half-width column wraps a long line instead of running into its neighbour. */
  wrap?: boolean;
}

const WASH: Record<DiffLine['kind'], string> = {
  add: 'bg-green-soft',
  del: 'bg-red-soft',
  context: '',
};
const SIGN: Record<DiffLine['kind'], { text: string; tone: string }> = {
  add: { text: '+', tone: 'text-green' },
  del: { text: '−', tone: 'text-red' },
  context: { text: '', tone: 'text-subtle' },
};

/** One diff row: a 46px number gutter (a button, selecting the line), a 16px sign, the text. */
export function DiffRowView({ line, n, side, selected, hunk, at, onSelect, wrap = false }: DiffRowProps) {
  const sign = SIGN[line.kind];
  return (
    <div data-kind={line.kind} className={cn('flex h-full pr-4 font-mono', wrap ? 'whitespace-pre-wrap' : 'whitespace-pre', WASH[line.kind], selected && 'shadow-[inset_2px_0_var(--cc-amber)]')}>
      {n === null ? (
        <span className="w-[46px] shrink-0" />
      ) : (
        <button type="button" aria-label={`${side === 'L' ? 'Old line' : 'Line'} ${String(n)}`} onClick={() => onSelect(side, hunk, at)} className="w-[46px] shrink-0 pr-2.5 text-right text-subtle hover:text-ink">
          {n}
        </button>
      )}
      <span className={cn('w-4 shrink-0', sign.tone)}>{sign.text}</span>
      <span className={cn('text-ink', wrap && 'min-w-0 wrap-anywhere')}>{line.text === '' ? ' ' : line.text}</span>
    </div>
  );
}

/**
 * Memoized, so a selection change re-renders the two rows whose `selected`
 * flipped and no other. That holds only while every prop is a primitive or
 * stable, which is why the position travels as numbers rather than as a closure.
 */
export const DiffRow = memo(DiffRowView);
