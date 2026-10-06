import { ArrowsIn, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { NODE_H, NODE_W, type ChecksGraph, type EdgeState, type GraphNode } from '@/lib/checks-graph';
import { cn } from '@/lib/utils';

import { StateIcon } from '@features/pull-requests/components/state-icon';
import { useMeasuredWidth } from '@features/pull-requests/components/timeline-lane';

const EDGE: Record<EdgeState, string> = {
  ok: 'stroke-green-edge',
  bad: 'stroke-red-edge',
  wait: 'stroke-border [stroke-dasharray:3_5]',
  flow: 'stroke-green [stroke-dasharray:6_5]',
};

const NODE: Record<GraphNode['state'], string> = {
  passed: 'border-green-edge',
  failed: 'border-red bg-red-soft shadow-[0_0_18px_color-mix(in_srgb,var(--cc-red)_25%,transparent)]',
  running: 'border-green shadow-[0_0_0_3px_color-mix(in_srgb,var(--cc-green)_12%,transparent)]',
  waiting: 'border-dashed border-border',
  skipped: 'border-dashed border-border',
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
/** A wheel event's zoom, per pixel of delta; one event is held to ±10px, so a mouse notch is ~10%. */
const WHEEL_RATE = 0.01;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const ZOOM_BUTTON = 'grid size-7 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink aria-pressed:bg-hover aria-pressed:text-ink disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * The Checks graph (HIVE-206): a box per job at the layout's place, its
 * `needs` as edges in the state of their target, later workflows in a dashed
 * group. Edges into a running job flow unless motion is reduced; every state
 * still reads from colour, border and icon. It takes the stage's whole width;
 * a graph wider still scrolls, or zooms out: −, +, Fit (to the width), and the
 * percentage back to 100%. A trackpad pinch, or the wheel with ⌘ or Ctrl
 * held, zooms smoothly about the pointer.
 */
export function ChecksGraphView({ graph, onJob, onExpand }: { graph: ChecksGraph; onJob: (id: number) => void; onExpand: (defId: string) => void }) {
  const still = useReducedMotion();
  const [measure, viewport] = useMeasuredWidth();
  const scroller = useRef<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    measure(el);
    scroller.current = el;
  }, [measure]);
  const [zoom, setZoom] = useState<number | 'fit'>(1);
  // Unmeasured (happy-dom, the first frame) fits at 100%.
  const fit = viewport > 0 ? Math.min(1, viewport / graph.width) : 1;
  const scale = zoom === 'fit' ? fit : zoom;
  const step = (by: number) => setZoom(clampZoom(Math.round((scale + by) / ZOOM_STEP) * ZOOM_STEP));

  // The wheel handler is bound once; it reads the scale the last render drew.
  const drawn = useRef(scale);
  // The graph x under the pointer, and where the pointer sits in the scroller, to hold it there across the zoom.
  const anchor = useRef<{ x: number; at: number } | null>(null);
  useLayoutEffect(() => {
    drawn.current = scale;
    const el = scroller.current;
    if (anchor.current !== null && el !== null) el.scrollLeft = anchor.current.x * scale - anchor.current.at;
    anchor.current = null;
  }, [scale]);
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      // A pinch reaches the page as a wheel event with ctrlKey set; ⌘ or Ctrl and a mouse wheel read the same.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = Math.max(-10, Math.min(10, event.deltaY));
      // Fit can sit below the floor (a graph over 4x the viewport); zooming out there holds, it never snaps up.
      const next = Math.min(ZOOM_MAX, Math.max(Math.min(ZOOM_MIN, drawn.current), drawn.current * Math.exp(-delta * WHEEL_RATE)));
      // At a limit nothing redraws, so the layout effect would never clear an anchor set here.
      if (next === drawn.current) return;
      const at = event.clientX - el.getBoundingClientRect().left;
      anchor.current = { x: (el.scrollLeft + at) / drawn.current, at };
      setZoom(next);
    };
    // Not passive: preventDefault is what keeps the page itself from scrolling or zooming.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <div className="mx-6 mt-3">
      <div role="group" aria-label="Zoom" className="ml-auto flex w-fit items-center gap-0.5 rounded-full border border-border-soft bg-panel p-0.5">
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={scale <= ZOOM_MIN} onClick={() => step(-ZOOM_STEP)} className={ZOOM_BUTTON}>
          <MagnifyingGlassMinus size={14} aria-hidden />
        </button>
        <button type="button" aria-label="Reset zoom" title="Back to 100%" onClick={() => setZoom(1)} className="h-7 min-w-11 rounded-full px-1 tabular-nums text-ui-sm text-muted hover:bg-hover hover:text-ink">
          {`${String(Math.round(scale * 100))}%`}
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={scale >= ZOOM_MAX} onClick={() => step(ZOOM_STEP)} className={ZOOM_BUTTON}>
          <MagnifyingGlassPlus size={14} aria-hidden />
        </button>
        <button type="button" aria-label="Fit to width" title="Fit to width" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')} className={ZOOM_BUTTON}>
          <ArrowsIn size={14} aria-hidden />
        </button>
      </div>
      <div ref={ref} className="overflow-x-auto pt-2 pb-3">
        <div style={{ width: graph.width * scale, height: graph.height * scale }}>
          <div className="relative origin-top-left" style={{ width: graph.width, height: graph.height, transform: scale === 1 ? undefined : `scale(${String(scale)})` }}>
            {graph.groups.map((group) => (
              <div key={group.file} className="absolute rounded-2xl border border-dashed border-border" style={{ left: group.x, top: group.y, width: group.w, height: group.h }}>
                <span className="absolute -top-[9px] left-3 bg-bg px-1.5 tabular-nums text-micro text-subtle">{group.file}</span>
              </div>
            ))}
            <svg aria-hidden className="absolute inset-0 overflow-visible" width={graph.width} height={graph.height}>
              {graph.edges.map((edge) => (
                <path
                  key={edge.key}
                  d={edge.d}
                  data-state={edge.state}
                  className={cn('fill-none [stroke-width:1.6]', EDGE[edge.state], edge.state === 'flow' && !still && 'animate-ccflow')}
                />
              ))}
            </svg>
            {graph.nodes.map((node) => {
              const label = node.count > 1 ? `${node.label} × ${String(node.count)}` : node.label;
              /** Waiting and skipped dim the icon, and step the text down a token; opacity never touches text (HIVE-225). */
              const dim = node.state === 'waiting' || node.state === 'skipped';
              return (
                <button
                  key={node.key}
                  type="button"
                  data-state={node.state}
                  aria-label={`${label}, ${node.state}, ${node.time}`}
                  title={label}
                  onClick={() => {
                    if (node.matrix !== null) onExpand(node.matrix);
                    else if (node.jobId !== null) onJob(node.jobId);
                  }}
                  className={cn('absolute flex items-center gap-2.5 overflow-hidden rounded-xl border bg-panel px-3 text-left hover:bg-hover', NODE[node.state])}
                  style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                >
                  <span className={cn('grid shrink-0', dim && 'opacity-60')}><StateIcon state={node.state} /></span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <b className={cn('truncate tabular-nums text-control', dim ? 'text-muted' : 'text-ink')}>{label}</b>
                    <span className={cn('truncate tabular-nums text-micro', dim ? 'text-subtle' : 'text-muted')}>{node.time}</span>
                  </span>
                  {node.progress === null ? null : (
                    <span role="progressbar" aria-label={`${node.label} progress`} aria-valuenow={Math.round(node.progress * 100)} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-0 bottom-0 h-[3px] bg-border">
                      <span className="block h-full bg-green" style={{ width: `${String(node.progress * 100)}%` }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
