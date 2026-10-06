import { createSpine, drawMuta, type Spine, stepSpine, warmSpine } from '@lib/swarm/muta';
import { type SwarmPalette, withAlpha } from '@lib/swarm/palette';
import { toneOf } from '@lib/swarm/tone';

/**
 * The Comb (HIVE-199; design §2): one hex cell per live session, terminal and
 * agent. Agents sit together as the swarm; every project is its own patch.
 *
 * Laid out and drawn in a logical {@link COMB_W} × {@link COMB_H} space — the
 * prototype's canvas — which the host scales to the stage. The layout is pure
 * and has no randomness: a cell's phase is a hash of its id, so a data change
 * never re-phases the cells that did not change. Ported from `heroComb()` in
 * the prototype's `round3.js`.
 */
export const COMB_W = 1376;
export const COMB_H = 520;
export const SWARM = 'swarm';
/** The project of the "+N projects" rest cell: every project. */
export const ALL_PROJECTS = '*';

export type CellState = 'morphing' | 'summons' | 'failed' | 'burrowed' | 'terminal';

/** Capped patches keep the most urgent (decision D8). */
export const URGENCY: readonly CellState[] = ['summons', 'failed', 'morphing', 'burrowed', 'terminal'];

export interface CombInput {
  id: string;
  name: string;
  /** A project id, or {@link SWARM} for an agent. */
  project: string;
  state: CellState;
  /** Plan progress, 0–1; absent draws half full. */
  progress?: number;
}

export interface CombProject {
  id: string;
  name: string;
}

export interface CombCell {
  id: string;
  kind: 'entity' | 'rest';
  name: string;
  project: string;
  state: CellState | 'rest';
  progress?: number;
  /** A rest cell's N. */
  more?: number;
  x: number;
  y: number;
  phase: number;
}

export interface CombPatch {
  project: string;
  label: string;
  x: number;
  y: number;
}

export interface CombLayout {
  mode: 'normal' | 'scale';
  R: number;
  cells: CombCell[];
  patches: CombPatch[];
  grid: { x: number; y: number }[];
}

type Slot = [col: number, row: number];

export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const rank = (state: CellState): number => URGENCY.indexOf(state);

/** 0–6, stable per id: cells never pulse in step, and never jump on a relayout. */
function phaseOf(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 600) / 100;
}

/** Pointy-top hexes: column pitch √3·R, row pitch 1.5·R, odd rows offset half a column. */
function placer(R: number): (slot: Slot) => { x: number; y: number } {
  const w = Math.sqrt(3) * R;
  return ([c, r]) => ({ x: c * w + (r & 1 ? w / 2 : 0), y: r * 1.5 * R + 14 });
}

function gridFor(R: number): { x: number; y: number }[] {
  const at = placer(R);
  const w = Math.sqrt(3) * R;
  const cells: { x: number; y: number }[] = [];
  for (let r = -1; r < COMB_H / (1.5 * R) + 1; r++) {
    for (let c = -1; c < COMB_W / w + 1; c++) cells.push(at([c, r]));
  }
  return cells;
}

/** The project ids with something live, in config order, unknown ids last in first-seen order. */
function liveProjects(entities: CombInput[], projects: CombProject[]): CombProject[] {
  const live = new Set(entities.filter((e) => e.project !== SWARM).map((e) => e.project));
  const known = projects.filter((p) => live.has(p.id));
  const unknown = [...live].filter((id) => !projects.some((p) => p.id === id)).map((id) => ({ id, name: id }));
  return [...known, ...unknown];
}

interface Patch {
  project: string;
  label: string;
  list: CombInput[];
  slots: Slot[];
  cap: number;
}

function place(R: number, patches: Patch[]): Pick<CombLayout, 'cells' | 'patches'> {
  const at = placer(R);
  const cells: CombCell[] = [];
  const labels: CombPatch[] = [];
  for (const { project, label, list, slots, cap } of patches) {
    const over = list.length > cap;
    const shown = over
      ? [...list].sort((a, b) => rank(a.state) - rank(b.state)).slice(0, cap - 1)
      : list;
    const mine: CombCell[] = shown.map((e, i) => ({
      id: e.id, kind: 'entity', name: e.name, project, state: e.state, progress: e.progress,
      ...at(slots[i]!), phase: phaseOf(e.id),
    }));
    if (over) {
      const more = list.length - cap + 1;
      mine.push({
        id: `rest:${project}`, kind: 'rest', name: `+${more}`, project, state: 'rest', more,
        ...at(slots[cap - 1]!), phase: 0,
      });
    }
    cells.push(...mine);
    labels.push({
      project, label,
      x: mine.reduce((sum, c) => sum + c.x, 0) / mine.length,
      y: Math.min(...mine.map((c) => c.y)) - R - 9,
    });
  }
  return { cells, patches: labels };
}

const NORMAL_CAP = 7;

/** The normal layout, or null when it does not fit (then the scale layout takes over). */
function normal(entities: CombInput[], projects: CombProject[]): CombLayout | null {
  const R = 36;
  const agents = entities.filter((e) => e.project === SWARM);
  if (agents.length > NORMAL_CAP) return null;

  const patches: Patch[] = [];
  if (agents.length > 0) {
    const c0 = Math.round(COMB_W / (Math.sqrt(3) * R) / 2 - (agents.length - 1));
    patches.push({ project: SWARM, label: 'THE SWARM', list: agents, slots: agents.map((_, i) => [c0 + 2 * i, 3]), cap: NORMAL_CAP });
  }
  let col = 2;
  for (const p of liveProjects(entities, projects)) {
    const list = entities.filter((e) => e.project === p.id);
    const n = Math.min(list.length, NORMAL_CAP);
    patches.push({ project: p.id, label: p.name.toUpperCase(), list, slots: Array.from({ length: n }, (_, i) => [col + 2 * i, 7]), cap: NORMAL_CAP });
    col += 2 * (n - 1) + 3;
  }

  const placed = place(R, patches);
  if (placed.cells.some((c) => c.x + R > COMB_W)) return null;
  return { mode: 'normal', R, ...placed, grid: gridFor(R) };
}

export function layoutComb(entities: CombInput[], projects: CombProject[]): CombLayout {
  return normal(entities, projects) ?? scale(entities, projects);
}

const SCALE_SWARM_CAP = 14;
const SCALE_PATCH_CAP = 4;
const SCALE_PATCHES = 12;

/** A project's most urgent cell, for ordering when they no longer all fit. */
const urgencyOf = (entities: CombInput[], project: string): number =>
  Math.min(...entities.filter((e) => e.project === project).map((e) => rank(e.state)));

/**
 * The heavy day: cells nest like real comb. The swarm is two staggered rows of
 * seven; each project a 2×2 patch of at most four with a "+N" rest cell, the
 * rule the rail combs already follow; names only as tags (drawn later).
 */
function scale(entities: CombInput[], projects: CombProject[]): CombLayout {
  const R = 21;
  const agents = entities.filter((e) => e.project === SWARM);
  const patches: Patch[] = [];
  if (agents.length > 0) {
    const slots: Slot[] = [
      ...Array.from({ length: 7 }, (_, i): Slot => [12 + 2 * i, 4]),
      ...Array.from({ length: 7 }, (_, i): Slot => [13 + 2 * i, 6]),
    ];
    patches.push({ project: SWARM, label: 'THE SWARM', list: agents, slots, cap: SCALE_SWARM_CAP });
  }

  let live = liveProjects(entities, projects);
  const folded = live.length > SCALE_PATCHES;
  if (folded) {
    // Decision D10: the most urgent projects keep their patches.
    live = live
      .map((p, i) => ({ p, i, u: urgencyOf(entities, p.id) }))
      .sort((a, b) => a.u - b.u || a.i - b.i)
      .map(({ p }) => p);
  }
  const shown = folded ? live.slice(0, SCALE_PATCHES - 1) : live;
  const origin = (i: number): Slot => [2 + (i % 6) * 6, i < 6 ? 9 : 13];
  shown.forEach((p, i) => {
    const [c0, r0] = origin(i);
    patches.push({
      project: p.id, label: truncate(p.name, 18).toUpperCase(),
      list: entities.filter((e) => e.project === p.id),
      slots: [[c0, r0], [c0 + 1, r0], [c0, r0 + 1], [c0 + 1, r0 + 1]], cap: SCALE_PATCH_CAP,
    });
  });

  const placed = place(R, patches);
  if (folded) {
    const more = live.length - shown.length;
    const { x, y } = placer(R)(origin(SCALE_PATCHES - 1));
    placed.cells.push({ id: `rest:${ALL_PROJECTS}`, kind: 'rest', name: `+${more}`, project: ALL_PROJECTS, state: 'rest', more, x, y, phase: 0 });
  }
  return { mode: 'scale', R, ...placed, grid: gridFor(R) };
}

export type Rng = () => number;

/** mulberry32: a small seeded generator, so a still frame is the same frame every time. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Flyer {
  x: number;
  y: number;
  /** Heading, radians. */
  a: number;
  /** Wing-beat phase. */
  k: number;
  /** 1: bound for the swarm; 0: bound for a project. */
  leg: 0 | 1;
  /** A cell id on a handoff, a point while wandering, null before the first pick. */
  target: string | { x: number; y: number } | null;
  /** Angular rate, rad/s: the bank, and what the tail lags. */
  turn: number;
  /** The body, simulated live behind the head (HIVE-221). Stepped in place. */
  spine: Spine;
}

export const newFlyer = (index: number, rng: Rng): Flyer => {
  const x = rng() * COMB_W;
  const y = 60 + rng() * (COMB_H - 120);
  const a = rng() * 6;
  return { x, y, a, k: index * 1.7, leg: (index % 2) as 0 | 1, target: null, turn: 0, spine: createSpine(x, y, a) };
};

export function syncFlyers(flyers: Flyer[], count: number, rng: Rng): Flyer[] {
  if (flyers.length === count) return flyers;
  if (flyers.length > count) return flyers.slice(0, count);
  return [...flyers, ...Array.from({ length: count - flyers.length }, (_, i) => newFlyer(flyers.length + i, rng))];
}

const targetsOf = (layout: CombLayout): CombCell[] =>
  layout.cells.filter((c) => c.kind === 'entity' && (c.state === 'morphing' || c.state === 'summons'));

/** Nothing needs you, or nothing to carry: fewer, slower flyers. */
export const isCalm = (layout: CombLayout, needs: number): boolean => needs === 0 || targetsOf(layout).length === 0;

export const flyerCount = (layout: CombLayout, needs: number): number =>
  isCalm(layout, needs) ? 5 : layout.mode === 'scale' ? 14 : 9;

const MAX_DT = 1 / 15;
/** Logical px/s. */
const flightSpeed = (calm: boolean): number => (calm ? 1.1 : 1.8) * 60;
const ARRIVED = 26;
/** The flyer steers to a point this far above its target cell. */
const ABOVE = 18;

/**
 * One step of flight. Each flyer alternates legs — a working or summoning cell
 * in the swarm, then one in a project, and back: the picture is a handoff.
 * With nothing to carry it wanders between random points (decision D9).
 */
export function stepFlyers(flyers: Flyer[], layout: CombLayout, rawDt: number, rng: Rng, calm: boolean): Flyer[] {
  const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
  const targets = targetsOf(layout);
  const byId = new Map(targets.map((c) => [c.id, c]));
  const speed = flightSpeed(calm);
  const steer = 1 - (1 - 0.035) ** (60 * dt);

  return flyers.map((f) => {
    let { leg, target } = f;
    let aim: { x: number; y: number } | undefined =
      typeof target === 'string' ? byId.get(target) : targets.length === 0 ? (target ?? undefined) : undefined;

    if (aim === undefined || Math.hypot(aim.x - f.x, aim.y - ABOVE - f.y) < ARRIVED) {
      if (targets.length === 0) {
        aim = { x: rng() * COMB_W, y: 60 + rng() * (COMB_H - 120) };
        target = aim;
      } else {
        leg = leg ? 0 : 1;
        const pool = targets.filter((c) => (leg ? c.project === SWARM : c.project !== SWARM));
        const pick = pool.length > 0 ? pool[Math.floor(rng() * pool.length)]! : targets[0]!;
        aim = pick;
        target = pick.id;
      }
    }

    let da = Math.atan2(aim.y - ABOVE - f.y, aim.x - f.x) - f.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const turned = da * steer;
    const a = f.a + turned;
    const x = f.x + Math.cos(a) * speed * dt;
    const y = f.y + Math.sin(a) * speed * dt;
    stepSpine(f.spine, x, y, dt);
    return { ...f, leg, target, a, x, y, turn: dt > 0 ? turned / dt : 0 };
  });
}

/** Seconds of straight flight a still frame's spine is warmed over. */
const STILL_WARM = 2;

/**
 * Where the flock would be after about four seconds of flight: the
 * reduced-motion frame. Each body is then warmed on a short straight approach
 * to where its flyer is, so the still is the same frame every time.
 */
export function stillFlyers(layout: CombLayout, needs: number): Flyer[] {
  const rng = seededRng(7);
  const calm = isCalm(layout, needs);
  let flyers = syncFlyers([], flyerCount(layout, needs), rng);
  for (let i = 0; i < 240; i++) flyers = stepFlyers(flyers, layout, 1 / 60, rng, calm);
  const speed = flightSpeed(calm);
  return flyers.map((f) => {
    const back = (t: number): [number, number] => [
      f.x - Math.cos(f.a) * speed * (STILL_WARM - t),
      f.y - Math.sin(f.a) * speed * (STILL_WARM - t),
    ];
    const spine = createSpine(...back(0), f.a);
    warmSpine(spine, back, STILL_WARM);
    return { ...f, spine };
  });
}

/** The cell under a logical point, within 24 units of its centre. */
export const hitTest = (layout: CombLayout, x: number, y: number): CombCell | null =>
  layout.cells.find((c) => Math.hypot(c.x - x, c.y - y) < 24) ?? null;

const MONO = 'ui-monospace,Menlo,monospace';
const SANS = '-apple-system,system-ui,sans-serif';
const FULL = Math.PI * 2;

export function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (60 * k - 30);
    if (k === 0) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
}

const colourOf = (p: SwarmPalette, state: CombCell['state']): string =>
  ({ morphing: p.green, summons: p.amber, failed: p.red, burrowed: p.subtle, terminal: p.muted, rest: p.muted })[state];

const isLive = (c: CombCell): boolean => c.state === 'morphing' || c.state === 'summons';

/** Creep: the ground under each patch; it spreads with how much of the patch is live. */
function drawCreep(ctx: CanvasRenderingContext2D, layout: CombLayout, t: number, p: SwarmPalette): void {
  const groups = new Map<string, CombCell[]>();
  for (const c of layout.cells) groups.set(c.project, [...(groups.get(c.project) ?? []), c]);
  for (const group of groups.values()) {
    const live = group.filter(isLive).length / group.length;
    for (const c of group) {
      const rr = layout.R * (1.5 + live * 0.9) * (1 + 0.04 * Math.sin(t * 0.8 + c.phase));
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
      g.addColorStop(0, p.creep);
      g.addColorStop(1, p.creepClear);
      ctx.fillStyle = g;
      withAlpha(ctx, 0.28 * (0.4 + live), () => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, rr, 0, FULL);
        ctx.fill();
      });
    }
  }
}

/** The faint comb behind everything: a sweep line brightens it, flyers leave a creep trace. */
function drawGrid(ctx: CanvasRenderingContext2D, layout: CombLayout, flyers: Flyer[], t: number, p: SwarmPalette): void {
  const sweep = (((t * 0.12) % 1.6) - 0.3) * COMB_W;
  ctx.lineWidth = 1;
  for (const cell of layout.grid) {
    const d = Math.abs(cell.x - sweep);
    let near = 0;
    for (const f of flyers) {
      const q = Math.abs(f.x - cell.x) + Math.abs(f.y - cell.y);
      if (q < 80) near = Math.max(near, 1 - q / 80);
    }
    hexPath(ctx, cell.x, cell.y, layout.R - 2);
    if (near) {
      ctx.fillStyle = p.creep;
      withAlpha(ctx, 0.16 * near, () => ctx.fill());
    }
    ctx.strokeStyle = p.brand;
    withAlpha(ctx, 0.05 + 0.12 * Math.max(0, 1 - d / 260) + near * 0.1, () => ctx.stroke());
  }
}

function drawCell(ctx: CanvasRenderingContext2D, c: CombCell, layout: CombLayout, t: number, p: SwarmPalette): void {
  const { R } = layout;
  const sc = layout.mode === 'scale';
  const r1 = R - 2;
  const col = colourOf(p, c.state);

  hexPath(ctx, c.x, c.y, r1);
  ctx.fillStyle = p.panel2;
  ctx.fill();

  if (c.state === 'rest') {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.muted;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.ink;
    ctx.font = `600 ${sc ? 10 : 12}px ${MONO}`;
    ctx.fillText(c.name, c.x, c.y + 4);
    return;
  }

  if (c.state === 'morphing') {
    // A green wave fills the cell to its plan's progress.
    ctx.save();
    hexPath(ctx, c.x, c.y, r1 - 1);
    ctx.clip();
    const level = c.y + R - 2 * R * (c.progress ?? 0.5);
    ctx.beginPath();
    ctx.moveTo(c.x - R, c.y + R);
    for (let x = -R; x <= R; x += 3) ctx.lineTo(c.x + x, level + Math.sin(x / 7 + t * 3 + c.phase) * (sc ? 1.4 : 2.2));
    ctx.lineTo(c.x + R, c.y + R);
    ctx.closePath();
    ctx.fillStyle = col;
    withAlpha(ctx, 0.55, () => ctx.fill());
    ctx.restore();
  }
  if (c.state === 'summons') {
    // A hex ripple, and a pulsing amber fill.
    const k = (t * 0.7 + c.phase) % 1;
    hexPath(ctx, c.x, c.y, R + k * (sc ? 14 : 26));
    ctx.strokeStyle = p.amber;
    ctx.lineWidth = 2;
    withAlpha(ctx, 0.6 * (1 - k), () => ctx.stroke());
    hexPath(ctx, c.x, c.y, r1 - 1);
    ctx.fillStyle = p.amber;
    withAlpha(ctx, 0.35 + 0.25 * Math.sin(t * 5 + c.phase), () => ctx.fill());
  }
  if (c.state === 'failed') {
    hexPath(ctx, c.x, c.y, r1 - 1);
    ctx.fillStyle = p.red;
    withAlpha(ctx, 0.25 + 0.15 * Math.sin(t * 2), () => ctx.fill());
  }

  hexPath(ctx, c.x, c.y, r1);
  ctx.strokeStyle = c.state === 'terminal' ? p.muted : col;
  ctx.lineWidth = c.state === 'burrowed' ? 1.2 : 1.8;
  if (c.state === 'terminal') ctx.setLineDash([3, 3]);
  withAlpha(ctx, c.state === 'burrowed' ? 0.7 : 1, () => ctx.stroke());
  ctx.setLineDash([]);

  if (c.state === 'morphing') {
    ctx.shadowColor = p.green;
    ctx.shadowBlur = (sc ? 8 : 14) + 5 * Math.sin(t * 2 + c.phase);
    hexPath(ctx, c.x, c.y, r1);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (!sc) {
    ctx.font = `500 11px ${SANS}`;
    ctx.fillStyle = c.state === 'burrowed' ? p.subtle : p.ink;
    ctx.fillText(truncate(c.name, 14), c.x, c.y + R + 16);
  }
}

/** At scale a name shows only where it needs you or failed, as a tag drawn over the comb. */
function drawTag(ctx: CanvasRenderingContext2D, c: CombCell, R: number, p: SwarmPalette): void {
  const col = colourOf(p, c.state);
  ctx.font = `600 10px ${SANS}`;
  const tw = ctx.measureText(c.name).width + 10;
  const x0 = c.x + R * 0.55;
  const y0 = c.y - R - 4;
  ctx.beginPath();
  ctx.roundRect(x0, y0, tw, 16, 4);
  ctx.fillStyle = p.bg;
  withAlpha(ctx, 0.92, () => ctx.fill());
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  withAlpha(ctx, 0.7, () => ctx.stroke());
  ctx.fillStyle = col;
  ctx.textAlign = 'left';
  ctx.fillText(c.name, x0 + 5, y0 + 11.5);
  ctx.textAlign = 'center';
}

/**
 * The Brood mutalisk's scale on the comb (HIVE-221): its wings span about 130
 * units, so this keeps them about 14 logical px across, as the round-two
 * flyer's 70 at 0.2 did. At scale it shrinks by the same 0.7 that one did.
 */
export const MUTA_SCALE = 0.108;
const MUTA_SCALE_SMALL = MUTA_SCALE * 0.7;

/**
 * One frame of the comb, in logical units. `ps` is device pixels per logical
 * unit, which sets the flyers' detail and line widths. `focusedId` is the cell
 * whose button holds keyboard focus, if any.
 */
export function drawComb(
  ctx: CanvasRenderingContext2D, layout: CombLayout, flyers: Flyer[], t: number, palette: SwarmPalette, ps = 1,
  focusedId: string | null = null,
): void {
  const sc = layout.mode === 'scale';
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, COMB_W, COMB_H);

  drawCreep(ctx, layout, t, palette);
  drawGrid(ctx, layout, flyers, t, palette);

  ctx.font = `600 ${sc ? 9 : 10}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = palette.muted;
  for (const patch of layout.patches) ctx.fillText(patch.label, patch.x, patch.y);

  for (const cell of layout.cells) drawCell(ctx, cell, layout, t, palette);

  // The mutalisks, small and dim: atmosphere, not information.
  const scale = sc ? MUTA_SCALE_SMALL : MUTA_SCALE;
  const tone = toneOf(palette);
  withAlpha(ctx, 0.55, () => {
    for (const f of flyers) drawMuta(ctx, f.spine, t, f.k * 3.7, f.turn, scale, ps, tone);
  });

  if (sc) for (const cell of layout.cells) if (cell.state === 'summons' || cell.state === 'failed') drawTag(ctx, cell, layout.R, palette);

  // A keyboard-focused cell (HIVE-223): the sr-only buttons are invisible, so the canvas shows which one has focus.
  const focused = focusedId === null ? undefined : layout.cells.find((cell) => cell.id === focusedId);
  if (focused) {
    hexPath(ctx, focused.x, focused.y, layout.R - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.brand;
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}
