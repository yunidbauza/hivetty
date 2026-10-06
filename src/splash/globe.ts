import { MUTA_SCALE } from '@lib/swarm/comb';
import {
  clamp,
  creepPool,
  ease,
  gauss,
  mix,
  sm,
  SP_LIGHT,
  spBack,
  spBlob,
  spCross,
  spDot,
  spNorm,
  spRng,
  TAU,
  type V3,
} from '@lib/swarm/kit';
import { createSpine, drawMuta, type Spine, stepSpine, warmSpine } from '@lib/swarm/muta';
import type { SwarmPalette } from '@lib/swarm/palette';
import { rgbOf, spLit, spMix, spRgb, spTone, toneOf, type Rgb, type Tone } from '@lib/swarm/tone';

import { LOG_SCHEDULE } from './chamber';

/**
 * The brood world (the Brood artifact's "The brood world wakes"), the splash's
 * creature and About's hero.
 *
 * There is no sphere. About a hundred separate comb chambers sit at their own
 * depths in a spherical volume and turn round its centre on layered orbits, the
 * inner layers a little faster, so the globe is only ever implied by how they
 * move: near ones larger and lit, far ones smaller and faint, passing behind one
 * another. A seed rises out of the creep and the chambers bud from it; each log
 * line lands on them (four sessions light inside sealed chambers, a shiver
 * crosses them, the creep spreads, two chambers call you in amber); "hive
 * cluster online" is the hive's double heartbeat, starting in the active
 * chambers; then sealed chambers tear and seven mutalisks climb out to a ring of
 * spores and circle it, the comb globe's flight (HIVE-212) unchanged.
 *
 * Everything is centred on the origin: the caller translates to the chamber's
 * centre (the splash) or to its hero (About) and scales. Positions are pure
 * functions of `t`, seconds on the splash's clock, so the tests can ask where
 * anything is at any moment; `drawGlobe` only paints what they answer. No
 * colour lives here: every colour arrives in the palette.
 */

/** The volume's radius, in chamber pixels. */
export const GLOBE_R = 136;
/** The creep's line under the volume. */
const GROUND = 174;
const CHAMBERS = 100;
const TILT = 0.3;
const COS_TILT = Math.cos(TILT);
const SIN_TILT = Math.sin(TILT);

const after = (t: number, at: number, dur: number): number => clamp((t - at) / dur);
const easeO = (x: number): number => 1 - (1 - clamp(x)) ** 3;
/** Perspective: a point at depth `z` (globe radii, toward you positive) drawn this much larger. */
const persp = (z: number): number => 1 / (1 - z * 0.16);
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Turn a point about the vertical axis by `a`, then tip the volume so its crown leans toward you. */
function turn(b: V3, a: number): V3 {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const x1 = b[0] * ca + b[2] * sa;
  const z1 = -b[0] * sa + b[2] * ca;
  return [x1, b[1] * COS_TILT + z1 * SIN_TILT, -b[1] * SIN_TILT + z1 * COS_TILT];
}

/** Each log line's beat. */
const SESSIONS_AT = LOG_SCHEDULE[0]!;
const SHIVER_AT = LOG_SCHEDULE[1]!;
const CREEP_AT = LOG_SCHEDULE[2]!;
const AWAITING_AT = LOG_SCHEDULE[3]!;
/** "hive cluster online": the first heartbeat, the ring of spores, and the brood after it. */
export const ORBIT_AT = LOG_SCHEDULE[4]!;

export type ChamberKind = 'green' | 'amber';

export interface GlobeChamber {
  /** Its direction from the centre, a unit vector, and where it sits (direction × depth into the volume). */
  d: V3;
  p: V3;
  /** Its own angular velocity: the inner layers turn a little faster. */
  w: number;
  bob: number;
  seed: number;
  /** Sealed by a membrane, or an open pit. */
  sealed: boolean;
  /** Its size, in globe radii, and how uneven its wall and pit are, corner by corner. */
  rc: number;
  wall: readonly number[];
  pit: readonly number[];
  twist: number;
  /** When it buds off the seed. */
  grow: number;
  pores: readonly (readonly [number, number])[];
  kind: ChamberKind | null;
  /** When its log line lights it. */
  lit: number;
  /** When a mutalisk tears out of it, if one does. */
  hatch: number | null;
  /** How long the heartbeat takes to reach it from the active chambers. */
  arrives: number;
}

const rng = spRng(23);
const between = (a: number, b: number): number => a + (b - a) * rng();

/** Where growth starts: the front of the volume, low, near where the seed came up. */
const GROWTH_FROM = spNorm([0.1, 0.55, 0.8]);

/** Scattered through a shell of the volume, never closer than a gap to each other: the negative space is the point. */
const chambers: GlobeChamber[] = [];
for (let tries = 0; chambers.length < CHAMBERS && tries < 8000; tries++) {
  const y = between(-1, 1);
  const th = between(0, TAU);
  const rr = Math.sqrt(1 - y * y);
  const d: V3 = [Math.cos(th) * rr, y, Math.sin(th) * rr];
  const depth = between(0.62, 0.98);
  const p: V3 = [d[0] * depth, d[1] * depth, d[2] * depth];
  if (chambers.some((c) => dist(c.p, p) < 0.25)) continue;
  const layer = depth < 0.74 ? 0 : depth < 0.86 ? 1 : 2;
  chambers.push({
    d,
    p,
    w: [0.21, 0.178, 0.148][layer]! + between(-0.012, 0.012),
    bob: between(0, TAU),
    seed: between(0, 99),
    sealed: rng() < 0.4,
    rc: between(0.082, 0.122),
    wall: Array.from({ length: 6 }, () => between(0.8, 1.15)),
    pit: Array.from({ length: 6 }, () => between(0.82, 1.12)),
    twist: between(0, TAU),
    grow: 0.5 + (Math.acos(clamp(spDot(d, GROWTH_FROM), -1, 1)) / Math.PI) * 1.2 + between(0, 0.14),
    pores: [
      [between(-0.8, 0.8), between(-0.8, 0.8)],
      [between(-0.8, 0.8), between(-0.8, 0.8)],
    ],
    kind: null,
    lit: 0,
    hatch: null,
    arrives: 0,
  });
}

export interface PlacedChamber {
  /** Its centre, in globe radii (z toward you), and the way its face points. */
  v: V3;
  n: V3;
}

/** Where a chamber is at `t`: turned at its own pace, breathing a little up and down. */
export function chamberAt(c: GlobeChamber, t: number): PlacedChamber {
  const a = t * c.w;
  return { v: turn([c.p[0], c.p[1] + 0.025 * Math.sin(t * 0.55 + c.bob), c.p[2]], a), n: turn(c.d, a) };
}

/** Cast `n` chambers that pass `ok` at `t`, in seeded order. */
function cast(n: number, ok: (at: PlacedChamber) => boolean, t: number): GlobeChamber[] {
  const pool = chambers.filter((c) => !c.kind && ok(chamberAt(c, t)));
  for (let j = pool.length - 1; j > 0; j--) {
    const k = Math.floor(rng() * (j + 1));
    [pool[j], pool[k]] = [pool[k]!, pool[j]!];
  }
  return pool.slice(0, n);
}

/** The log lines' chambers, chosen where they will face you while the splash is up: 4 sessions, 2 awaiting you. */
const greens = cast(4, ({ v, n }) => n[2] > 0.35 && v[1] > -0.45 && v[1] < 0.55, 2.2);
greens.forEach((c, j) => {
  c.kind = 'green';
  c.lit = Math.max(SESSIONS_AT + j * 0.09, c.grow + 0.2);
  c.sealed = true;
});
cast(2, ({ v, n }) => n[2] > 0.5 && v[1] > -0.7 && v[1] < 0.2 && Math.abs(v[0]) < 0.7, 3.4).forEach((c) => {
  c.kind = 'amber';
  c.lit = Math.max(AWAITING_AT, c.grow + 0.2);
  c.sealed = true;
});
/** The heartbeat starts in the active chambers and reaches the rest by distance. */
for (const c of chambers) c.arrives = Math.min(...greens.map((g) => dist(c.p, g.p))) * 0.32;

/** The ring: a circle of radius RO, flattened by its incline and rolled on screen. The comb globe's orbit, exactly. */
const RO = 140 * 1.22;
const FLAT = 0.24;
const ROLL = -0.42;
/** Depth on the ring, in globe radii, so a flyer sorts among the chambers. */
const RING_DEPTH = (Math.sqrt(1 - FLAT * FLAT) * RO) / GLOBE_R;

/** The ring's point at angle `a`: x, y and depth (`sin a`, the near half positive). */
export function orbitPoint(a: number): [number, number, number] {
  const x = Math.cos(a) * RO;
  const y = Math.sin(a) * RO * FLAT;
  return [x * Math.cos(ROLL) - y * Math.sin(ROLL), x * Math.sin(ROLL) + y * Math.cos(ROLL), Math.sin(a)];
}

/** The brood: seven, 0.16s apart from 0.35s after "online", each to its own slot, then all round the ring. */
export const FLYER_COUNT = 7;
const FLY0 = ORBIT_AT + 0.35;
const GAP = 0.16;
const CLIMB = 0.75;
const LAP = 0.85;

/** When flyer `i` tears out of its chamber. */
export const flyerStart = (i: number): number => FLY0 + i * GAP;
const slotOf = (i: number): number => -Math.PI / 2 + (i * TAU) / FLYER_COUNT;

/** Each flyer's chamber: a free one facing you at its hatch, nearest the line from the centre to its slot. */
const hatchery: GlobeChamber[] = Array.from({ length: FLYER_COUNT }, (_, i) => {
  const te = flyerStart(i);
  const [sx, sy] = orbitPoint(slotOf(i));
  const aim = [(sx / GLOBE_R) * 0.55, (sy / GLOBE_R) * 0.55];
  let best: GlobeChamber | null = null;
  let bestD = Infinity;
  for (const c of chambers) {
    if (c.kind || c.hatch !== null) continue;
    const { v, n } = chamberAt(c, te);
    if (n[2] < 0.45) continue;
    const d = Math.hypot(v[0] - aim[0]!, v[1] - aim[1]!);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  const chosen = best ?? chambers.find((c) => !c.kind && c.hatch === null)!;
  chosen.hatch = te;
  chosen.sealed = true;
  return chosen;
});

/** Every chamber, seeded: the same colony every launch. */
export const GLOBE_CHAMBERS: readonly GlobeChamber[] = chambers;

export interface FlyerPos {
  x: number;
  y: number;
  /** -1 behind the volume to 1 in front, as the ring reads it; 1 while climbing out. */
  z: number;
  /** Where it sorts among the chambers, in globe radii. */
  depth: number;
  /** 0 as it leaves its chamber to 1 at full size. */
  grown: number;
  alpha: number;
  climbing: boolean;
}

/** Where a chamber's centre is on screen at `t`, once grown. */
function chamberOnScreen(c: GlobeChamber, t: number): [number, number, number] {
  const { v } = chamberAt(c, t);
  const k = persp(v[2]);
  return [v[0] * GLOBE_R * k, v[1] * GLOBE_R * k, v[2]];
}

/**
 * Flyer `i` at `t`: climbing from its chamber to its slot on the ring, lifted on
 * an arc, then circling. Answers for any `t`, before its start included (it is
 * in its chamber then), because the heading is read from where it just was.
 */
export function flyerAt(i: number, t: number): FlyerPos {
  const d = t - flyerStart(i);
  const slot = slotOf(i);
  // Against the landing moment, not `d < CLIMB`: the subtraction can land a hair short of it.
  if (t < flyerStart(i) + CLIMB) {
    const e = ease(clamp(d / CLIMB));
    const [x0, y0, z0] = chamberOnScreen(hatchery[i]!, t);
    const [x1, y1, z1] = orbitPoint(slot);
    return {
      x: mix(x0, x1, e),
      y: mix(y0, y1, e) - Math.sin(e * Math.PI) * 26,
      z: mix(1, z1, e),
      depth: mix(z0 + 0.05, z1 * RING_DEPTH, e),
      grown: easeO(d / 0.5),
      alpha: clamp(d / 0.12),
      climbing: true,
    };
  }
  const [x, y, z] = orbitPoint(slot + (d - CLIMB) * LAP);
  return { x, y, z, depth: z * RING_DEPTH, grown: 1, alpha: 1, climbing: false };
}

/** The hive's double beat: a strong one when the cluster comes online, then a soft one every 2.45s for as long as it runs. */
const SOFT_FROM = 4.75;
const SOFT_EVERY = 2.45;
export function beatsNear(t: number): [number, number][] {
  const beats: [number, number][] = [[ORBIT_AT + 0.02, 1]];
  const n = Math.floor((t - SOFT_FROM) / SOFT_EVERY);
  for (let k = Math.max(0, n - 1); k <= n; k++) beats.push([SOFT_FROM + k * SOFT_EVERY, 0.45]);
  return beats;
}

/** The pulse at the heart, at its peak on each beat. */
export const pulseAt = (t: number): number =>
  beatsNear(t).reduce((a, [tb, k]) => a + k * (gauss((t - tb) / 0.07) + 0.45 * gauss((t - tb - 0.22) / 0.08)), 0);

/** How much of the heartbeat's light reaches a place `arrives` seconds out from the active chambers. */
export function lightAt(t: number, arrives: number): number {
  const env = (dt: number): number => (dt <= 0 ? 0 : (dt / 0.12) * Math.exp(1 - dt / 0.12));
  return (
    beatsNear(t).reduce((a, [tb, k]) => a + k * (env(t - tb - arrives) + 0.55 * env(t - tb - 0.22 - arrives)), 0) *
    Math.exp(-arrives * 0.9)
  );
}

/**
 * The still the splash holds under reduced motion, and where About's clock
 * starts: the colony formed, every flyer on the ring (the seventh lands at
 * 4.34s), the first soft beat played out.
 */
export const GLOBE_STILL_T = 6.3;

/** The seed: where it is (globe radii, below the centre while it rises), its size, and how much of it is left. */
export function seedAt(t: number): { y: number; r: number; alpha: number } {
  const rise = ease(after(t, 0.35, 0.7));
  return {
    y: mix((GROUND - 8) / GLOBE_R, 0, rise),
    r: 5 + 9 * spBack(after(t, 0.55, 0.7)),
    alpha: easeO(after(t, 0.3, 0.35)) * (1 - sm(1.7, 2.6, t)),
  };
}

const lumps: readonly V3[] = Array.from({ length: 6 }, () => [between(-0.5, 0.5), between(-0.45, 0.45), between(0.45, 0.8)]);
const motes = Array.from({ length: 150 }, () => ({
  a: between(0, TAU),
  rr: 1 + between(-0.07, 0.07),
  dy: between(-7, 7),
  size: between(0.5, 1.5),
  alpha: between(0.3, 1),
}));
const spores = Array.from({ length: 34 }, () => ({
  x: between(-270, 250),
  speed: between(0.05, 0.12),
  off: between(0, 1),
  rise: between(200, 420),
  size: between(0.6, 1.6),
}));

/** Seconds of flight a fresh spine is warmed over, ending at the frame. */
const WARM = 2;
/** A frame further than this from the last one warms afresh rather than stepping. */
const MAX_STEP = 0.25;

/**
 * Each flyer's body (HIVE-221), simulated along {@link flyerAt}. A frame just
 * after the last one steps the spines on; any other (the first, the
 * reduced-motion still, a scrub back) warms them along the last two seconds of
 * each flyer's own path, so a given `t` read cold is always the same frame.
 */
const flight: { t: number; spines: Spine[] } = { t: Number.NaN, spines: [] };

function spinesAt(t: number): Spine[] {
  const dt = t - flight.t;
  if (dt >= 0 && dt <= MAX_STEP) {
    if (dt > 0) {
      flight.spines.forEach((spine, i) => {
        const at = flyerAt(i, t);
        stepSpine(spine, at.x, at.y, dt);
      });
    }
  } else {
    flight.spines = Array.from({ length: FLYER_COUNT }, (_, i) => {
      const path = (u: number): [number, number] => {
        const at = flyerAt(i, t - WARM + u);
        return [at.x, at.y];
      };
      const [x0, y0] = path(0);
      const [x1, y1] = path(1 / 120);
      const spine = createSpine(x0, y0, Math.atan2(y1 - y0, x1 - x0));
      warmSpine(spine, path, WARM);
      return spine;
    });
  }
  flight.t = t;
  return flight.spines;
}

type Ctx = CanvasRenderingContext2D;

interface Frame {
  ctx: Ctx;
  t: number;
  T: Tone;
  /** How glow lands: added on the dark stage, laid over on a light one. */
  glow: GlobalCompositeOperation;
  amber: Rgb;
  spore: Rgb;
  breathe: number;
  seed: { y: number; r: number; alpha: number };
  /** The seed's own fade-in, which every chamber shares. */
  shown: number;
  detail: boolean;
}

const project = (f: Frame, v: V3): [number, number, number] => {
  const k = persp(v[2]) * f.breathe;
  return [v[0] * GLOBE_R * k, v[1] * GLOBE_R * k, k];
};

/** The ring of spores the heartbeat lights, sweeping out from the front; its far half goes behind everything. */
function drawRing(f: Frame, near: boolean): void {
  const { ctx, t } = f;
  const sweep = Math.PI * ease(after(t, ORBIT_AT, 1));
  if (sweep <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = f.glow;
  ctx.strokeStyle = spRgb(f.spore, (0.04 + 0.07 * lightAt(t, 0.4)) * (near ? 1 : 0.5));
  ctx.lineWidth = 9;
  const half = Math.min(sweep, Math.PI / 2);
  const over = Math.max(0, sweep - Math.PI / 2);
  const arc = (a0: number, a1: number): void => {
    ctx.beginPath();
    ctx.ellipse(0, 0, RO, RO * FLAT, ROLL, a0, a1);
    ctx.stroke();
  };
  if (near) arc(Math.PI / 2 - half, Math.PI / 2 + half);
  else if (over > 0) {
    arc(Math.PI, Math.PI + over);
    arc(TAU - over, TAU);
  }
  for (const m of motes) {
    const a = m.a + t * 0.1;
    if (Math.sin(a) >= 0 !== near) continue;
    const fromFront = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
    const on = clamp((sweep - fromFront) / 0.35);
    if (on <= 0) continue;
    const x = Math.cos(a) * RO * m.rr;
    const y = Math.sin(a) * RO * FLAT * m.rr + m.dy;
    ctx.fillStyle = spRgb(f.spore, Math.min(1, on * m.alpha * (near ? 0.7 : 0.3) * (0.55 + 0.6 * lightAt(t, 0.4 + fromFront * 0.15))));
    ctx.beginPath();
    ctx.arc(x * Math.cos(ROLL) - y * Math.sin(ROLL), x * Math.sin(ROLL) + y * Math.cos(ROLL), m.size * (near ? 1 : 0.75), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** The seed: a lumpy, wet organism with a faint green life in it, used up as the chambers leave it. */
function drawSeed(f: Frame): void {
  const { ctx, T, seed } = f;
  const [X, Y] = project(f, [0, seed.y, 0]);
  const L = SP_LIGHT;
  ctx.save();
  ctx.globalAlpha = seed.alpha;
  for (const [lx, ly, lr] of lumps) {
    const x = X + lx * seed.r;
    const y = Y + ly * seed.r;
    const r = lr * seed.r;
    const g = ctx.createRadialGradient(x + L[0] * r * 0.4, y + L[1] * r * 0.4, 0, x, y, r);
    g.addColorStop(0, spRgb(spTone(T, 0.5)));
    g.addColorStop(0.7, spRgb(spTone(T, 0.22)));
    g.addColorStop(1, spRgb(spTone(T, 0.1), 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = f.glow;
  spBlob(ctx, X, Y, seed.r * 1.2, seed.r * 1.2, T.green, 0.12 + 0.1 * Math.sin(f.t * 4));
  ctx.globalCompositeOperation = 'source-over';
  spBlob(ctx, X + L[0] * seed.r * 0.4, Y + L[1] * seed.r * 0.4, seed.r * 0.3, seed.r * 0.2, T.hi, 0.5);
  ctx.restore();
}

/**
 * One chamber: an irregular wall around a pit set back into it, sealed or open.
 * The far side of the volume shows the chambers' closed backs, faint.
 */
function drawChamber(f: Frame, c: GlobeChamber, v: V3, n: V3, grown: number): void {
  const { ctx, t, T } = f;
  const L = SP_LIGHT;
  const [X, Y, k] = project(f, v);
  const depth = clamp((v[2] + 1.15) / 2.3);
  const fog = (col: Rgb): Rgb => spMix(col, T.bg, (1 - depth) * 0.3);
  const front = n[2] > 0;
  const lam = clamp(spDot(n, L));
  const light = lightAt(t, c.arrives);
  // A shiver crosses the comb with the PATH line, left to right, each chamber jolting on its own.
  const sd = t - SHIVER_AT - (v[0] + 1.2) * 0.22;
  const shiver = Math.sin(sd * 38 + c.seed) * gauss(sd / 0.1);

  let green = 0;
  let amber = 0;
  let swell = 0;
  if (c.kind === 'green') {
    green = easeO(after(t, c.lit, 0.45)) * (0.75 + 0.25 * Math.sin(t * 2.4 + c.seed));
    swell = 0.08 * green;
  }
  if (c.kind === 'amber') {
    amber = easeO(after(t, c.lit, 0.4));
    swell = 0.1 * amber * (0.5 + 0.5 * Math.sin(((t - c.lit) * TAU) / 1.6));
  }
  const hatched = c.hatch !== null && t >= c.hatch;
  const bulging = c.hatch !== null && !hatched ? after(t, c.hatch - 0.5, 0.5) : 0;
  if (bulging > 0) {
    swell = 0.16 * bulging * bulging + 0.03 * Math.sin(t * 41) * bulging;
    green = 0.6 * bulging;
  }

  const px = X + shiver * 2.2;
  const py = Y + shiver * 1.2;
  // The face turns with the chamber, never all the way edge-on.
  const nn = spNorm([n[0], n[1], n[2] + (front ? 0.45 : -0.45)]);
  const ul = Math.hypot(nn[0], nn[2]) || 1;
  const u: V3 = [nn[2] / ul, 0, -nn[0] / ul];
  const w = spCross(nn, u);
  const rc = c.rc * GLOBE_R * k * f.breathe * (0.3 + 0.7 * grown) * (1 + swell);
  const twist = c.twist + shiver * 0.12;
  const poly = (scale: number, jitter: readonly number[], ox = 0, oy = 0): void => {
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = (j * TAU) / 6 + twist;
      const q = rc * scale * jitter[j]!;
      const x = px + ox + (u[0] * Math.cos(a) + w[0] * Math.sin(a)) * q;
      const y = py + oy + (u[1] * Math.cos(a) + w[1] * Math.sin(a)) * q;
      if (j) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.globalAlpha = f.shown * Math.min(1, grown * 1.6) * (0.22 + 0.78 * depth * depth);
  // The wall: chitin, lit from the upper left; the heartbeat's light runs along it.
  poly(1, c.wall);
  ctx.fillStyle = spRgb(fog(spLit(T, spTone(T, front ? 0.26 + 0.5 * lam : 0.12 + 0.16 * lam), light * 0.55)));
  ctx.fill();
  ctx.strokeStyle = spRgb(T.lo, 0.7);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = spRgb(T.chitin, (front ? 0.2 + 0.4 * lam : 0.12) * (0.3 + 0.7 * depth));
  ctx.lineWidth = 0.9;
  ctx.stroke();
  if (!front) {
    poly(0.55, c.pit);
    ctx.strokeStyle = spRgb(fog(spTone(T, 0.32)), 0.4);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (f.detail) {
    ctx.fillStyle = spRgb(T.lo, 0.6);
    for (const [a0, b0] of c.pores) {
      ctx.beginPath();
      ctx.arc(px + (u[0] * a0 + w[0] * b0) * rc * 0.86, py + (u[1] * a0 + w[1] * b0) * rc * 0.86, 0.55, 0, TAU);
      ctx.fill();
    }
  }
  // The pit is set back, so its floor slides toward the middle as the chamber turns away.
  let ox = -n[0] * rc * 0.45;
  let oy = -n[1] * rc * 0.45;
  let pit = 0.66;
  if (swell) {
    ox += n[0] * rc * 0.5 * swell;
    oy += n[1] * rc * 0.5 * swell;
    pit *= 1 + swell;
  }
  const mx = px + ox;
  const my = py + oy;

  if (hatched) {
    const since = t - c.hatch!;
    poly(pit, c.pit, ox, oy);
    ctx.fillStyle = spRgb(fog(spTone(T, 0.03)));
    ctx.fill();
    ctx.globalCompositeOperation = f.glow;
    spBlob(ctx, mx, my, rc * 0.8, rc * 0.8, T.green, (0.5 * Math.exp(-since / 0.9) + 0.06) * n[2]);
    ctx.globalCompositeOperation = 'source-over';
    // Torn flaps of membrane curled back at the rim.
    ctx.fillStyle = spRgb(fog(spTone(T, 0.32 + 0.3 * lam)));
    const at = (an: number, q: number): [number, number] => [
      mx + (u[0] * Math.cos(an) + w[0] * Math.sin(an)) * rc * q,
      my + (u[1] * Math.cos(an) + w[1] * Math.sin(an)) * rc * q,
    ];
    for (const j of [0, 2, 4]) {
      const a = (j * TAU) / 6 + twist + 0.2;
      const [x0, y0] = at(a, pit);
      const [x1, y1] = at(a + 0.7, pit);
      const [x2, y2] = at(a + 0.35, 0.36);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x1, y1);
      ctx.closePath();
      ctx.fill();
    }
    // And what spilled when it split.
    if (since < 0.45) {
      const out = since / 0.45;
      ctx.fillStyle = spRgb(spLit(T, spTone(T, 0.6), 0.6), 1 - out);
      for (let j = 0; j < 5; j++) {
        const a = c.seed + j * 1.3;
        ctx.beginPath();
        ctx.arc(mx + Math.cos(a) * rc * 1.7 * out, my + Math.sin(a) * rc * 1.7 * out + since * since * 30, 0.9, 0, TAU);
        ctx.fill();
      }
    }
  } else if (c.sealed) {
    // Sealed: a translucent membrane, its shine toward the light; what lives inside shows only as a shadow.
    const base = amber
      ? spMix(spTone(T, 0.34 + 0.32 * lam), f.amber, 0.75 * amber)
      : spLit(T, spTone(T, 0.34 + 0.32 * lam), green * 0.85 + light * 0.5 * n[2]);
    poly(pit, c.pit, ox, oy);
    const g = ctx.createRadialGradient(mx + L[0] * rc * 0.3, my + L[1] * rc * 0.3, 0, mx, my, rc * pit);
    g.addColorStop(0, spRgb(fog(spMix(base, T.hi, 0.25)), 0.92));
    g.addColorStop(1, spRgb(fog(spMix(base, T.lo, 0.35)), 0.92));
    ctx.fillStyle = g;
    ctx.fill();
    if (green > 0.02) spBlob(ctx, mx + Math.cos(c.seed) * rc * 0.1, my + Math.sin(c.seed) * rc * 0.1, rc * 0.34, rc * 0.2, T.lo, 0.22 * n[2]);
    ctx.globalCompositeOperation = f.glow;
    if (green > 0.02) spBlob(ctx, mx, my, rc * 1.5, rc * 1.5, T.green, (0.22 * green + (c.kind === 'green' ? 0.35 * light : 0)) * n[2]);
    if (amber > 0) spBlob(ctx, mx, my, rc * 1.7, rc * 1.7, f.amber, (0.22 + 0.16 * Math.sin(((t - c.lit) * TAU) / 1.6)) * amber * n[2]);
    ctx.globalCompositeOperation = 'source-over';
    if (amber > 0) {
      // The two awaiting you ripple once as they light, then on a slow clock while the splash idles.
      for (const d of [(t - c.lit) / 0.9, t > 3 ? ((t - 3) % 1.6) / 1 : -1]) {
        if (d < 0 || d > 1) continue;
        poly(1.1 + d * 1.5, c.wall);
        ctx.strokeStyle = spRgb(f.amber, 0.4 * (1 - d) * (1 - d));
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  } else {
    // Open: a dark pit whose floor lets the heartbeat's light through.
    poly(pit, c.pit, ox, oy);
    ctx.fillStyle = spRgb(fog(spLit(T, spTone(T, 0.07 + 0.1 * lam), light * n[2] * 1.1)));
    ctx.fill();
  }
  poly(pit, c.pit, ox, oy);
  ctx.strokeStyle = spRgb(T.hi, 0.22 * lam * depth);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Fresh comb is wet; the shine dries off it.
  const wet = 1 - after(t, c.grow + 0.3, 0.7);
  if (wet > 0) {
    ctx.fillStyle = spRgb(T.hi, 0.55 * wet * lam);
    ctx.beginPath();
    ctx.arc(px + L[0] * rc * 0.45, py + L[1] * rc * 0.45, rc * 0.13, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** A flyer at Home's size, larger in front of the volume; its turn read off its own path. */
function drawFlyer(f: Frame, i: number, spine: Spine, ps: number): void {
  const { ctx, t, T } = f;
  const at = flyerAt(i, t);
  const was = flyerAt(i, t - 0.03);
  const before = flyerAt(i, t - 0.09);
  const a1 = Math.atan2(at.y - was.y, at.x - was.x);
  const a0 = Math.atan2(was.y - before.y, was.x - before.x);
  const bend = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) / 0.06;
  const scale = MUTA_SCALE * (0.85 + 0.15 * (at.z + 1)) * mix(0.12, 1, at.grown);
  ctx.save();
  ctx.globalAlpha = at.alpha * (0.7 + (0.3 * (at.z + 1)) / 2);
  drawMuta(ctx, spine, t, i * 1.3, bend, scale, ps, T);
  ctx.restore();
}

/**
 * One frame at `t`, centred on the origin. The order is the depth: the creep,
 * the ring's far half, then the seed, the chambers and the flyers sorted back
 * to front, the ring's near half, and the spores drifting up. `ps` is device
 * pixels per unit, which sets the flyers' and the chambers' detail.
 */
export function drawGlobe(ctx: Ctx, t: number, palette: SwarmPalette, ps = 1): void {
  const T = toneOf(palette);
  const spines = spinesAt(t);
  const seed = seedAt(t);
  const shown = easeO(after(t, 0.3, 0.35));
  const f: Frame = {
    ctx,
    t,
    T,
    glow: T.dark ? 'lighter' : 'source-over',
    amber: rgbOf(palette.amber),
    spore: T.dark ? spMix(T.green, T.core, 0.3) : T.green,
    breathe: 1 + 0.01 * Math.sin((t * TAU) / 3.6) * sm(1.2, 2, t) + 0.012 * pulseAt(t),
    seed,
    shown,
    detail: ps > 0.45,
  };

  const spread = easeO(after(t, CREEP_AT, 0.9));
  creepPool(ctx, 0, GROUND, 110 + 170 * spread, 22 + 20 * spread, 0.42 * shown, T);
  drawRing(f, false);

  const items: [number, () => void][] = [];
  if (seed.alpha > 0.01) items.push([0, () => drawSeed(f)]);
  const seedV: V3 = [0, seed.y, 0];
  for (const c of chambers) {
    const g = after(t, c.grow, 0.55);
    if (g <= 0) continue;
    const grown = easeO(g);
    const { v, n } = chamberAt(c, t);
    // A chamber buds off the seed and travels out to its place in the volume.
    const at: V3 = [mix(seedV[0], v[0], grown), mix(seedV[1], v[1], grown), mix(seedV[2], v[2], grown)];
    items.push([at[2], () => drawChamber(f, c, at, n, grown)]);
  }
  for (let i = 0; i < FLYER_COUNT; i++) {
    if (t < flyerStart(i)) continue;
    items.push([flyerAt(i, t).depth, () => drawFlyer(f, i, spines[i]!, ps)]);
  }
  items.sort((a, b) => a[0] - b[0]).forEach(([, paint]) => paint());

  drawRing(f, true);
  ctx.save();
  ctx.globalCompositeOperation = f.glow;
  for (const p of spores) {
    const life = (t * p.speed + p.off) % 1;
    const alpha = Math.sin(life * Math.PI) * 0.35 * shown;
    if (alpha < 0.01) continue;
    ctx.fillStyle = spRgb(T.chitin, alpha);
    ctx.beginPath();
    ctx.arc(p.x + Math.sin(t * 0.6 + p.off * 9) * 6, GROUND + 10 - life * p.rise, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
