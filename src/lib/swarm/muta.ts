import { clamp, mix, sm, spBlob, spPath, spRng, spThorn, TAU } from '@lib/swarm/kit';
import { spMix, spRgb, spTone, type Tone } from '@lib/swarm/tone';

/**
 * The Brood's top-down mutalisk (HIVE-221), the flyer over Home's comb and
 * the splash globe.
 *
 * The artifact (`brood-v15.html`, lines 1209–1352) records one figure-eight
 * flight and replays it. Here every flyer owns its spine instead, simulated
 * live from the flyer's real head position: the same verlet body and
 * constraint loop, stiff through the neck and torso and looser down the tail,
 * so a turn swings the tail wide and lets it settle by momentum.
 */

/** A flyer's body: 34 nodes, as flat `[x0, y0, x1, y1, …]` arrays. */
export interface Spine {
  pos: Float64Array;
  /** Each node's position one substep ago, the verlet velocity. */
  prv: Float64Array;
  /** Time not yet stepped, under one substep. */
  acc: number;
  /** Where the head was last put. */
  hx: number;
  hy: number;
}

export const SPINE_NODES = 34;
export const SPINE_L = 3.5;

/** The simulation's fixed step, as the artifact's recording. */
const SUB = 1 / 120;
/** How far ahead the neck aims, the artifact's `P(t + 0.03)`, in substeps. */
const LEAD = 0.03 / SUB;

/** Stiffness down the spine (line 1216). */
const kAt = (i: number): number => (i < 13 ? 0.72 : 0.22 * Math.exp(-(i - 13) / 6) + 0.015);

/** A spine at `x, y`, its nodes laid straight back from `heading` (line 1217). */
export function createSpine(x: number, y: number, heading: number): Spine {
  const pos = new Float64Array(SPINE_NODES * 2);
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  for (let i = 0; i < SPINE_NODES; i++) {
    pos[i * 2] = x - c * SPINE_L * i;
    pos[i * 2 + 1] = y - s * SPINE_L * i;
  }
  return { pos, prv: pos.slice(), acc: 0, hx: x, hy: y };
}

/** One 1/120 s step with the head at `x, y`: lines 1221–1233. */
function substep(s: Spine, x: number, y: number): void {
  const { pos, prv } = s;
  prv[0] = pos[0]!;
  prv[1] = pos[1]!;
  pos[0] = x;
  pos[1] = y;
  for (let i = 1; i < SPINE_NODES; i++) {
    const ix = i * 2;
    const iy = ix + 1;
    let vx = pos[ix]! - prv[ix]!;
    let vy = pos[iy]! - prv[iy]!;
    const sx = pos[ix - 2]! - pos[ix]!;
    const sy = pos[iy - 2]! - pos[iy]!;
    const sl = Math.hypot(sx, sy) || 1;
    const ux = sx / sl;
    const uy = sy / sl;
    const par = vx * ux + vy * uy;
    const cp = i < 13 ? 0.2 : 0.03;
    vx = par * ux * 0.996 + (vx - par * ux) * (1 - cp);
    vy = par * uy * 0.996 + (vy - par * uy) * (1 - cp);
    prv[ix] = pos[ix]!;
    prv[iy] = pos[iy]!;
    pos[ix] = pos[ix]! + vx;
    pos[iy] = pos[iy]! + vy;
  }
  // The head's own heading, projected ahead, stands in for P(t + 0.03).
  const leadX = x + (x - prv[0]!) * LEAD;
  const leadY = y + (y - prv[1]!) * LEAD;
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < SPINE_NODES; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      const ax = pos[ix - 2]!;
      const ay = pos[iy - 2]!;
      const bx = i >= 2 ? pos[ix - 4]! : leadX;
      const by = i >= 2 ? pos[iy - 4]! : leadY;
      let fx = ax - bx;
      let fy = ay - by;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      const k = kAt(i);
      pos[ix] = pos[ix]! + (ax + fx * SPINE_L - pos[ix]!) * k;
      pos[iy] = pos[iy]! + (ay + fy * SPINE_L - pos[iy]!) * k;
      const ex = pos[ix]! - ax;
      const ey = pos[iy]! - ay;
      const el = Math.hypot(ex, ey) || 1;
      pos[ix] = ax + (ex / el) * SPINE_L;
      pos[iy] = ay + (ey / el) * SPINE_L;
    }
  }
}

/**
 * Advance the spine by `dt` with the head now at `x, y`. The time is cut into
 * fixed 1/120 s substeps, the head lerped across them from where it was last
 * put; what is left over waits for the next frame.
 */
export function stepSpine(s: Spine, x: number, y: number, dt: number): void {
  s.acc += dt;
  const n = Math.floor(s.acc / SUB + 1e-9);
  if (n <= 0) return;
  s.acc = Math.max(0, s.acc - n * SUB);
  const x0 = s.hx;
  const y0 = s.hy;
  for (let j = 1; j <= n; j++) {
    const k = j / n;
    substep(s, x0 + (x - x0) * k, y0 + (y - y0) * k);
  }
  s.hx = x;
  s.hy = y;
}

/** The spine's nodes as points, head first. */
export function spineNodes(s: Spine): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < SPINE_NODES; i++) out.push([s.pos[i * 2]!, s.pos[i * 2 + 1]!]);
  return out;
}

/**
 * Fly the spine along `path` for `seconds` at the fixed step, ending at
 * `path(seconds)`: a deterministic body for a still frame.
 */
export function warmSpine(s: Spine, path: (t: number) => [number, number], seconds: number): void {
  const steps = Math.round(seconds / SUB);
  for (let k = 1; k <= steps; k++) {
    const [x, y] = path(k * SUB);
    substep(s, x, y);
    s.hx = x;
    s.hy = y;
  }
  s.acc = 0;
}

/* ---- the anatomy, grown once on first draw (lines 1240–1244) ---- */

type Pt = [number, number];

interface Plate {
  u: number;
  len: number;
  wid: number;
  worn: boolean;
  spike?: boolean;
  scar: boolean;
  off: number;
  seed: number;
}

interface Wing {
  side: number;
  E: Pt;
  W: Pt;
  F: Pt[];
  B: Pt;
  tears: [number, number, number, number][];
  scars: [number, number, number, number][];
  veins: Pt[][];
  ph: number;
}

interface Anatomy {
  /** Back to front: the tail's plates first, so the neck's overlap them. */
  plates: Plate[];
  wings: [Wing, Wing];
}

let anatomy: Anatomy | null = null;

/** Seeded: nothing evenly spaced, nothing mirrored, and the same every run. */
function muAnatomy(): Anatomy {
  if (anatomy) return anatomy;
  const r = spRng(97);
  const R = (a: number, b: number): number => a + (b - a) * r();
  const plates: Plate[] = [];
  for (let u = 4.2; u < 12.8; u += R(0.8, 1.35)) {
    plates.push({ u, len: R(5.5, 8), wid: R(0.7, 0.95), worn: r() < 0.2, scar: r() < 0.3, off: R(-0.12, 0.12), seed: R(0, 50) });
  }
  for (let u = 13.4; u < 32.4; u += R(0.75, 1.3)) {
    plates.push({
      u, len: R(4.2, 5.6) * (1 - (u - 13) / 26), wid: R(0.8, 1), worn: r() < 0.22, spike: r() < 0.42,
      scar: r() < 0.15, off: R(-0.1, 0.1), seed: R(0, 50),
    });
  }
  const wing = (side: number): Wing => ({
    side,
    E: [15 + R(-2.5, 2.5), 5 + R(-2, 2)],
    W: [30 + R(-3, 3), -7 + R(-2.5, 2.5)],
    F: [[66 + R(-5, 6), 12 + R(-4, 5)], [53 + R(-5, 5), 33 + R(-4, 5)], [36 + R(-4, 4), 43 + R(-3, 4)], [19 + R(-3, 3), 40 + R(-3, 3)]],
    B: [3, 26 + R(-2, 2)],
    tears: Array.from({ length: 2 + ((r() * 2) | 0) }, () => [R(24, 56), R(14, 36), R(0.8, 2.2), R(0.4, 1)]),
    scars: Array.from({ length: 2 }, () => [R(20, 50), R(10, 34), R(-1, 1), R(5, 10)]),
    veins: Array.from({ length: 9 }, () => {
      const x0 = R(8, 58);
      const y0 = R(4, 30);
      const a = R(0.6, 2.2);
      return [
        [x0, y0],
        [x0 + Math.cos(a) * R(5, 10), y0 + Math.sin(a) * R(5, 10)],
        [x0 + Math.cos(a + R(-0.4, 0.4)) * R(10, 18), y0 + Math.sin(a + R(-0.4, 0.4)) * R(10, 18)],
      ];
    }),
    ph: R(0, 6),
  });
  const wings: [Wing, Wing] = [wing(-1), wing(1)];
  anatomy = { plates: plates.slice().sort((a, b) => b.u - a.u), wings };
  return anatomy;
}

/** The wing clock's loop and its angular rate (the artifact's `MU.TP`, `MU.w`). */
const TP = 12;
const W = TAU / TP;

/** Body half-widths down the first 13 nodes (lines 1251–1252). */
export const MU_BW = [1.3, 3.1, 4.1, 3.3, 2.6, 2.7, 3.4, 7.2, 9, 8.6, 7.3, 6, 4.8, 3.9];
export const muBW = (i: number): number =>
  i < 13
    ? mix(MU_BW[Math.floor(i)]!, MU_BW[Math.min(13, Math.floor(i) + 1)]!, i - Math.floor(i))
    : 3.9 * Math.max(0, 1 - (i - 13) / 21) ** 0.85 + 0.45 + 0.22 * Math.sin(i * 1.7);

interface WingState {
  th: number;
  thv: number;
  tilt: number;
  ext: number;
  proj: number;
  fold: number;
  lit: number;
  bank: number;
}

/**
 * Long glides, two deliberate strokes in each twelve seconds; banking tucks
 * the inside wing and opens the outside one (lines 1254–1261). `turn` is the
 * flyer's real angular rate, rad/s, where the artifact read its recording.
 */
export function muWingState(t: number, side: number, turn: number): WingState {
  const tm = ((t % TP) + TP) % TP;
  const dl = side > 0 ? 0.045 : 0;
  const amp = side > 0 ? 0.93 : 1;
  let env = 0;
  let ph = 0;
  for (const [a, b] of [[2.2, 3.4], [8.6, 9.8]] as const) {
    const e = sm(a, a + 0.25, tm - dl) * (1 - sm(b - 0.25, b, tm - dl));
    if (e > env) {
      env = e;
      ph = TAU * 1.55 * (tm - dl - a);
    }
  }
  const th = env * 0.7 * amp * Math.sin(ph) + (1 - env) * (0.06 + 0.03 * Math.sin(tm * W * 5 + side));
  const thv = env * 0.7 * amp * TAU * 1.55 * Math.cos(ph);
  const r = turn;
  const bank = clamp(r * 0.42, -0.6, 0.6);
  const tilt = th + (side < 0 ? bank : -bank);
  const ins = clamp((side > 0 ? r : -r) * 0.5, 0, 1);
  const outs = clamp((side > 0 ? -r : r) * 0.5, 0, 1);
  const ext = 1 - 0.13 * ins + 0.03 * outs;
  return {
    th, thv, tilt, ext,
    proj: Math.cos(tilt) * ext,
    fold: clamp(th, 0, 1) * 0.18 + (1 - ext) * 0.8,
    lit: 0.55 + 0.32 * Math.sin(tilt) * (side < 0 ? 1 : -0.7),
    bank,
  };
}

interface CreatureOptions {
  headAng?: number;
  shadow?: Pt;
}

/** The flyer, nodes in place (lines 1263–1352). */
function muCreature(
  ctx: CanvasRenderingContext2D, nodes: Pt[], t: number, s: number, turn: number, T: Tone, opt: CreatureOptions = {},
): void {
  const MU = muAnatomy();
  const det = s > 1.1;
  const M = nodes.length;
  const LS = [-0.6, -0.8] as const;
  const F: Pt[] = nodes.map((_n, i) => {
    const a = nodes[Math.max(0, i - 1)]!;
    const b = nodes[Math.min(M - 1, i + 1)]!;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const Lf: Pt[] = F.map(([fx, fy]) => [fy, -fx]);
  const at = (u: number) => {
    const i = Math.min(M - 2, Math.floor(u));
    const k = u - i;
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    return { p: [mix(a[0], b[0], k), mix(a[1], b[1], k)] as Pt, f: F[i]!, l: Lf[i]!, w: muBW(u) };
  };
  const headAng = opt.headAng ?? Math.atan2(F[1]![1], F[1]![0]);
  const edge = (i: number, sd: number): Pt => {
    const w = muBW(i) * (1 + (sd > 0 ? 0.04 : -0.03) * Math.sin(i * 2.3));
    return [nodes[i]![0] + Lf[i]![0] * w * sd, nodes[i]![1] + Lf[i]![1] * w * sd];
  };

  /* ---- wings ---- */
  const wingGeo = (wd: Wing) => {
    const st = muWingState(t, wd.side, turn);
    const o: Pt = wd.side < 0 ? Lf[8]! : [-Lf[8]![0], -Lf[8]![1]];
    const b: Pt = [-F[8]![0], -F[8]![1]];
    const S: Pt = [nodes[8]![0] + o[0] * muBW(8) * 0.55, nodes[8]![1] + o[1] * muBW(8) * 0.55];
    const WP = (x: number, y: number): Pt => {
      const xx = x * st.proj;
      const yy = y + st.fold * x * 0.3;
      return [S[0] + o[0] * xx + b[0] * yy, S[1] + o[1] * xx + b[1] * yy];
    };
    const rip = (x: number): number => 1.5 * Math.sin(TAU * 1.1 * t - x * 0.09 + wd.ph) * (x / 68);
    const E = WP(...wd.E);
    const Wp = WP(...wd.W);
    const tips = wd.F.map(([x, y], k) => WP(x, y - (k === 0 ? st.thv * 1.6 : st.thv * 0.6 * (1 - k / 4)) + rip(x)));
    const side = wd.side < 0 ? 1 : -1;
    return { st, o, b, WP, E, W: Wp, tips, S0: edge(7, side), Bp: edge(14, side), mid: edge(11, side), rip };
  };
  type WingGeo = ReturnType<typeof wingGeo>;
  // Traced on the context rather than kept in a Path2D: the same outline, and
  // the flyer draws wherever a 2D context does, test doubles included.
  const wingPath = (g: WingGeo): void => {
    ctx.beginPath();
    const [F1, F2, F3, F4] = g.tips as [Pt, Pt, Pt, Pt];
    ctx.moveTo(g.S0[0], g.S0[1]);
    ctx.lineTo(g.E[0], g.E[1]);
    ctx.lineTo(g.W[0], g.W[1]);
    ctx.quadraticCurveTo((g.W[0] + F1[0]) / 2 - g.b[0] * 5, (g.W[1] + F1[1]) / 2 - g.b[1] * 5, F1[0], F1[1]);
    for (const [a, c] of [[F1, F2], [F2, F3], [F3, F4], [F4, g.Bp]] as const) {
      const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as const;
      ctx.quadraticCurveTo(mix(m[0], g.W[0], 0.26), mix(m[1], g.W[1], 0.26), c[0], c[1]);
    }
    ctx.lineTo(g.mid[0], g.mid[1]);
    ctx.closePath();
  };
  const WG = MU.wings.map(wingGeo);

  /* ---- the shadow on the ground far below ---- */
  if (opt.shadow) {
    ctx.save();
    ctx.translate(opt.shadow[0], opt.shadow[1]);
    if (det && 'filter' in ctx) ctx.filter = 'blur(2.5px)';
    ctx.fillStyle = spRgb(T.lo, 0.38);
    for (const g of WG) {
      wingPath(g);
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 1; i < M; i++) {
      const q = edge(i, 1);
      if (i > 1) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    }
    for (let i = M - 1; i >= 1; i--) {
      const q = edge(i, -1);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const g of WG) {
    const wd = MU.wings[g === WG[0] ? 0 : 1];
    const lit = g.st.lit;
    const [F1, F2, F3, F4] = g.tips as [Pt, Pt, Pt, Pt];
    /* the membrane: leathery, cambered, letting the ground through */
    const gr = ctx.createLinearGradient(g.W[0], g.W[1], F3[0], F3[1]);
    gr.addColorStop(0, spRgb(spTone(T, lit * 0.95), 0.9));
    gr.addColorStop(0.55, spRgb(spTone(T, lit * 0.7), 0.8));
    gr.addColorStop(1, spRgb(spTone(T, lit * 0.52), 0.72));
    ctx.fillStyle = gr;
    wingPath(g);
    ctx.fill();
    ctx.save();
    wingPath(g);
    ctx.clip();
    for (const tp of g.tips) {
      ctx.beginPath();
      ctx.moveTo(g.W[0], g.W[1]);
      ctx.lineTo(tp[0], tp[1]);
      ctx.strokeStyle = spRgb(T.lo, 0.16);
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    spBlob(ctx, g.S0[0], g.S0[1], 18, 14, T.lo, 0.35);
    if (det) {
      for (const v of wd.veins) {
        spPath(ctx, v.map(([x, y]) => g.WP(x, y + g.rip(x))));
        ctx.strokeStyle = spRgb(T.lo, 0.32);
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
      for (const [x, y, a, l2] of wd.scars) {
        const p0 = g.WP(x, y);
        const p1 = g.WP(x + Math.cos(a) * l2, y + Math.sin(a) * l2);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.strokeStyle = spRgb(T.hi, 0.18);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      for (const [x, y, rr, ry] of wd.tears) {
        const p0 = g.WP(x, y + g.rip(x));
        ctx.beginPath();
        ctx.ellipse(p0[0], p0[1], rr * g.st.proj + 0.3, rr * ry, 0, 0, TAU);
        // The artifact's [16, 20, 40] is its dark stage's ground: the bg.
        ctx.fillStyle = spRgb(spMix(T.lo, T.bg, 0.5), 0.9);
        ctx.fill();
        ctx.strokeStyle = spRgb(spTone(T, 0.5), 0.6);
        ctx.lineWidth = 0.35;
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = spRgb(T.lo, 0.5);
    ctx.lineWidth = 0.6;
    wingPath(g);
    ctx.stroke();
    ctx.restore();
    /* the spars: a strong leading edge, thinner fingers, knuckled joints */
    const spar = (a: Pt, c: Pt, w0: number, w1: number, bend: number): void => {
      const m = [(a[0] + c[0]) / 2 - g.b[0] * bend, (a[1] + c[1]) / 2 - g.b[1] * bend] as const;
      const layers = [
        [spRgb(T.lo, 0.6), 1.35, 0.4],
        [spRgb(spTone(T, 0.52 + lit * 0.12)), 1, 0],
        [spRgb(T.hi, 0.38), 0.32, -0.35],
      ] as const;
      for (const [col, wf, ox] of layers) {
        ctx.beginPath();
        ctx.moveTo(a[0] + ox, a[1] + ox);
        ctx.quadraticCurveTo(m[0] + ox, m[1] + ox, c[0] + ox, c[1] + ox);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.5 / s, ((w0 + w1) / 2) * wf);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };
    spar(g.S0, g.E, 3.4, 3, -1.5);
    spar(g.E, g.W, 3, 2.4, 2);
    spar(g.W, F1, 2.1, 0.8, 9);
    spar(g.W, F2, 1.3, 0.5, 4);
    spar(g.W, F3, 1.1, 0.45, 3);
    spar(g.W, F4, 0.9, 0.4, 2);
    for (const j of [g.E, g.W]) {
      ctx.beginPath();
      ctx.ellipse(j[0], j[1], 2, 1.7, 0, 0, TAU);
      ctx.fillStyle = spRgb(spTone(T, 0.48));
      ctx.fill();
      ctx.fillStyle = spRgb(T.hi, 0.4);
      ctx.beginPath();
      ctx.arc(j[0] - 0.6, j[1] - 0.6, 0.6, 0, TAU);
      ctx.fill();
    }
    spThorn(ctx, g.W[0], g.W[1], Math.atan2(-g.b[1], -g.b[0]) + (wd.side < 0 ? -0.5 : 0.5), 4.2, 0.9, T, 0.3);
  }

  /* ---- hind legs, tucked back under the abdomen ---- */
  for (const sd of [1, -1]) {
    const hip = edge(12, sd * 0.85);
    const l = Lf[12]!;
    const b: Pt = [-F[12]![0], -F[12]![1]];
    const kn: Pt = [hip[0] + l[0] * sd * 3 + b[0] * 2, hip[1] + l[1] * sd * 3 + b[1] * 2];
    const ft: Pt = [kn[0] + b[0] * 4.5 - l[0] * sd, kn[1] + b[1] * 4.5 - l[1] * sd];
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hip[0], hip[1]);
    ctx.lineTo(kn[0], kn[1]);
    ctx.lineTo(ft[0], ft[1]);
    ctx.strokeStyle = spRgb(spTone(T, 0.3));
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (const k of [-0.5, 0, 0.5]) spThorn(ctx, ft[0], ft[1], Math.atan2(b[1], b[0]) + k, 2.2, 0.4, T, 0.25);
  }

  /* ---- the body: neck, torso and tail as one tissue, lit from above ---- */
  for (let i = 2; i < M - 1; i++) {
    const a0 = edge(i, 1);
    const a1 = edge(i + 1, 1);
    const b0 = edge(i, -1);
    const b1 = edge(i + 1, -1);
    const litL = Lf[i]![0] * LS[0] + Lf[i]![1] * LS[1] > 0;
    const midA: Pt = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
    const midB: Pt = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
    const gA = litL ? midA : midB;
    const gB = litL ? midB : midA;
    const g = ctx.createLinearGradient(gA[0], gA[1], gB[0], gB[1]);
    const soft = i > 13 ? 0.85 : 1;
    for (const [q, k] of [[0, 0.8], [0.3, 0.65], [0.72, 0.38], [1, 0.2]] as const) g.addColorStop(q, spRgb(spTone(T, k * soft)));
    const ex = F[i]![0] * 0.5;
    const ey = F[i]![1] * 0.5;
    ctx.beginPath();
    ctx.moveTo(a0[0] + ex, a0[1] + ey);
    ctx.lineTo(a1[0] - ex, a1[1] - ey);
    ctx.lineTo(b1[0] - ex, b1[1] - ey);
    ctx.lineTo(b0[0] + ex, b0[1] + ey);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  {
    const e = nodes[M - 1]!;
    const fe = F[M - 1]!;
    spThorn(ctx, e[0] - fe[0], e[1] - fe[1], Math.atan2(-fe[1], -fe[0]), 6, 1.1, T, 0.34);
  }
  if (det) {
    for (const sd of [0.55, -0.5]) {
      ctx.beginPath();
      for (let i = 13; i <= 27; i++) {
        const q = edge(i, sd);
        if (i > 13) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      }
      ctx.strokeStyle = spRgb(T.hi, 0.16);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 12; i < M; i++) {
      if (i > 12) ctx.lineTo(nodes[i]![0], nodes[i]![1]);
      else ctx.moveTo(nodes[i]![0], nodes[i]![1]);
    }
    ctx.strokeStyle = spRgb(T.lo, 0.3);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  /* soft tissue at the wing roots, where membrane meets body */
  for (const sd of [1, -1]) {
    const q = edge(8, sd);
    spBlob(ctx, q[0], q[1], 5, 4, spTone(T, 0.6), 0.28);
  }

  /* ---- plates: hard, uneven, overlapping toward the head, smaller toward the tip ---- */
  for (const pl of MU.plates) {
    const q = at(pl.u);
    const big = pl.u < 13 ? 1.35 : 1;
    const a = pl.len * big;
    const wv = q.w * pl.wid;
    const f = q.f;
    const l = q.l;
    const P2 = (x: number, y: number): Pt => [
      q.p[0] + f[0] * x + l[0] * (y + pl.off * wv),
      q.p[1] + f[1] * x + l[1] * (y + pl.off * wv),
    ];
    const pts = (
      [
        [a * 0.55, 0], [a * 0.35, wv * 0.92], [-a * 0.1, wv], [-a * 0.5, wv * 0.74], [-a * 0.36, 0],
        [-a * 0.5, -wv * (pl.worn ? 0.45 : 0.74)], [-a * 0.1, -wv], [a * 0.35, -wv * 0.9],
      ] as const
    ).map(([x, y]) => P2(x, y));
    if (pl.spike) {
      const s0 = P2(-a * 0.36, 0.7);
      const s1 = P2(-a * 0.95, 0);
      const s2 = P2(-a * 0.36, -0.7);
      ctx.beginPath();
      ctx.moveTo(...s0);
      ctx.lineTo(...s1);
      ctx.lineTo(...s2);
      ctx.closePath();
      ctx.fillStyle = spRgb(spTone(T, 0.36));
      ctx.fill();
    }
    ctx.save();
    ctx.translate(-f[0] * 0.9, -f[1] * 0.9);
    spPath(ctx, pts.slice(2, 7));
    ctx.strokeStyle = spRgb(T.lo, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    spPath(ctx, pts);
    ctx.closePath();
    const g = ctx.createLinearGradient(...P2(a * 0.55, wv * 0.5), ...P2(-a * 0.5, -wv * 0.3));
    g.addColorStop(0, spRgb(spTone(T, 0.9)));
    g.addColorStop(0.5, spRgb(spTone(T, 0.62)));
    g.addColorStop(1, spRgb(spTone(T, 0.35)));
    ctx.fillStyle = g;
    ctx.fill();
    if (s * a > 2.5) {
      ctx.fillStyle = spRgb(T.hi, 0.5);
      ctx.beginPath();
      ctx.arc(...P2(a * 0.25, wv * 0.35), Math.max(0.25, a * 0.05), 0, TAU);
      ctx.fill();
    }
    if (det && pl.scar) {
      const s0 = P2(a * 0.1, -wv * 0.5);
      const s1 = P2(-a * 0.25, wv * 0.3);
      ctx.beginPath();
      ctx.moveTo(...s0);
      ctx.lineTo(...s1);
      ctx.strokeStyle = spRgb(T.hi, 0.25);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }

  /* ---- the head: a sensing organ, layered armour, eyes sunk deep ---- */
  ctx.save();
  ctx.translate(nodes[0]![0], nodes[0]![1]);
  ctx.rotate(headAng);
  for (const sd of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(-10, sd * 3.6);
    ctx.quadraticCurveTo(-4, sd * 5, 1.2, sd * 1.2);
    ctx.quadraticCurveTo(-4, sd * 3.2, -10, sd * 2.4);
    ctx.closePath();
    ctx.fillStyle = spRgb(T.lo, 0.85);
    ctx.fill();
  }
  if (det) {
    for (const [y0, len, ph] of [[1.1, 5, 0], [-1.2, 5.6, 1.3], [2, 3.8, 2.4], [-2.1, 4.2, 3.1]] as const) {
      ctx.beginPath();
      ctx.moveTo(1, y0);
      ctx.quadraticCurveTo(1 + len * 0.5, y0 * 1.3 + Math.sin(t * 3.1 + ph) * 0.8, 1 + len, y0 * 1.6 + Math.sin(t * 2.3 + ph) * 1.2);
      ctx.strokeStyle = spRgb(spTone(T, 0.5), 0.6);
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
  }
  const plate = (pts: readonly Pt[], k0: number, k1: number): void => {
    spPath(ctx, pts);
    ctx.closePath();
    const g = ctx.createLinearGradient(pts[0]![0], -3, pts[0]![0] - 6, 3);
    g.addColorStop(0, spRgb(spTone(T, k0)));
    g.addColorStop(1, spRgb(spTone(T, k1)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = spRgb(T.lo, 0.45);
    ctx.lineWidth = 0.35;
    ctx.stroke();
  };
  plate([[-5, 0], [-6, 4.3], [-10, 4.8], [-13.5, 2.8], [-12.6, 0.4], [-14, -2.4], [-10.5, -4.6], [-6.5, -4.1]], 0.5, 0.18);
  plate([[0.4, 0], [-1.5, 3.3], [-6, 3.7], [-7.8, 1.5], [-7.2, -1.6], [-5.6, -3.5], [-1.4, -3.1]], 0.66, 0.26);
  plate([[3, 0], [1.6, 1.6], [-2.4, 1.9], [-2.9, 0], [-2.2, -1.8], [1.4, -1.5]], 0.72, 0.32);
  ctx.beginPath();
  ctx.ellipse(-4.2, 3.3, 0.9, 0.55, 0.3, 0, TAU);
  ctx.fillStyle = spRgb(spTone(T, 0.55));
  ctx.fill();
  for (const [x, y, rr] of [[-4.5, 2.6, 0.95], [-4.6, -2.75, 1.08], [-1.6, 1.9, 0.5], [-1.4, -2, 0.55]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, rr * 1.3, rr, 0, 0, TAU);
    ctx.fillStyle = spRgb(T.lo);
    ctx.fill();
    ctx.fillStyle = spRgb(spMix(T.hi, T.lo, 0.4), 0.5);
    ctx.beginPath();
    ctx.ellipse(x + rr * 0.2, y, rr * 0.6, rr * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = spRgb(T.hi, 0.75);
    ctx.beginPath();
    ctx.arc(x - rr * 0.3, y - rr * 0.3, Math.max(0.15, rr * 0.22), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The head's facing: the spine's first segment, smoothed with the way the
 * head is actually moving, as the artifact aimed it a beat ahead.
 */
function headingOf(s: Spine): number {
  const { pos, prv } = s;
  const nx = pos[0]! - pos[2]!;
  const ny = pos[1]! - pos[3]!;
  const nl = Math.hypot(nx, ny) || 1;
  const vx = pos[0]! - prv[0]!;
  const vy = pos[1]! - prv[1]!;
  const vl = Math.hypot(vx, vy);
  if (vl < 1e-6) return Math.atan2(ny, nx);
  return Math.atan2(ny / nl + vy / vl, nx / nl + vx / vl);
}

/**
 * Draw a flyer: translate to its head, scale by `scale`, and draw the body
 * from its spine relative to the head. `t + k` is the flyer's own wing clock,
 * `turn` its real angular rate (rad/s) for the bank, and `ps` the device
 * pixel scale, which with `scale` decides the detail level and line widths.
 */
export function drawMuta(
  ctx: CanvasRenderingContext2D,
  s: Spine,
  t: number,
  k: number,
  turn: number,
  scale: number,
  ps: number,
  T: Tone,
  shadow?: [number, number],
): void {
  const hx = s.pos[0]!;
  const hy = s.pos[1]!;
  const nodes = spineNodes(s).map(([x, y]): Pt => [x - hx, y - hy]);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(scale, scale);
  muCreature(ctx, nodes, t + k, ps * scale, turn, T, { headAng: headingOf(s), ...(shadow ? { shadow } : {}) });
  ctx.restore();
}
