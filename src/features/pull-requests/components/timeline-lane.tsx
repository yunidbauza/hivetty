import { useLayoutEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export interface LaneMark {
  key: string;
  /** 0..1 on the axis. */
  from: number;
  /** For a span; absent for a point mark. */
  to?: number;
  shape: 'flap' | 'commit' | 'ci' | 'review' | 'comment' | 'hold';
  /** Utility classes for the mark's colour: from a fixed table in this file, never built from data. */
  tone: string;
  /**
   * Drawn inside a span only when it fits; beside a point mark only when it
   * fits before the next one. Either way the tooltip still says it.
   */
  word?: string;
  /** Tooltip lines: the first bold. Also the accessible name. */
  tip: string[];
  onOpen: () => void;
}

/** The label column every lane, the axis and the now line share. */
export const GUTTER = 130;

const SHAPE: Record<LaneMark['shape'], string> = {
  flap: 'h-[22px] top-[9px] rounded-md tabular-nums text-micro font-bold tracking-[0.08em]',
  commit: 'size-[10px] -ml-[5px] top-[21px] rounded-full border-2 border-brand bg-bg',
  ci: 'h-3 top-5 rounded',
  review: 'size-3 -ml-1.5 top-[19px] rotate-45',
  comment: 'w-3 h-[11px] -ml-1.5 top-[19px] rounded rounded-bl-none bg-brand',
  hold: 'h-5 top-4 rounded-full border tabular-nums text-micro',
};

/** Where `f` sits on the axis, past the label column. */
export const axisLeft = (f: number) => `calc(${String(GUTTER)}px + (100% - ${String(GUTTER)}px) * ${String(f)})`;

/**
 * An element's width, measured when it mounts and on every resize; 0 until
 * measured (and under happy-dom). Returns the callback ref to hang on the
 * element, so an element that mounts late is still measured.
 */
export function useMeasuredWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (el === null) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width];
}

/**
 * One Timeline lane (HIVE-208): its label, its marks as buttons on the axis,
 * and one tooltip shown on hover or focus. Enter on a mark is a native click.
 */
export function TimelineLane({ label, marks, height = 52 }: { label: string; marks: LaneMark[]; height?: 40 | 52 }) {
  const [ref, measured] = useMeasuredWidth();
  const laneWidth = Math.max(0, measured - GUTTER);
  const [hover, setHover] = useState<{ key: string; tip: string[]; left: string; from: number } | null>(null);
  // Where each point's word has to end: the next mark along, or the lane's end.
  const starts = marks.map((m) => m.from).sort((a, b) => a - b);
  const room = (from: number) => ((starts.find((s) => s > from) ?? 1) - from) * laneWidth;

  return (
    <div ref={ref} className={cn('relative border-b border-border-soft', height === 40 ? 'h-10' : 'h-[52px]')}>
      <span className="absolute inset-y-0 left-0 flex w-[130px] items-center text-control text-muted">{label}</span>
      {marks.map((mark) => {
        const span = mark.to !== undefined;
        const left = axisLeft(mark.from);
        const fits =
          span && mark.word !== undefined && ((mark.to ?? mark.from) - mark.from) * laneWidth >= mark.word.length * 7 + 16;
        const show = () => setHover({ key: mark.key, tip: mark.tip, left, from: mark.from });
        const hide = () => setHover(null);
        return [
          <button
            key={mark.key}
            type="button"
            aria-label={mark.tip.join(', ')}
            data-word={mark.word}
            onClick={mark.onOpen}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
            className={cn(
              'absolute flex items-center justify-center overflow-hidden whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand',
              SHAPE[mark.shape],
              mark.tone,
            )}
            style={{
              left,
              width: span ? `calc((100% - ${String(GUTTER)}px) * ${String((mark.to ?? mark.from) - mark.from)} - 2px)` : undefined,
            }}
          >
            {fits ? mark.word : null}
          </button>,
          !span && mark.word !== undefined && room(mark.from) >= mark.word.length * 6.5 + 14 ? (
            <span
              key={`${mark.key}-word`}
              aria-hidden
              className="pointer-events-none absolute top-[17px] ml-2.5 tabular-nums text-micro whitespace-nowrap text-muted"
              style={{ left }}
            >
              {mark.word}
            </span>
          ) : null,
        ];
      })}
      {/*
        Below the lane, never above: the first lane (the flap band) sits at the
        top of the stage's scroller, which clips anything above it under the
        ship track. A mark in the right half anchors the tip's right edge, so
        it does not run off the stage's side either.
      */}
      {hover === null ? null : (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute top-full z-10 -mt-2 flex flex-col gap-0.5 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-ui-sm whitespace-nowrap text-muted shadow-lg',
            hover.from > 0.5 && '-translate-x-full',
          )}
          style={{ left: hover.left }}
        >
          {hover.tip.map((line, i) => (
            <span key={`${hover.key}-${String(i)}`} className={i === 0 ? 'font-semibold text-ink' : undefined}>
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
