import type { BroodCreature, BroodOptions } from '@lib/swarm/brood';
import {
  clamp,
  creepPool,
  ease,
  gauss,
  mix,
  seg,
  sm,
  spBlob,
  spN,
  spN2,
  spPath,
  spRng,
  TAU,
} from '@lib/swarm/kit';
import { spMix, spRgb, spTone, type Rgb, type Tone } from '@lib/swarm/tone';

/**
 * The overlord (HIVE-221): a heavy suspended organism. It hangs over a broken
 * comb, its appendages drifting, until its eyes unseal and it lowers a beam of
 * blue light over the ground. The beam sweeps, waits, sweeps on; every cell it
 * touches lights up empty. It looked. Nothing was there.
 *
 * Ported number for number from the artifact (`brood-v15.html`, lines
 * 656–944). Where it read `spT()` or the global `C`, it reads the `Tone`
 * argument, and its beam blue (`BL`) is the theme's `brand`, which is exactly
 * the artifact's literal on both built-in modes. Where it built a `Path2D`,
 * the outline is traced on the context (happy-dom has none), which draws the
 * same pixels.
 */

type Pair = [number, number];
type Behaviour = 'out' | 'hang' | 'curl';

/** Noise sampled round a circle: it never visibly repeats inside the ten
 * seconds, yet loops without a seam. */
export const ovLoop = (t: number, sd: number, f = 1): number => {
  const a = (TAU * t) / 10;
  return spN2(Math.cos(a) * f + sd * 3.1, Math.sin(a) * f + sd * 1.7, sd);
};
/** The ten-second clock, wrapped into [0, 10). */
export const ovM = (t: number): number => ((t % 10) + 10) % 10;

const lerp2 = (a: readonly number[], b: readonly number[], k: number): Pair => [mix(a[0]!, b[0]!, k), mix(a[1]!, b[1]!, k)];
const scale2 = (p: Pair, k: number): Pair => [p[0] * k, p[1] * k];

/* appendages: [attach angle in π, length, root width, behaviour, behind the body, twitch time] */
const TDEF: readonly (readonly [number, number, number, Behaviour, boolean, number | null])[] = [
  [0.17, 46, 4.6, 'out', false, 1.7],
  [0.29, 60, 6.6, 'hang', true, null],
  [0.39, 70, 7.6, 'hang', false, 6.9],
  [0.46, 52, 4.4, 'curl', true, null],
  [0.55, 64, 6, 'hang', false, 3.2],
  [0.63, 42, 3.6, 'curl', false, 8.4],
  [0.72, 57, 5.4, 'out', true, null],
  [0.85, 38, 3.2, 'out', false, 5.1],
];

/** The organism's growth, fixed once: every irregularity is seeded. */
export function growOverlord() {
  const r = spRng(23);
  const R = (a: number, b: number): number => a + (b - a) * r();
  const sg = (): number => (r() < 0.5 ? -1 : 1);
  const tents = TDEF.map(([a, len, w0, beh, back, tc]) => ({
    th: a * Math.PI + R(-0.05, 0.05),
    len: len * R(0.92, 1.08),
    w0: w0 * R(0.9, 1.1),
    beh,
    back,
    tc,
    seed: R(0, 100),
    fil: R(7, 15),
    wr: Array.from({ length: 5 + ((r() * 5) | 0) }, () => 0.03 + r() ** 2 * 0.7),
    bend: R(-0.035, 0.035),
    nod:
      r() < 0.6
        ? Array.from({ length: 2 + ((r() * 3) | 0) }, () => ({ v: R(0.25, 0.8), side: sg(), r: R(0.6, 1.4) }))
        : [],
    tdr: Array.from({ length: 1 + ((r() * 3) | 0) }, () => ({
      v: R(0.6, 0.9),
      len: R(6, 15),
      side: sg(),
      curl: R(0.25, 0.6) * sg(),
      seed: R(0, 50),
    })),
  }));
  const veins: { pts: Pair[]; w: number; ph: number }[] = [];
  const vtree = (x0: number, y0: number, a0: number, n: number, w: number, depth: number): void => {
    let x = x0;
    let y = y0;
    let a = a0;
    const pts: Pair[] = [[x, y]];
    for (let k = 0; k < n; k++) {
      a += R(-0.3, 0.3);
      x += Math.cos(a) * 0.06;
      y += Math.sin(a) * 0.06;
      pts.push([x, y]);
      if (depth < 1 && r() < 0.15) vtree(x, y, a + sg() * R(0.5, 1), Math.max(3, (n * 0.5) | 0), w * 0.6, depth + 1);
    }
    veins.push({ pts, w, ph: R(0, 10) });
  };
  for (let i = 0; i < 11; i++) {
    const a = R(0, TAU);
    const d = R(0.78, 0.95);
    vtree(Math.cos(a) * d, Math.sin(a) * d, a + (Math.PI / 2) * sg() + R(-0.5, 0.5), 7 + ((r() * 6) | 0), R(0.8, 1.4), 0);
  }
  const sacs = (
    [
      [-0.55, 0.05],
      [0.42, -0.32],
      [0.15, 0.3],
      [-0.2, -0.45],
      [0.62, 0.18],
    ] as const
  ).map(([x, y]) => ({
    x: x + R(-0.08, 0.08),
    y: y + R(-0.08, 0.08),
    rx: R(0.14, 0.26),
    ry: R(0.12, 0.22),
    sd: R(0, 30),
  }));
  const bands = Array.from({ length: 4 }, () => {
    const a0 = R(0, TAU);
    const a1 = a0 + R(0.7, 1.3);
    const am = (a0 + a1) / 2;
    const d = R(0.72, 0.88);
    return {
      p0: [Math.cos(a0) * d, Math.sin(a0) * d] as Pair,
      c: [Math.cos(am) * d * 1.08, Math.sin(am) * d * 1.08] as Pair,
      p1: [Math.cos(a1) * d, Math.sin(a1) * d] as Pair,
      w: R(6, 11),
    };
  });
  const pores = Array.from({ length: 36 }, () => {
    const a = R(0, TAU);
    const d = Math.sqrt(r()) * 0.85;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: R(0.25, 0.7) };
  });
  const growths = Array.from({ length: 5 }, () => ({ th: R(-2.9, -0.25), r: R(0.8, 2.2) }));
  const horns = Array.from({ length: 3 }, () => ({ th: R(-2.3, -0.9), len: R(4.5, 9), bend: R(-0.5, 0.5) }));
  const flaps = [
    {
      a0: Math.PI - 0.5,
      a1: Math.PI + 0.24,
      ribs: [
        [Math.PI - 0.78, 25],
        [Math.PI - 0.32, 31],
        [Math.PI + 0.14, 27],
        [Math.PI + 0.55, 17],
      ] as Pair[],
      seed: R(0, 40),
      ph: R(0, 6),
      side: -1,
      tw: [1.1, 5.8],
      fold: [0.9, 2.4] as Pair,
    },
    {
      a0: -0.34,
      a1: 0.16,
      ribs: [
        [-0.62, 18],
        [-0.16, 23],
        [0.28, 14],
      ] as Pair[],
      seed: R(0, 40),
      ph: R(0, 6),
      side: 1,
      tw: [3.4, 7.3],
      fold: [7.2, 8.7] as Pair,
    },
  ];
  /* the comb: a hex lattice whose shared corners are each pushed off true, so walls stay joined but no two cells match */
  const rr = 10;
  const vmap = new Map<string, Pair>();
  const vert = (x: number, y: number): Pair => {
    const k = `${Math.round(x * 10)},${Math.round(y * 10)}`;
    let p = vmap.get(k);
    if (!p) {
      p = [x + R(-2.3, 2.3), y + R(-2.5, 2.5)];
      vmap.set(k, p);
    }
    return p;
  };
  const comb: {
    u: number;
    v: number;
    f: number;
    bur: number;
    vs: Pair[];
    depth: number;
    elev: number;
    gap: number;
    coll: boolean;
    specks: [number, number, number][];
  }[] = [];
  for (let q = -8; q <= 8; q++) {
    for (let rw = -3; rw <= 3; rw++) {
      const u = rr * Math.sqrt(3) * (q + rw / 2);
      const v = rr * 1.5 * rw;
      const f = 1 - (u / 120) ** 2 - (v / 40) ** 2;
      if (f <= 0) continue;
      const bur = clamp(0.55 + spN2(u * 0.035 + 5, v * 0.06, 40) * 1.3);
      const drop = r();
      if (bur < 0.08 || drop < 0.03) continue;
      const vs: Pair[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        vs.push(vert(u + Math.cos(a) * rr, v + Math.sin(a) * rr));
      }
      comb.push({
        u,
        v,
        f,
        bur,
        vs,
        depth: R(1.6, 4.4),
        elev: spN2(u * 0.05, v * 0.08, 41) * 1.6,
        gap: r() < 0.16 ? (r() * 6) | 0 : -1,
        coll: r() < 0.07,
        specks: Array.from({ length: 4 }, (): [number, number, number] => [R(-0.55, 0.55), R(-0.45, 0.45), R(0.25, 0.75)]),
      });
    }
  }
  const motes = Array.from({ length: 38 }, () => ({ f0: r(), l: R(-1, 1), sp: sg(), sd: R(0, 60), r: R(0.25, 0.7) }));
  return { tents, veins, sacs, bands, pores, growths, horns, flaps, comb, motes };
}

type Anatomy = ReturnType<typeof growOverlord>;
type TentSeed = Anatomy['tents'][number];
type FlapSeed = Anatomy['flaps'][number];
type Node3 = [number, number, number];

let anatomy: Anatomy | null = null;

/** The overlord's anatomy, grown on first draw rather than at import. */
export function overlordAnatomy(): Anatomy {
  anatomy ??= growOverlord();
  return anatomy;
}

/** Trace a closed curve through the midpoints of `pts`, each point its control. */
function traceSmooth(ctx: CanvasRenderingContext2D, pts: readonly Pair[]): void {
  const n = pts.length;
  const m = (a: Pair, b: Pair): Pair => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s0 = m(pts[0]!, pts[1]!);
  ctx.beginPath();
  ctx.moveTo(s0[0], s0[1]);
  for (let i = 1; i <= n; i++) {
    const a = pts[i % n]!;
    const q = m(a, pts[(i + 1) % n]!);
    ctx.quadraticCurveTo(a[0], a[1], q[0], q[1]);
  }
  ctx.closePath();
}

const EYES: readonly (readonly [number, number, number])[] = [
  [2, 1, 4.3],
  [-7.5, -0.8, 2.6],
  [8.8, 1.6, 1.9],
  [-12, 1.8, 1.15],
];

function drawOverlord(ctx: CanvasRenderingContext2D, t: number, s: number, T: Tone, o: BroodOptions = {}): void {
  const OVS = overlordAnatomy();
  const det = s > 1.1;
  const G = o.G || 80;
  const layer = o.layer;
  const GM: GlobalCompositeOperation = T.dark ? 'lighter' : 'source-over';
  const w10 = TAU / 10;
  const BL = T.brand;
  const litB = (c: Rgb, g: number): Rgb =>
    g <= 0.002
      ? c
      : T.dark
        ? [Math.min(255, c[0] + BL[0] * g), Math.min(255, c[1] + BL[1] * g), Math.min(255, c[2] + BL[2] * g)]
        : spMix(c, BL, clamp(g * 0.7));
  /* the story's clock */
  const wAt = (t0: number): number => {
    const tt = ovM(t0);
    return sm(3.6, 4.3, tt) * (1 - sm(7.9, 8.9, tt));
  };
  const xbAt = (t0: number): number => {
    const tt = ovM(t0);
    return tt < 4
      ? -72
      : tt < 5.3
        ? mix(-72, -6, ease(seg(tt, 4, 5.3)))
        : tt < 6.5
          ? -6 + 2 * Math.sin((tt - 5.3) * 2.6)
          : tt < 7.9
            ? mix(-6 + 2 * Math.sin(1.2 * 2.6), 72, ease(seg(tt, 6.5, 7.9)))
            : tt < 9
              ? 72
              : mix(72, -72, ease(seg(tt, 9, 10)));
  };
  /* the body moves first; everything hanging from it answers late */
  const bxAt = (tt: number): number => 6 * Math.sin(w10 * tt) + 2 * ovLoop(tt, 3, 1) + xbAt(tt - 0.5) * 0.1 * wAt(tt - 0.5);
  const byAt = (tt: number): number => -34 + 4.5 * Math.sin(w10 * 2 * tt) + 1.5 * ovLoop(tt, 2, 1.2);
  const vxAt = (tt: number): number => (bxAt(tt) - bxAt(tt - 0.05)) / 0.05;
  const vyAt = (tt: number): number => (byAt(tt) - byAt(tt - 0.05)) / 0.05;
  const watch = wAt(t);
  const xb = xbAt(t);
  const bx = bxAt(t);
  const by = byAt(t);
  const tilt = 0.035 * Math.sin(w10 * t + 1) + vxAt(t - 0.2) * 0.004;
  const eyeOpen = (i: number): number =>
    sm(2.8 + i * 0.22, 4.1 + i * 0.18, ovM(t)) * (1 - sm(8.7 + i * 0.1, 9.7, ovM(t)));

  if (layer !== 'air') {
    creepPool(ctx, 0, G, 128, 26, 0.5, T);
    spBlob(ctx, bx, G + 1, 50 - (by + 34) * 0.4, 8, T.lo, 0.5, 0.5);
    const cells = OVS.comb.map((c) => {
      let L = 0;
      for (let k = 0; k < 9; k++) {
        const tau = 0.08 + k * 0.12;
        const tt = t - tau;
        const w = wAt(tt);
        if (w <= 0) continue;
        L = Math.max(
          L,
          w * Math.exp(-(((c.u - xbAt(tt)) / 22) ** 2 + (c.v / 24) ** 2)) * Math.exp(-(tau - 0.08) / 0.55),
        );
      }
      const D = watch * Math.exp(-(((c.u - xb) / 24) ** 2 + (c.v / 26) ** 2));
      const fade = Math.min(1, c.f * 1.8) * c.bur;
      const P = (p: Pair, sh = 0, dy = 0): Pair => [
        p[0] * (1 - sh) + c.u * sh,
        G + (p[1] * (1 - sh) + c.v * sh) * 0.36 + c.elev + dy,
      ];
      return { c, L, D, fade, rim: c.vs.map((p) => P(p)), flo: c.vs.map((p) => P(p, 0.26, c.depth)) };
    });
    for (const { rim, D, L, fade } of cells) {
      spPath(ctx, rim);
      ctx.closePath();
      ctx.fillStyle = spRgb(litB(spTone(T, 0.2), D * 0.5 + L * 0.2), fade);
      ctx.fill();
      ctx.strokeStyle = spRgb(litB(spTone(T, 0.2), D * 0.5), fade);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    for (const { c, L, D, fade, rim, flo } of cells) {
      ctx.save();
      spPath(ctx, rim);
      ctx.closePath();
      ctx.clip();
      spPath(ctx, flo);
      ctx.closePath();
      ctx.fillStyle = spRgb(litB(spTone(T, c.coll ? 0.24 : 0.07), L * 0.85 + D * 0.3), fade);
      ctx.fill();
      if (det && (L > 0.06 || c.coll)) {
        ctx.fillStyle = spRgb(c.coll ? spTone(T, 0.36) : litB(spTone(T, 0.18), L), fade * (c.coll ? 0.9 : 0.8));
        const cx2 = (flo[0]![0] + flo[3]![0]) / 2;
        const cy2 = (flo[1]![1] + flo[4]![1]) / 2;
        for (const [sx, sy, sr] of c.specks) {
          ctx.beginPath();
          ctx.ellipse(cx2 + sx * 12, cy2 + sy * 3.5, sr * (c.coll ? 2 : 1), sr * 0.6 * (c.coll ? 1.6 : 1), 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        if (k === c.gap) continue;
        const a = rim[k]!;
        const b = rim[(k + 1) % 6]!;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.strokeStyle = spRgb(litB(spTone(T, 0.4), D * 0.9 + L * 0.35), 0.8 * fade);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      for (const k of [3, 4]) {
        if (k === c.gap) continue;
        const a = rim[k]!;
        const b = rim[(k + 1) % 6]!;
        ctx.moveTo(a[0], a[1] - 0.35);
        ctx.lineTo(b[0], b[1] - 0.35);
      }
      ctx.strokeStyle = spRgb(T.hi, 0.2 * fade);
      ctx.lineWidth = 0.45;
      ctx.stroke();
      ctx.beginPath();
      for (const k of [0, 1]) {
        if (k === c.gap) continue;
        const a = rim[k]!;
        const b = rim[(k + 1) % 6]!;
        ctx.moveTo(a[0], a[1] + 0.6);
        ctx.lineTo(b[0], b[1] + 0.6);
      }
      ctx.strokeStyle = spRgb(T.lo, 0.45 * fade);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      if (c.gap >= 0 && det) {
        const a = rim[c.gap]!;
        const b = rim[(c.gap + 1) % 6]!;
        ctx.fillStyle = spRgb(spTone(T, 0.34), fade);
        for (let i = 0; i < 3; i++) {
          const k = 0.25 + i * 0.25;
          ctx.beginPath();
          ctx.ellipse(mix(a[0], b[0], k) + (i - 1) * 0.8, mix(a[1], b[1], k) + 0.8 + i * 0.3, 0.9, 0.5, 0, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = GM;
    spBlob(ctx, xb, G, 32, 9, BL, 0.3 * watch, 0.5);
    spBlob(ctx, xb, G, 74, 18, BL, 0.1 * watch);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (layer === 'ground') return;

  /* ---- the body: no circle anywhere. Heavier on the right, sagging below, dented where it is pulled ---- */
  const breath = 0.018 * Math.sin(w10 * 3 * t) + 0.012 * ovLoop(t, 5, 1.5);
  const lag = vyAt(t - 0.15) * 0.006;
  const body = (th: number): Pair => {
    const c = Math.cos(th);
    const sn = Math.sin(th);
    let k =
      1 +
      0.055 * Math.sin(2 * th + 0.7) +
      0.045 * Math.sin(3 * th + 1.9) +
      0.02 * Math.sin(4 * th + 4.1) +
      0.015 * Math.sin(5 * th + 2.6) +
      0.03 * spN2(c * 1.4, sn * 1.4, 13);
    k *= 1 + breath * (0.6 + 0.4 * Math.sin(th * 2 + 1));
    if (sn > 0) k *= 1 + lag * sn * sn;
    const x = c * (c > 0 ? 53 : 48) * k;
    let y = sn * 33 * k;
    if (sn > 0) y += 9 * sn ** 3 * (1 + 0.35 * c) + lag * 120 * sn * sn;
    else y -= 4 * sn * sn * (c > 0 ? 1.3 : 0.6);
    for (const tn of OVS.tents) {
      const d = Math.atan2(Math.sin(th - tn.th), Math.cos(th - tn.th));
      y -= 2.4 * gauss(d / 0.09);
    }
    return [x, y];
  };
  const NB = det ? 90 : 40;
  const bpts: Pair[] = [];
  for (let i = 0; i < NB; i++) bpts.push(body((i / NB) * TAU));
  const traceBody = (): void => traceSmooth(ctx, bpts);
  const lookX = clamp((xb - bx) / 60, -1, 1) * 2.5 * watch;
  const E: Pair = [6 + lookX, 23];
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(tilt);

  /* ---- appendages: each its own organ, on its own delayed clock ---- */
  const tents = OVS.tents.map((tn) => {
    const n = det ? 22 : 10;
    const root = body(tn.th);
    const side = Math.sign(Math.cos(tn.th)) || 1;
    let x = root[0] * 0.93;
    let y = root[1] * 0.93 - 1;
    let a = Math.PI / 2 + (tn.beh === 'out' ? -side * 0.55 : tn.beh === 'curl' ? side * 0.25 : -side * 0.12);
    const pts: Node3[] = [];
    for (let k = 0; k <= n; k++) {
      const v = k / n;
      pts.push([x, y, a]);
      let da = tn.bend + 0.13 * ovLoop(t - v * 1.3, tn.seed, 2.3) * (0.25 + v) + 0.05 * ovLoop(t - v * 0.6, tn.seed + 9, 4.5) * v;
      if (tn.beh === 'curl') da += -side * 0.11 * v ** 1.6;
      else da += (Math.PI / 2 - a) * (tn.beh === 'out' ? 0.045 : 0.018);
      da += -vxAt(t - v * 0.6) * 0.0025 * (0.3 + v);
      let sl = (tn.len / n) * (1 + vyAt(t - v * 0.5) * 0.004);
      if (tn.tc != null) {
        let dt = ovM(t - tn.tc - v * 0.3);
        if (dt > 5) dt -= 10;
        const c = gauss(dt / 0.22);
        da -= c * 0.45 * v * side;
        sl *= 1 - 0.16 * c;
      }
      a += da;
      x += Math.cos(a) * sl;
      y += Math.sin(a) * sl;
    }
    return { tn, pts, side };
  });
  const eyeW: Pair = [E[0] + EYES[0]![0], E[1] + EYES[0]![1]];
  const drawTent = ({ tn, pts }: { tn: TentSeed; pts: Node3[] }): void => {
    const n = pts.length - 1;
    const back = tn.back;
    const Wd = (k: number): number => {
      const v = k / n;
      return (tn.w0 * 1.45 * (1 - v) ** 0.95 * (1 + 0.16 * spN(v * 7 + tn.seed, 31)) + 0.22) * (1 + 0.7 * (1 - v) ** 7);
    };
    const Lp: Pair[] = [];
    const Rp: Pair[] = [];
    const ws: number[] = [];
    pts.forEach((p, k) => {
      const nx = -Math.sin(p[2]);
      const ny = Math.cos(p[2]);
      const w = Wd(k) / 2;
      ws.push(w * 2);
      Lp.push([p[0] - nx * w, p[1] - ny * w]);
      Rp.push([p[0] + nx * w, p[1] + ny * w]);
    });
    const tracePoly = (): void => {
      spPath(ctx, Lp);
      for (let k = n; k >= 0; k--) ctx.lineTo(Rp[k]![0], Rp[k]![1]);
      ctx.closePath();
    };
    const mid = pts[n >> 1]!;
    const blue = watch * clamp(1 - Math.hypot(mid[0] - eyeW[0], mid[1] - eyeW[1]) / 70) * 0.45;
    ctx.fillStyle = spRgb(litB(spTone(T, back ? 0.16 : 0.3), blue * 0.5));
    tracePoly();
    ctx.fill();
    ctx.save();
    tracePoly();
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const off = (k: number, f: number): Pair => {
      const p = pts[k]!;
      const nx = -Math.sin(p[2]);
      const ny = Math.cos(p[2]);
      return [p[0] + nx * ws[k]! * f, p[1] + ny * ws[k]! * f];
    };
    for (let c = 0; c < 3; c++) {
      const k0 = Math.floor((c * n) / 3);
      const k1 = Math.floor(((c + 1) * n) / 3);
      const wm = ws.slice(k0, k1 + 1).reduce((a, b) => a + b, 0) / (k1 - k0 + 1);
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        const p = off(k, 0.34);
        ctx[k === k0 ? 'moveTo' : 'lineTo'](p[0], p[1]);
      }
      ctx.strokeStyle = spRgb(T.lo, back ? 0.4 : 0.55);
      ctx.lineWidth = wm * 0.55;
      ctx.stroke();
      if (!back) {
        ctx.beginPath();
        for (let k = k0; k <= k1; k++) {
          const p = off(k, -0.3);
          ctx[k === k0 ? 'moveTo' : 'lineTo'](p[0], p[1]);
        }
        ctx.strokeStyle = spRgb(litB(spTone(T, 0.78), blue), 0.3);
        ctx.lineWidth = wm * 0.26;
        ctx.stroke();
      }
      if (c === 2) {
        ctx.beginPath();
        for (let k = k0; k <= k1; k++) ctx[k === k0 ? 'moveTo' : 'lineTo'](pts[k]![0], pts[k]![1]);
        ctx.strokeStyle = spRgb(T.hi, 0.12);
        ctx.lineWidth = wm * 0.4;
        ctx.stroke();
      }
    }
    ctx.restore();
    for (const v of tn.wr) {
      const k = Math.min(n - 1, Math.round(v * n));
      const p = pts[k]!;
      const tx = Math.cos(p[2]);
      const ty = Math.sin(p[2]);
      const w = ws[k]!;
      if (w < 1.4 && !det) continue;
      ctx.beginPath();
      ctx.moveTo(p[0] + tx * w * 0.15, p[1] + ty * w * 0.15);
      ctx.quadraticCurveTo(
        (p[0] + Rp[k]![0]) / 2 + tx * w * 0.25,
        (p[1] + Rp[k]![1]) / 2 + ty * w * 0.25,
        Rp[k]![0],
        Rp[k]![1],
      );
      ctx.strokeStyle = spRgb(T.lo, back ? 0.25 : 0.38);
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
    if (det && !back) {
      ctx.beginPath();
      for (let k = 1; k < Math.round(n * 0.7); k++) {
        const p = off(k, -0.12);
        ctx[k === 1 ? 'moveTo' : 'lineTo'](p[0], p[1]);
      }
      ctx.strokeStyle = spRgb(T.hi, 0.15);
      ctx.lineWidth = 0.35;
      ctx.stroke();
    }
    for (const nd of tn.nod) {
      const k = Math.round(nd.v * n);
      const q = off(k, 0.5 * nd.side);
      ctx.beginPath();
      ctx.ellipse(q[0], q[1], nd.r, nd.r * 0.8, pts[k]![2], 0, TAU);
      ctx.fillStyle = spRgb(litB(spTone(T, 0.48), blue * 1.4));
      ctx.fill();
      ctx.fillStyle = spRgb(T.hi, 0.35);
      ctx.beginPath();
      ctx.arc(q[0] - nd.r * 0.3, q[1] - nd.r * 0.3, nd.r * 0.3, 0, TAU);
      ctx.fill();
    }
    /* the tip thins to a filament, and near it hair-fine tendrils feel the air */
    {
      const e = pts[n]!;
      const m = det ? 7 : 3;
      let x = e[0];
      let y = e[1];
      let a = e[2];
      for (let j = 0; j < m; j++) {
        a += 0.35 * ovLoop(t - j * 0.12, tn.seed + 3, 5) * (j / m + 0.3);
        const nx2 = x + (Math.cos(a) * tn.fil) / m;
        const ny2 = y + (Math.sin(a) * tn.fil) / m;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx2, ny2);
        ctx.strokeStyle = spRgb(spTone(T, 0.42), 0.6 * (1 - j / m));
        ctx.lineWidth = Math.max(0.2, 0.45 * (1 - j / m));
        ctx.stroke();
        x = nx2;
        y = ny2;
      }
    }
    if (det) {
      for (const td of tn.tdr) {
        const k = Math.round(td.v * n);
        const b0 = off(k, 0.5 * td.side);
        let x = b0[0];
        let y = b0[1];
        let a = pts[k]![2] + td.side * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 6; j++) {
          a += td.curl * (0.6 + 0.4 * ovLoop(t - j * 0.1, td.seed, 3));
          x += (Math.cos(a) * td.len) / 6;
          y += (Math.sin(a) * td.len) / 6;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = spRgb(spTone(T, 0.44), 0.6);
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  };
  /* one fine tendril reaches across, coils round its neighbour, and lets go */
  const wrapTendril = (): void => {
    const A = tents[5]!;
    const B = tents[4]!;
    const na = A.pts.length - 1;
    const nb = B.pts.length - 1;
    const wr = sm(4.4, 5.6, ovM(t)) * (1 - sm(6.9, 8.1, ovM(t)));
    const b0 = A.pts[Math.round(na * 0.55)]!;
    const tg = B.pts[Math.round(nb * 0.5)]!;
    const bw = B.tn.w0 * 0.55 + 1.4;
    const pts: Pair[] = [];
    for (let j = 0; j <= 14; j++) {
      const f = j / 14;
      const fa = b0[2] + A.side * 0.8 + 0.4 * f;
      const free: Pair = [b0[0] + Math.cos(fa) * 14 * f + 2 * ovLoop(t - f, 77, 3) * f, b0[1] + Math.sin(fa) * 14 * f];
      const ph = f * TAU * 1.4;
      const wrap: Pair =
        f < 0.45
          ? [mix(b0[0], tg[0], f / 0.45), mix(b0[1], tg[1], f / 0.45)]
          : [tg[0] + Math.cos(ph) * bw, tg[1] + Math.sin(ph) * bw * 0.45 + (f - 0.45) * 3];
      pts.push([mix(free[0], wrap[0], wr), mix(free[1], wrap[1], wr)]);
    }
    spPath(ctx, pts);
    ctx.strokeStyle = spRgb(spTone(T, 0.46), 0.85);
    ctx.lineWidth = 0.45;
    ctx.stroke();
  };

  /* ---- control surfaces: thin muscle on struts, never a mirror pair ---- */
  const drawFlap = (F: FlapSeed): void => {
    const tm = ovM(t);
    const fold = sm(F.fold[0], F.fold[0] + 0.5, tm) * (1 - sm(F.fold[1] - 0.4, F.fold[1], tm));
    const midA = F.ribs[(F.ribs.length - 1) >> 1]![0];
    const ribs = F.ribs.map(([ang, len], i) => {
      const base = scale2(body(mix(F.a0, F.a1, (i + 0.5) / F.ribs.length)), 0.96);
      let a =
        ang +
        F.side * (0.14 * Math.sin(w10 * 5 * t + i * 0.55 + F.ph) + 0.06 * ovLoop(t - i * 0.08, F.seed + i, 3)) -
        vyAt(t - 0.12 - i * 0.05) * 0.03 * F.side;
      for (const tk of F.tw) {
        let d = tm - tk - i * 0.05;
        if (d < -5) d += 10;
        a += 0.2 * F.side * gauss(d / 0.1);
      }
      a = mix(a, midA, 0.55 * fold);
      const L = len * (1 - 0.15 * fold);
      return { base, tip: [base[0] + Math.cos(a) * L, base[1] + Math.sin(a) * L] as Pair, a };
    });
    const s0 = scale2(body(F.a0), 0.97);
    const s1 = scale2(body(F.a1), 0.97);
    const edge: Pair[] = [s0, ...ribs.map((rb) => rb.tip), s1];
    const tracePath = (): void => {
      ctx.beginPath();
      ctx.moveTo(s0[0], s0[1]);
      for (let i = 1; i < edge.length; i++) {
        const a = edge[i - 1]!;
        const b = edge[i]!;
        const m: Pair = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const pull = i === 1 || i === edge.length - 1 ? 0.1 : 0.3;
        const rip = 1.2 * Math.sin(w10 * 7 * t - i * 1.3 + F.ph) + 1.6 * spN(i * 2.3 + F.seed, 35);
        ctx.quadraticCurveTo(mix(m[0], 0, pull) + rip * 0.5, mix(m[1], 0, pull) + rip, b[0], b[1]);
      }
      ctx.closePath();
    };
    ctx.fillStyle = spRgb(litB(spTone(T, 0.34), watch * 0.1), 0.45);
    tracePath();
    ctx.fill();
    ctx.save();
    tracePath();
    ctx.clip();
    const bc: Pair = [(s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2];
    spBlob(ctx, bc[0], bc[1], 26, 20, T.lo, 0.45, 0.4);
    if (det) {
      ctx.beginPath();
      for (let i = 0; i < ribs.length - 1; i++) {
        for (const f of [0.33, 0.66]) {
          const b = lerp2(ribs[i]!.base, ribs[i + 1]!.base, f);
          const tp = lerp2(ribs[i]!.tip, ribs[i + 1]!.tip, f);
          ctx.moveTo(b[0], b[1]);
          ctx.quadraticCurveTo(mix(b[0], tp[0], 0.5) + 1, mix(b[1], tp[1], 0.5) - 1, tp[0], tp[1]);
        }
      }
      ctx.strokeStyle = spRgb(T.lo, 0.22);
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineCap = 'round';
    const strokes: readonly (readonly [string, number, number])[] = [
      [spRgb(T.lo, 0.25), 1.6, 0],
      [spRgb(spTone(T, 0.44)), 0.75, 0],
      [spRgb(T.hi, 0.14), 0.3, -0.4],
    ];
    for (const rb of ribs) {
      const m = lerp2(rb.base, rb.tip, 0.5);
      for (const [st, w, ox] of strokes) {
        ctx.beginPath();
        ctx.moveTo(rb.base[0] + ox, rb.base[1] + ox);
        ctx.quadraticCurveTo(m[0] + ox + 1.2 * F.side, m[1] + ox - 1.5, rb.tip[0] + ox, rb.tip[1] + ox);
        ctx.strokeStyle = st;
        ctx.lineWidth = w;
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.strokeStyle = spRgb(T.lo, 0.45);
    ctx.lineWidth = 0.9;
    tracePath();
    ctx.stroke();
    ctx.restore();
  };

  const drawBody = (): void => {
    ctx.save();
    ctx.scale(1.025, 1.03);
    ctx.fillStyle = spRgb(spTone(T, 0.55), 0.07);
    traceBody();
    ctx.fill();
    ctx.restore();
    {
      const g = ctx.createRadialGradient(-20, -18, 2, -4, 2, 74);
      for (const [p, k] of [
        [0, 0.6],
        [0.32, 0.42],
        [0.7, 0.2],
        [1, 0.07],
      ] as const) {
        g.addColorStop(p, spRgb(spTone(T, k)));
      }
      ctx.fillStyle = g;
      traceBody();
      ctx.fill();
    }
    ctx.save();
    traceBody();
    ctx.clip();
    const U = (x: number, y: number): Pair => [x * 50, y * 36];
    /* something inside: sacs that shift, never resolving into anything */
    for (const sc of OVS.sacs) {
      const p = U(sc.x + 0.05 * ovLoop(t, sc.sd, 1.4), sc.y + 0.05 * ovLoop(t, sc.sd + 5, 1.4));
      spBlob(ctx, p[0], p[1], sc.rx * 50, sc.ry * 36, T.lo, 0.24, 0.6);
      spBlob(ctx, p[0] - 2, p[1] - 2, sc.rx * 30, sc.ry * 20, T.hi, 0.06);
    }
    for (const b of OVS.bands) {
      const p0 = U(...b.p0);
      const c = U(...b.c);
      const p1 = U(...b.p1);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]);
      ctx.strokeStyle = spRgb(T.lo, 0.1);
      ctx.lineWidth = b.w;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p0[0] - 1, p0[1] - 1.5);
      ctx.quadraticCurveTo(c[0] - 1, c[1] - 1.5, p1[0] - 1, p1[1] - 1.5);
      ctx.strokeStyle = spRgb(T.hi, 0.05);
      ctx.lineWidth = b.w * 0.25;
      ctx.stroke();
    }
    /* vessels under the membrane: a soft shadow first, a fine core over it */
    for (const v of OVS.veins) {
      const P = v.pts.map(([x, y]) => U(x, y));
      const pul = 0.85 + 0.15 * ovLoop(t, v.ph, 2);
      spPath(ctx, P);
      ctx.strokeStyle = spRgb(T.lo, 0.06 * pul);
      ctx.lineWidth = v.w * 2.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (det || v.w > 1.1) {
        spPath(ctx, P);
        ctx.strokeStyle = spRgb(T.lo, 0.2 * pul);
        ctx.lineWidth = v.w * 0.5;
        ctx.stroke();
      }
    }
    if (det) {
      ctx.beginPath();
      for (const p of OVS.pores) {
        const q = U(p.x, p.y);
        ctx.moveTo(q[0] + p.r, q[1]);
        ctx.ellipse(q[0], q[1], p.r, p.r * 0.65, 0, 0, TAU);
      }
      ctx.fillStyle = spRgb(T.lo, 0.45);
      ctx.fill();
      ctx.beginPath();
      for (const p of OVS.pores) {
        const q = U(p.x, p.y);
        ctx.moveTo(q[0] - p.r, q[1] + p.r * 0.6);
        ctx.quadraticCurveTo(q[0], q[1] + p.r * 1.2, q[0] + p.r, q[1] + p.r * 0.6);
      }
      ctx.strokeStyle = spRgb(T.hi, 0.18);
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }
    /* folds where the appendages pull, and creases in the sagging underside */
    for (const tn of OVS.tents) {
      const rp = body(tn.th);
      for (const j of [-1, 0, 1]) {
        const a = -Math.PI / 2 + j * 0.55 + Math.atan2(rp[0], 400);
        const x0 = rp[0] + Math.cos(a) * 10;
        const y0 = rp[1] + Math.sin(a) * 10;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(rp[0] + j * 2, rp[1] - 5, rp[0] + Math.cos(a) * 2.5, rp[1] + Math.sin(a) * 2.5);
        ctx.strokeStyle = spRgb(T.lo, 0.32);
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
    }
    for (const [sc, ph] of [
      [0.88, 0],
      [0.79, 2],
      [0.94, 4],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const th = mix(0.22, 0.78, i / 12) * Math.PI;
        const p = body(th);
        const k = sc + 0.025 * spN(i * 0.9 + ph, 36);
        ctx[i ? 'lineTo' : 'moveTo'](p[0] * k, p[1] * k);
      }
      ctx.strokeStyle = spRgb(T.lo, 0.28);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    /* volume: edges fall into shadow, the lit edge catches a thin wet rim */
    {
      ctx.save();
      ctx.scale(1.45, 1);
      const g = ctx.createRadialGradient(-3, 2, 16, -2, 4, 46);
      g.addColorStop(0, spRgb(T.lo, 0));
      g.addColorStop(0.7, spRgb(T.lo, 0.12));
      g.addColorStop(1, spRgb(T.lo, 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(-60, -60, 120, 120);
      ctx.restore();
    }
    {
      const g = ctx.createLinearGradient(-52, -38, 8, 8);
      g.addColorStop(0, spRgb(T.hi, 0.34));
      g.addColorStop(1, spRgb(T.hi, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      traceBody();
      ctx.stroke();
    }
    spBlob(ctx, -22, -20, 14, 5, T.hi, 0.13);
    spBlob(ctx, -6, -27, 7, 2.2, T.hi, 0.18);
    if (det) {
      for (const [x, y, r] of [
        [-25, -21, 0.7],
        [-13, -26, 0.5],
        [-30, -12, 0.4],
      ] as const) {
        ctx.fillStyle = spRgb(T.hi, 0.5);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    {
      const g = ctx.createLinearGradient(0, 48, 0, 18);
      g.addColorStop(0, spRgb(T.lo, 0.55));
      g.addColorStop(1, spRgb(T.lo, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-60, 18, 120, 32);
    }
    ctx.globalCompositeOperation = GM;
    spBlob(ctx, eyeW[0], eyeW[1] + 6, 36, 18, BL, 0.24 * watch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    /* growths on the upper surface */
    for (const g of OVS.growths) {
      const p = scale2(body(g.th), 0.95);
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], g.r * 1.3, g.r * 0.6, Math.atan2(p[1], p[0]) + Math.PI / 2, 0, TAU);
      ctx.fillStyle = spRgb(spTone(T, 0.36), 0.8);
      ctx.fill();
      ctx.fillStyle = spRgb(T.hi, 0.16);
      ctx.beginPath();
      ctx.arc(p[0] - g.r * 0.3, p[1] - g.r * 0.3, g.r * 0.35, 0, TAU);
      ctx.fill();
    }
  };
  /* a sagging membrane hung between neighbouring roots */
  const drawSkirt = (): void => {
    const fr = tents
      .filter((x) => !x.tn.back)
      .map((x) => x.tn.th)
      .sort((a, b) => a - b);
    for (let i = 0; i < fr.length - 1; i++) {
      const a0 = fr[i]!;
      const a1 = fr[i + 1]!;
      if (a1 - a0 < 0.18) continue;
      const top: Pair[] = [];
      const bot: Pair[] = [];
      for (let j = 0; j <= 8; j++) {
        const f = j / 8;
        const p = scale2(body(mix(a0, a1, f)), 0.97);
        const sag = (5 + 2.5 * ovLoop(t - f * 0.4, i + 60, 2)) * Math.sin(Math.PI * f);
        top.push(p);
        bot.push([p[0], p[1] + sag]);
      }
      spPath(ctx, top);
      for (let j = 8; j >= 0; j--) ctx.lineTo(bot[j]![0], bot[j]![1]);
      ctx.closePath();
      ctx.fillStyle = spRgb(litB(spTone(T, 0.4), watch * 0.15), 0.32);
      ctx.fill();
      spPath(ctx, bot);
      ctx.strokeStyle = spRgb(T.lo, 0.35);
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (det) {
        ctx.beginPath();
        for (const j of [2, 5]) {
          ctx.moveTo(top[j]![0], top[j]![1]);
          ctx.lineTo(bot[j]![0] + 0.5, bot[j]![1]);
        }
        ctx.strokeStyle = spRgb(T.lo, 0.25);
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
    }
  };
  /* the sensory pit: wet organs recessed under a fold of tissue, each behind a film that draws back slowly */
  const drawEyes = (): void => {
    const pit: Pair[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const k = 1 + 0.1 * spN(i * 0.8, 37);
      pit.push([E[0] + Math.cos(a) * 15 * k, E[1] + Math.sin(a) * 6.6 * k + (Math.sin(a) < 0 ? 0 : 0.8)]);
    }
    spBlob(ctx, E[0], E[1] - 7, 20, 6, T.hi, 0.07);
    {
      const g = ctx.createRadialGradient(E[0], E[1] - 1, 2, E[0], E[1], 16);
      g.addColorStop(0, spRgb(T.lo, 0.92));
      g.addColorStop(0.6, spRgb(T.lo, 0.6));
      g.addColorStop(1, spRgb(T.lo, 0));
      ctx.fillStyle = g;
      traceSmooth(ctx, pit);
      ctx.fill();
    }
    ctx.save();
    traceSmooth(ctx, pit);
    ctx.clip();
    EYES.forEach(([ex, ey, r0], i) => {
      const op = eyeOpen(i);
      const r = r0 * (1 + 0.03 * ovLoop(t, i + 40, 4));
      const px = E[0] + ex;
      const py = E[1] + ey;
      const look = clamp((xb - bx) / 80, -1, 1) * watch;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.2, r * 1.05, 0, 0, TAU);
      ctx.fillStyle = spRgb(T.lo, 0.9);
      ctx.fill();
      {
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.35, 0, px, py, r);
        g.addColorStop(0, spRgb(litB(spTone(T, 0.34), op * 0.5)));
        g.addColorStop(0.6, spRgb(spTone(T, 0.12)));
        g.addColorStop(1, spRgb(T.lo));
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.9, 0, 0, TAU);
        ctx.fillStyle = g;
        ctx.fill();
      }
      if (op > 0.02) {
        ctx.globalCompositeOperation = GM;
        spBlob(ctx, px + look * r * 0.2, py, r * 0.95, r * 0.85, BL, (i ? 0.45 : 0.75) * op * (0.85 + 0.15 * watch));
        ctx.globalCompositeOperation = 'source-over';
        if (det && r > 2) {
          ctx.beginPath();
          ctx.ellipse(px, py, r * 0.62, r * 0.55, 0, 0, TAU);
          ctx.strokeStyle = spRgb(BL, 0.25 * op);
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
      const rp = r * 0.42 * (0.75 + 0.25 * ovLoop(t, i + 20, 3));
      const dx = look * r * 0.25 * op;
      ctx.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU;
        const rr = rp * (1 + 0.28 * spN(k * 1.7 + i * 5, 33));
        ctx[k ? 'lineTo' : 'moveTo'](px + dx + Math.cos(a) * rr * 1.5, py + Math.sin(a) * rr * 0.8);
      }
      ctx.closePath();
      ctx.fillStyle = spRgb(T.lo, 0.95);
      ctx.fill();
      if (op > 0.05) {
        ctx.fillStyle = spRgb(T.hi, 0.75 * op * (r > 2 ? 1 : 0.6));
        ctx.beginPath();
        ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.17, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px + r * 0.26, py - r * 0.12, r * 0.08, 0, TAU);
        ctx.fill();
      }
      /* the film: an irregular aperture opening in it, off-centre, rather than a lid */
      if (op < 0.995) {
        const traceFilm = (): void => {
          ctx.beginPath();
          ctx.ellipse(px, py, r * 1.3, r * 1.15, 0, 0, TAU);
          if (op > 0.01) {
            const cx2 = px + r * 0.2 * (1 - op);
            const cy2 = py + r * 0.1;
            for (let k = 0; k <= 12; k++) {
              const a = (-k / 12) * TAU;
              const rr = op * r * 1.15 * (1 + 0.18 * spN(k * 1.3 + i * 3, 34));
              ctx[k ? 'lineTo' : 'moveTo'](cx2 + Math.cos(a) * rr, cy2 + Math.sin(a) * rr * 0.9);
            }
            ctx.closePath();
          }
        };
        {
          const fg = ctx.createRadialGradient(px - r * 0.4, py - r * 0.45, 0, px, py, r * 1.3);
          fg.addColorStop(0, spRgb(spTone(T, 0.34)));
          fg.addColorStop(0.7, spRgb(spTone(T, 0.17)));
          fg.addColorStop(1, spRgb(spTone(T, 0.1)));
          ctx.fillStyle = fg;
        }
        traceFilm();
        ctx.fill('evenodd');
        if (op > 0.01) {
          ctx.strokeStyle = spRgb(T.lo, 0.4);
          ctx.lineWidth = 0.35;
          ctx.stroke();
        }
        ctx.fillStyle = spRgb(T.hi, 0.18 * (1 - op));
        ctx.beginPath();
        ctx.ellipse(px - r * 0.4, py - r * 0.4, r * 0.3, r * 0.15, -0.5, 0, TAU);
        ctx.fill();
      }
    });
    {
      const g = ctx.createLinearGradient(0, E[1] - 8, 0, E[1] + 1);
      g.addColorStop(0, spRgb(T.lo, 0.75));
      g.addColorStop(1, spRgb(T.lo, 0));
      ctx.fillStyle = g;
      ctx.fillRect(E[0] - 18, E[1] - 9, 36, 10);
    }
    ctx.restore();
    const upper = pit.filter((p) => p[1] <= E[1]).sort((a, b) => a[0] - b[0]);
    const lower = pit.filter((p) => p[1] > E[1]).sort((a, b) => a[0] - b[0]);
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(0, -1);
    spPath(ctx, upper.slice(2, -2));
    ctx.strokeStyle = spRgb(T.hi, 0.16);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
    spPath(ctx, lower.slice(1, -1));
    ctx.strokeStyle = spRgb(spTone(T, 0.34), 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };

  tents.filter((x) => x.tn.back).forEach(drawTent);
  OVS.flaps.forEach(drawFlap);
  drawBody();
  drawSkirt();
  drawEyes();
  tents.filter((x) => !x.tn.back).forEach(drawTent);
  if (det) wrapTendril();
  ctx.restore();

  /* ---- the beam: light thrown from the largest eye, thick with drifting particles ---- */
  if (watch > 0.01) {
    const O: Pair = [
      bx + Math.cos(tilt) * eyeW[0] - Math.sin(tilt) * eyeW[1],
      by + Math.sin(tilt) * eyeW[0] + Math.cos(tilt) * eyeW[1],
    ];
    const dx = xb - O[0];
    const dy = G - O[1];
    const Lb = Math.hypot(dx, dy);
    const d: Pair = [dx / Lb, dy / Lb];
    const nr: Pair = [-d[1], d[0]];
    const hwAt = (f: number): number => mix(2.4, 27, f);
    const edge = (f: number, sc: number, sgn: number): Pair => {
      const hw = hwAt(f) * sc * (1 + 0.09 * spN(f * 5 + t * 0.6 + sgn * 7, 30));
      return [O[0] + d[0] * Lb * f + nr[0] * hw * sgn, O[1] + d[1] * Lb * f + nr[1] * hw * sgn];
    };
    ctx.globalCompositeOperation = GM;
    for (const [sc, al] of [
      [1.45, 0.05],
      [1.05, 0.085],
      [0.62, 0.11],
      [0.26, 0.2],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const p = edge(i / 12, sc, 1);
        ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]);
      }
      for (let i = 12; i >= 0; i--) {
        const p = edge(i / 12, sc, -1);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(O[0], O[1], xb, G);
      g.addColorStop(0, spRgb(BL, al * watch * 1.6));
      g.addColorStop(0.35, spRgb(BL, al * watch));
      g.addColorStop(1, spRgb(BL, al * watch * 0.35));
      ctx.fillStyle = g;
      ctx.fill();
    }
    spBlob(ctx, O[0], O[1], 10, 10, BL, 0.55 * watch);
    spBlob(ctx, O[0], O[1], 40, 30, BL, 0.1 * watch);
    spBlob(ctx, bx, by + 30, 95, 60, BL, 0.04 * watch);
    if (det) {
      for (const m of OVS.motes) {
        const f = (((m.f0 + (m.sp * ovM(t)) / 10) % 1) + 1) % 1;
        const l = m.l + 0.12 * ovLoop(t, m.sd, 2);
        const hw = hwAt(f);
        const b = watch * clamp(1 - Math.abs(l)) * (0.35 + 0.65 * (1 - f));
        if (b < 0.02) continue;
        ctx.fillStyle = spRgb(BL, 0.8 * b);
        ctx.beginPath();
        ctx.arc(O[0] + d[0] * Lb * f + nr[0] * hw * l, O[1] + d[1] * Lb * f + nr[1] * hw * l, m.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

export const OVERLORD: BroodCreature = {
  dur: 10,
  rest: 5.9,
  box: [-118, -98, 236, 200],
  // The artifact's player hands `draw` its time already wrapped to the loop.
  draw: (ctx, t, s, T, o) => drawOverlord(ctx, ((t % 10) + 10) % 10, s, T, o),
};
