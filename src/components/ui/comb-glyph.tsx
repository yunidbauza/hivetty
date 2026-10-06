import type { Icon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';

import { useReducedMotion } from '@hooks/use-reduced-motion';

/** A pointy-top hexagon of radius `r` around (`cx`, `cy`), as SVG points. */
const hex = (r: number, cx = 0, cy = 0): string =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const CELL = hex(40);
const ICON = 38;

const wall: CSSProperties = {
  fill: 'var(--cc-shell)',
  stroke: 'color-mix(in srgb, var(--cc-chitin) 45%, var(--cc-shell))',
  strokeWidth: 1.4,
  strokeLinejoin: 'round',
};
const dim: CSSProperties = {
  ...wall,
  fill: 'color-mix(in srgb, var(--cc-shell) 60%, var(--cc-bg))',
  stroke: 'color-mix(in srgb, var(--cc-chitin) 22%, var(--cc-bg))',
};
// Rim and failure rest at opacity 0, so a still frame is the dark cell.
const ring = (stroke: string, strokeWidth: number): CSSProperties => ({
  fill: 'none',
  stroke,
  strokeWidth,
  strokeLinecap: 'round',
  opacity: 0,
});

/**
 * A place with nothing wired yet (Jira, agents, GitHub): its icon in the middle
 * of three comb cells. Over one 9s loop the middle cell's rim lights green
 * round its edge as if coming online, stalls two thirds of the way, sputters
 * red twice and goes dark (proposal D, "The cell that won't light").
 *
 * SVG and CSS keyframes from tokens alone, as the Hatchery's egg is. Under
 * reduced motion it drops every animation class and holds the dark cell.
 */
export function CombGlyph({ icon: Glyph }: { icon: Icon }) {
  const still = useReducedMotion();
  const anim = (name: string): string | undefined => (still ? undefined : name);

  return (
    <svg
      data-glyph="comb"
      viewBox="-130 -66 260 132"
      width={260}
      height={132}
      aria-hidden
      className="block h-auto max-w-full overflow-visible"
    >
      <polygon data-cell points={hex(28, -74, 14)} style={dim} />
      <polygon data-cell points={hex(28, 74, 14)} style={{ ...dim, fill: 'none', strokeDasharray: '3 3' }} />
      <polygon data-cell points={CELL} style={wall} />
      <polygon
        data-part="rim"
        points={CELL}
        pathLength={100}
        className={anim('animate-cccombrim')}
        style={ring('var(--cc-green)', 2)}
      />
      <polygon
        data-part="fail"
        points={CELL}
        pathLength={100}
        className={anim('animate-cccombfail')}
        style={{ ...ring('var(--cc-red)', 2.2), strokeDasharray: '68 100' }}
      />
      <g data-part="icon" className={anim('animate-cccombicon')} transform={`translate(${-ICON / 2} ${-ICON / 2})`}>
        <Glyph size={ICON} />
      </g>
    </svg>
  );
}
