import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { cellLabel, cellText, type CellText } from '@features/home/cell-text';
import { type CanvasPaint, useCanvasLoop } from '@hooks/use-canvas-loop';
import { useReducedMotion } from '@hooks/use-reduced-motion';
import {
  ALL_PROJECTS, type CellState, type CombCell, COMB_W, type CombInput, drawComb,
  type Flyer, flyerCount, hitTest, isCalm, layoutComb, stepFlyers, stillFlyers, SWARM, syncFlyers,
} from '@lib/swarm/comb';
import { useSwarmPalette } from '@stores/appearance-store';
import { type CombEntity, useCombEntities, useOpenEntity, useProjects } from '@stores/hive-store';
import { useSelectPlace, useSetSessionsProject } from '@stores/ui-store';

export const toCombInput = (e: CombEntity): CombInput => ({
  id: e.id, name: e.name, project: e.project, state: e.state,
  progress: e.total ? (e.done ?? 0) / e.total : undefined,
});

/** The tooltip's left edge in px: beside the cell, never past the canvas's right edge (its 240px max width and 8px spare). */
export const tooltipLeft = (x: number, k: number): number => Math.min((x + 18) * k, COMB_W * k - 248);

const WORD_CLASS: Record<CellState, string> = {
  morphing: 'text-green', summons: 'text-amber-text', failed: 'text-red', burrowed: 'text-subtle', terminal: 'text-muted',
};

function CombTooltip({ text, left, top }: { text: CellText; left: number; top: number }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 grid max-w-[240px] gap-0.5 rounded-lg border border-border bg-panel-2 px-2.5 py-2 text-control text-ink shadow-lg"
      style={{ left, top }}
    >
      <b>{text.title}</b>
      {text.word && text.state ? (
        <span className={WORD_CLASS[text.state]}>{`${text.word} · ${text.context}`}</span>
      ) : null}
      <span className={text.word ? undefined : 'text-muted'}>{text.line}</span>
    </div>
  );
}

/** Under reduced motion the comb holds the frame after four seconds of flight. */
const STILL_T = 4;

/**
 * The comb's canvas host (HIVE-199).
 *
 * The loop is {@link useCanvasLoop}'s: it runs only while the canvas is on
 * screen, the document is visible and Home is mounted, and a session changing
 * state or a theme switch reaches the next frame without restarting anything.
 * Under reduced motion there is no loop at all: one still frame, the flyers
 * placed as after four seconds of flight, redrawn when the data or the
 * palette changes.
 */
export function TheComb({ label }: { label: string }) {
  const entities = useCombEntities();
  const projects = useProjects();
  const palette = useSwarmPalette();
  const reduced = useReducedMotion();

  const layout = useMemo(
    () => layoutComb(entities.map(toCombInput), projects.map(({ id, name }) => ({ id, name }))),
    [entities, projects],
  );
  const needs = useMemo(() => entities.filter((e) => e.state === 'summons').length, [entities]);

  const openEntity = useOpenEntity();
  const selectPlace = useSelectPlace();
  const setSessionsProject = useSetSessionsProject();
  const [hover, setHover] = useState<{ cell: CombCell; k: number } | null>(null);
  /**
   * Hover a cell, or nothing, committing only when that changes. The pointer
   * reports every pixel and the hidden list re-runs `cellText` for every cell on
   * each render, so a move inside one cell must cost nothing. Identity, not id:
   * a new layout makes new cells whose `x`/`y` the tooltip needs. The check
   * against the rendered `hover` comes first because an updater that returns
   * `prev` still costs React one render right after a change; the updater's own
   * check covers a move that lands before that render.
   */
  const hoverOn = (cell: CombCell | null, k: number) => {
    const same = (h: typeof hover) => (h === null ? cell === null : h.cell === cell && h.k === k);
    if (same(hover)) return;
    setHover((prev) => (same(prev) ? prev : cell ? { cell, k } : null));
  };
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const projectName = useCallback(
    (id: string) => projects.find((p) => p.id === id)?.name ?? id,
    [projects],
  );

  /** A cell opens what it stands for: the session or agent, or the list it folds (decisions D6, D7). */
  const activate = (cell: CombCell): void => {
    if (cell.kind === 'entity') {
      openEntity(cell.id);
    } else if (cell.project === SWARM) {
      selectPlace('agents');
    } else {
      // A project's cell is its list, so the Overmind rather than the last session.
      setSessionsProject(cell.project === ALL_PROJECTS ? null : cell.project);
      selectPlace('sessions', true);
    }
  };

  /** The cell under the pointer, in logical units, and the CSS-px-per-unit scale. */
  const pick = (event: MouseEvent<HTMLCanvasElement>): { cell: CombCell | null; k: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    const k = rect.width / COMB_W;
    if (k <= 0) return { cell: null, k };
    return { cell: hitTest(layout, (event.clientX - rect.left) / k, (event.clientY - rect.top) / k), k };
  };

  const now = Date.now();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The canvas's CSS-px-per-unit scale, for a tooltip placed without a pointer. */
  const scale = (): number => (canvasRef.current?.getBoundingClientRect().width ?? 0) / COMB_W;
  const flock = useRef<Flyer[]>([]);
  const still = useMemo(() => (reduced ? stillFlyers(layout, needs) : null), [reduced, layout, needs]);

  const paint = useCallback<CanvasPaint>(
    (ctx, t, dt, { w, dpr }) => {
      let flyers = still;
      if (!flyers) {
        const synced = syncFlyers(flock.current, flyerCount(layout, needs), Math.random);
        flyers = stepFlyers(synced, layout, dt, Math.random, isCalm(layout, needs));
        flock.current = flyers;
      }
      const k = (w * dpr) / COMB_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawComb(ctx, layout, flyers, t, palette, k, focusedId);
    },
    [layout, needs, palette, still, focusedId],
  );
  useCanvasLoop(canvasRef, paint, { still: reduced ? STILL_T : null });

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={cn('block aspect-[1376/520] w-full', hover && 'cursor-pointer')}
        onMouseMove={(event) => {
          const { cell, k } = pick(event);
          hoverOn(cell, k);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          const { cell } = pick(event);
          if (cell) activate(cell);
        }}
      />
      {hover ? (
        <CombTooltip
          text={cellText(hover.cell, byId.get(hover.cell.id), projectName, now)}
          left={tooltipLeft(hover.cell.x, hover.k)}
          top={Math.max(0, hover.cell.y - 10) * hover.k}
        />
      ) : null}
      <ul className="sr-only" aria-label="The comb's cells">
        {layout.cells.map((cell) => (
          <li key={cell.id}>
            <button
              type="button"
              onClick={() => activate(cell)}
              onFocus={() => {
                setFocusedId(cell.id);
                hoverOn(cell, scale());
              }}
              onBlur={() => {
                setFocusedId(null);
                setHover(null);
              }}
            >
              {cellLabel(cellText(cell, byId.get(cell.id), projectName, now))}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
