
import { ICON_PATHS, type IconName } from '@features/whats-new/piece-icons';
import type { PieceKind } from '@features/whats-new/releases';
import type { SwarmPalette } from '@lib/swarm/palette';

/**
 * The What's new corner pieces (1.0): three short loops made of comb cells, one
 * per slide, drawn from the theme's swarm palette so every theme gets its own.
 * None of the Brood creatures appear; the hexagon is the app's unit.
 *
 * Each is a pure drawing of `t` seconds into its loop on a `w`×`h` box; the
 * dialog clocks them with `useCanvasLoop` and, under reduced motion, paints
 * `rest` once.
 */
export interface Piece {
  dur: number;
  rest: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, C: SwarmPalette) => void;
}

const S3 = Math.sqrt(3);
const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const ease = (v: number): number => {
  const c = clamp(v);
  return c * c * (3 - 2 * c);
};
/** 0 before `a`, 1 after `b`, eased between. */
const seg = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
const alpha = (c: string, a: number): string => `color-mix(in srgb, ${c} ${String(Math.round(clamp(a) * 100))}%, transparent)`;
const tint = (c: string, pct: number, over: string): string => `color-mix(in srgb, ${c} ${String(Math.round(pct))}%, ${over})`;

function hex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 90);
    if (k === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

/** A cell's dashed ghost: room the comb has not grown into. */
function ghost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, C: SwarmPalette, a: number): void {
  hex(ctx, x, y, r);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = alpha(C.subtle, a);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const paths = new Map<IconName, Path2D>();
/** An icon from {@link ICON_PATHS}, `size` wide, centred on (x, y). Skipped where there is no `Path2D`. */
function glyph(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, colour: string): void {
  if (typeof Path2D === 'undefined') return;
  let path = paths.get(name);
  if (path === undefined) {
    path = new Path2D(ICON_PATHS[name]);
    paths.set(name, path);
  }
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = colour;
  ctx.fill(path);
  ctx.restore();
}

/** Who lives in each comb cell: sessions, and the agents in the icons chosen for them. */
const COMB_CELLS: readonly (readonly [number, number, IconName])[] = [
  [0, 0, 'TerminalWindow'],
  [1, 0, 'GitBranch'],
  [0, 1, 'TerminalWindow'],
  [-1, 1, 'TerminalWindow'],
  [-1, 0, 'Binoculars'],
  [0, -1, 'TerminalWindow'],
  [1, -1, 'PaperPlaneTilt'],
  [2, -1, 'Bug'],
  [1, 1, 'TerminalWindow'],
  [-2, 1, 'Robot'],
];
/** The session that needs you, then is answered. */
const NEEDS_YOU = 3;

/** Home: the comb fills cell by cell; one session glows amber until it is answered. 6.4s. */
const comb: Piece = {
  dur: 6.4,
  rest: 4.1,
  draw(ctx, w, h, t, C) {
    const r = Math.min(w / 8.2, h / 6.2);
    const cx = w * 0.56;
    const cy = h * 0.5;
    const fade = 1 - seg(t, 5.7, 6.35);
    COMB_CELLS.forEach(([q, rr, icon], i) => {
      const x = cx + r * S3 * (q + rr / 2);
      const y = cy + r * 1.5 * rr;
      ghost(ctx, x, y, r * 0.93, C, 0.45);
      const on = seg(t, 0.25 + i * 0.2, 0.55 + i * 0.2) * fade;
      if (on <= 0.01) return;
      const need = i === NEEDS_YOU ? seg(t, 2.9, 3.2) * (1 - seg(t, 4.3, 4.6)) : 0;
      hex(ctx, x, y, r * 0.93 * (0.6 + 0.4 * on));
      ctx.globalAlpha = on;
      ctx.fillStyle = need > 0.02 ? tint(C.amber, 22 * need, C.panel2) : C.panel2;
      ctx.fill();
      ctx.strokeStyle = need > 0.02 ? C.amber : alpha(C.chitin, 0.55);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (need > 0.02) {
        const p = (t * 1.6) % 1;
        hex(ctx, x, y, r * (0.95 + 0.35 * p));
        ctx.strokeStyle = alpha(C.amber, 0.6 * need * (1 - p));
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const answered = i === NEEDS_YOU ? seg(t, 4.4, 4.7) * (1 - seg(t, 4.9, 5.5)) : 0;
      if (answered > 0.01) {
        hex(ctx, x, y, r * 0.93);
        ctx.fillStyle = alpha(C.green, 0.35 * answered);
        ctx.fill();
      }
      const agent = icon !== 'TerminalWindow';
      glyph(ctx, icon, x, y, r * 0.86, need > 0.02 ? C.amber : agent ? C.chitin : C.green);
      ctx.globalAlpha = 1;
    });
  },
};

/** Work: a ticket moves To do → In progress (a session at work) → Done. 7s. */
const ticket: Piece = {
  dur: 7,
  rest: 5.6,
  draw(ctx, w, h, t, C) {
    const r = Math.min(w / 8.4, h / 4.6);
    const cy = h * 0.52;
    const xs = [w * 0.22, w * 0.5, w * 0.78] as const;
    for (const [q, rr] of [
      [-0.5, -1],
      [0.5, -1],
      [-1, 0.9],
      [1, 0.9],
    ] as const) {
      ghost(ctx, w * 0.5 + q * r * S3 * 1.6, cy + rr * r * 1.55, r * 0.9, C, 0.3);
    }
    const fade = 1 - seg(t, 6.3, 6.95);
    const done = seg(t, 4.9, 5.3) * fade;
    xs.forEach((x, i) => {
      hex(ctx, x, cy, r);
      ctx.fillStyle = i === 2 && done > 0.01 ? tint(C.green, 30 * done, C.panel2) : C.panel2;
      ctx.fill();
      ctx.strokeStyle = i === 0 ? alpha(C.subtle, 0.8) : i === 1 ? alpha(C.brand, 0.7) : alpha(C.green, 0.7);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    const work = seg(t, 2.5, 2.7) * (1 - seg(t, 4.1, 4.3));
    if (work > 0.01) {
      const a0 = t * 4.2;
      ctx.beginPath();
      ctx.arc(xs[1], cy, r * 1.18, a0, a0 + Math.PI * 1.1);
      ctx.strokeStyle = alpha(C.brand, work);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (done > 0.01) {
      ctx.beginPath();
      ctx.moveTo(xs[2] - r * 0.32, cy + r * 0.02);
      ctx.lineTo(xs[2] - r * 0.08, cy + r * 0.26);
      ctx.lineTo(xs[2] + r * 0.36, cy - r * 0.24);
      ctx.strokeStyle = alpha(C.green, done);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    let x: number;
    if (t < 1) x = -r * 1.6 + (xs[0] + r * 1.6) * seg(t, 0, 1);
    else if (t < 1.8) x = xs[0];
    else if (t < 2.5) x = xs[0] + (xs[1] - xs[0]) * seg(t, 1.8, 2.5);
    else if (t < 4.2) x = xs[1];
    else x = xs[1] + (xs[2] - xs[1]) * seg(t, 4.2, 4.9);
    const shrink = seg(t, 4.9, 5.3);
    const cw = r * 1.15 * (1 - 0.35 * shrink);
    const ch = r * 0.7 * (1 - 0.35 * shrink);
    ctx.globalAlpha = fade * (1 - 0.65 * shrink);
    box(ctx, x - cw / 2, cy - ch / 2, cw, ch, 3);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = alpha(C.brand, 0.9);
    ctx.fillRect(x - cw / 2 + 4, cy - ch / 2 + 4, cw * 0.32, 2.4);
    ctx.fillStyle = alpha(C.muted, 0.7);
    ctx.fillRect(x - cw / 2 + 4, cy - ch / 2 + 9, cw * 0.7, 2);
    ctx.fillRect(x - cw / 2 + 4, cy - ch / 2 + 13, cw * 0.5, 2);
    ctx.globalAlpha = 1;
  },
};

/** PRs: a branch leaves one cell, its eight checks pass (one on a re-run), and it merges into another. 7.5s. */
const pr: Piece = {
  dur: 7.5,
  rest: 5.7,
  draw(ctx, w, h, t, C) {
    const r = Math.min(w / 9, h / 6.4);
    const A = [w * 0.24, h * 0.7] as const;
    const B = [w * 0.8, h * 0.7] as const;
    const fade = 1 - seg(t, 6.8, 7.45);
    ghost(ctx, w * 0.52, h * 0.82, r * 0.85, C, 0.3);
    const merged = seg(t, 5.0, 5.3) * fade;
    [A, B].forEach(([x, y], i) => {
      hex(ctx, x, y, r);
      ctx.fillStyle = i === 1 && merged > 0.01 ? tint(C.brand, 34 * merged, C.panel2) : C.panel2;
      ctx.fill();
      ctx.strokeStyle = i === 0 ? alpha(C.brand, 0.75) : alpha(C.chitin, 0.55 + 0.4 * merged);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    const P0 = [A[0], A[1] - r];
    const P1 = [A[0] + w * 0.02, h * 0.32];
    const P2 = [B[0] - w * 0.02, h * 0.32];
    const P3 = [B[0], B[1] - r];
    const bez = (u: number): [number, number] => {
      const v = 1 - u;
      const k = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u] as const;
      return [
        k[0] * P0[0]! + k[1] * P1[0]! + k[2] * P2[0]! + k[3] * P3[0]!,
        k[0] * P0[1]! + k[1] * P1[1]! + k[2] * P2[1]! + k[3] * P3[1]!,
      ];
    };
    const grow = 0.62 * seg(t, 0.2, 2.0) + 0.38 * seg(t, 4.4, 5.0);
    if (grow > 0.005) {
      ctx.beginPath();
      for (let j = 0; j <= 48; j++) {
        const [x, y] = bez((grow * j) / 48);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = alpha(C.brand, 0.85 * fade);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    [0.16, 0.34, 0.52].forEach((u, i) => {
      const on = seg(t, 0.7 + i * 0.5, 0.9 + i * 0.5) * fade;
      if (on < 0.01 || grow < u) return;
      const [x, y] = bez(u);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = C.bg;
      ctx.fill();
      ctx.strokeStyle = alpha(C.brand, on);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    const sz = Math.max(7, r * 0.42);
    const gap = sz * 0.55;
    const x0 = w * 0.52 - (8 * sz + 7 * gap) / 2;
    const y0 = h * 0.12;
    for (let i = 0; i < 8; i++) {
      const on = seg(t, 2.1 + i * 0.24, 2.25 + i * 0.24) * fade;
      const red = i === 5 ? seg(t, 3.3, 3.4) * (1 - seg(t, 3.95, 4.15)) : 0;
      box(ctx, x0 + i * (sz + gap), y0, sz, sz, 2);
      ctx.strokeStyle = alpha(C.subtle, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (on > 0.01) {
        ctx.fillStyle = alpha(red > 0.02 ? C.red : C.green, on * 0.9);
        ctx.fill();
      }
    }
    if (merged > 0.01) {
      ctx.beginPath();
      ctx.arc(B[0], B[1], r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = alpha(C.brand, merged);
      ctx.fill();
      const p = clamp((t - 5.0) / 1.2);
      hex(ctx, B[0], B[1], r * (1 + 0.5 * p));
      ctx.strokeStyle = alpha(C.brand, 0.7 * (1 - p) * fade);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  },
};

export const PIECES: Record<PieceKind, Piece> = { comb, ticket, pr };
