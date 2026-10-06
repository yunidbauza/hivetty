import { useLayoutEffect, useState, type RefObject } from 'react';

import { SplitHandle } from '@components/ui/split-handle';
import { PANEL_WIDTHS, STAGE_MIN, type PanelRail } from '@stores/appearance-store';

/** The handle is `w-3`. */
const HANDLE = 12;
/** Half the handle's `w-3`: the ratio is the seam's centre, the stored width stops at its near edge. */
const HALF_HANDLE = HANDLE / 2;

interface Geometry {
  row: number;
  /** The rail as drawn, which flexbox may have pulled in under its saved width; null with no stage to measure from. */
  drawn: number | null;
  /** How far the stage could still give before {@link STAGE_MIN}. */
  slack: number;
}

interface RailHandleProps {
  /** The row the rails and the stage share: the handle's ratio is measured against it. */
  rowRef: RefObject<HTMLElement | null>;
  /** `list` sits on the row's left edge, `session` on its right. */
  rail: PanelRail;
  label: string;
  width: number;
  onWidth: (px: number) => void;
}

/**
 * The seam between a rail and the stage: the overmind's gutter-with-a-grip,
 * stood on its side. The store keeps pixels and `SplitHandle` speaks ratios of
 * its container, so this converts both ways against the row's width.
 */
export function RailHandle({ rowRef, rail, label, width, onWidth }: RailHandleProps) {
  // The observer stub in `tests/setup.ts` never calls back, so a unit test sees 0 and the slider's own 0–1 bounds.
  const [geo, setGeo] = useState<Geometry>({ row: 0, drawn: null, slack: Infinity });
  const left = rail === 'list';

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row === null || typeof ResizeObserver === 'undefined') return undefined;
    // CenterStage's root is the row's one <main>: its edges are where each rail is actually drawn to (HIVE-223).
    const stage = row.querySelector<HTMLElement>(':scope > main');
    const measure = () => {
      const r = row.getBoundingClientRect();
      const s = stage?.getBoundingClientRect();
      setGeo({
        row: r.width,
        drawn: s === undefined ? null : left ? s.left - r.left - HANDLE : r.right - s.right - HANDLE,
        slack: s === undefined ? Infinity : Math.max(0, s.width - STAGE_MIN),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    // The stage moves when either rail does, so watching it keeps one handle current while the other is dragged.
    if (stage) observer.observe(stage);
    return () => {
      observer.disconnect();
    };
    // `width` too: a write re-measures even before the observer reports (spec B2).
  }, [rowRef, left, width]);

  const rowWidth = geo.row;
  const shown = geo.drawn ?? width;
  // The session rail grows leftwards, so its ratio runs the other way.
  const toRatio = (px: number) => (left ? px + HALF_HANDLE : rowWidth - px - HALF_HANDLE) / rowWidth;
  const { min, max: limit, initial } = PANEL_WIDTHS[rail];
  // Never past the stage's floor: a rail that grew into it would only make flexbox squeeze the other one.
  const max = Math.max(min, Math.min(limit, shown + geo.slack));
  const bounds = rowWidth > 0 ? { min: toRatio(left ? min : max), max: toRatio(left ? max : min) } : {};

  return (
    <SplitHandle
      axis="vertical"
      grip
      className="w-3 bg-bg"
      containerRef={rowRef}
      label={label}
      value={rowWidth > 0 ? toRatio(shown) : 0}
      onValue={(ratio) => {
        // The live width, not the measured state: a drag's ratio is against the rect it read at pointerdown.
        const row = rowRef.current?.getBoundingClientRect().width ?? 0;
        if (row > 0) onWidth((left ? ratio * row : (1 - ratio) * row) - HALF_HANDLE);
      }}
      {...bounds}
      onReset={() => onWidth(initial)}
    />
  );
}
