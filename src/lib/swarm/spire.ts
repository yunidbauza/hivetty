import type { BroodCreature } from '@lib/swarm/brood';
import {
  clamp,
  creepPool,
  ease,
  gauss,
  mix,
  seg,
  sm,
  spBack,
  spBlob,
  spCross,
  spDot,
  SP_LIGHT,
  spN,
  spNorm,
  spPath,
  spRng,
  spSub,
  spThorn,
  TAU,
  type V3,
} from '@lib/swarm/kit';
import { spLit, spMix, spRgb, spTone, type Rgb, type Tone } from '@lib/swarm/tone';

/**
 * The spire (HIVE-221): an alien botanical organism. A fibrous ribbed stalk on
 * heavy roots, a layered collar, and a dense bulb sealed by seven thick
 * petals. Pulses move through its vessels, the petals peel back, the bulb
 * lights from inside, the organism twists, a ring of light leaves the bulb,
 * and it seals again. Nothing hatches.
 *
 * Ported number for number from the artifact (`brood-v15.html`, lines
 * 343–655). Where it read `spT()` or the global `C`, it reads the `Tone`
 * argument; where it built a `Path2D`, the outline is traced on the context
 * (happy-dom has none), which draws the same pixels.
 */

type Pair = [number, number];
type P3 = [number, number, number];

/** The organism's growth, fixed once: every irregularity is seeded, so no two
 * petals, ribs or roots match and none of them flicker between frames. */
export function growSpire() {
  const r = spRng(7);
  const R = (a: number, b: number): number => a + (b - a) * r();
  const fibers = Array.from({ length: 34 }, () => ({
    th: R(-1.45, 1.45),
    ph: R(0, TAU),
    amp: R(0.03, 0.1),
    w: R(0.3, 1.1),
    groove: r() < 0.42,
    vessel: r() < 0.2,
    y0: R(0, 0.12),
    y1: R(0.8, 1),
  }));
  const bands: {
    u: number;
    th0: number;
    th1: number;
    tk: number;
    wob: number;
    tilt: number;
    tend: P3[];
  }[] = [];
  for (let u = R(0.05, 0.09); u < 0.9; u += R(0.065, 0.12)) {
    bands.push({
      u,
      th0: R(-1.5, -0.85),
      th1: R(0.85, 1.5),
      tk: R(1.4, 3.1),
      wob: R(0, 10),
      tilt: R(-0.05, 0.05),
      tend: Array.from({ length: 3 }, (): P3 => [R(0.15, 0.85), R(2, 4.5), R(-0.6, 0.6)]),
    });
  }
  const pores = Array.from({ length: 80 }, () => ({ th: R(-1.3, 1.3), u: R(0.04, 0.95), r: R(0.25, 0.85) }));
  const cracks = Array.from({ length: 10 }, () => {
    const pts: Pair[] = [];
    let a = R(-1.1, 1.1);
    let b = R(0.06, 0.9);
    for (let k = 0; k < 5; k++) {
      pts.push([a, b]);
      a += R(-0.1, 0.1);
      b += R(0.008, 0.025);
    }
    return pts;
  });
  const thorns = Array.from({ length: 13 }, () => ({
    u: R(0.08, 0.86),
    side: r() < 0.5 ? -1 : 1,
    len: R(3.5, 8),
    ang: R(-0.25, 0.25),
    w: R(1.1, 2),
  }));
  const roots = [-2.78, -2.3, -1.62, -0.98, -0.4, 0.28, 0.86, 1.42, 2.02, 2.62].map((b) => ({
    b: b + R(-0.12, 0.12),
    len: R(50, 86),
    w0: R(6, 10.5),
    arch: R(5, 17),
    sink: r() < 0.4,
    wig: R(0, 10),
    kinks: R(0.5, 1.6),
    branches: Array.from({ length: 1 + ((r() * 2) | 0) }, () => ({
      at: R(0.3, 0.72),
      side: r() < 0.5 ? -1 : 1,
      len: R(14, 30),
      w: R(0.25, 0.45),
      sink: r() < 0.6,
    })),
    rootlets: Array.from({ length: 3 + ((r() * 4) | 0) }, () => ({
      at: R(0.2, 0.95),
      side: r() < 0.5 ? -1 : 1,
      len: R(4, 11),
      curl: R(-1.6, 1.6),
    })),
    folds: Array.from({ length: 4 + ((r() * 5) | 0) }, () => R(0.06, 0.9)),
  }));
  const petals = Array.from({ length: 7 }, (_, i) => ({
    az: (i * TAU) / 7 + R(-0.13, 0.13),
    wf: R(0.86, 1.14),
    lf: R(0.92, 1.07),
    lift: R(-0.12, 0.16),
    curl: R(0.4, 0.62),
    lag: R(0, 0.38),
    seed: R(0, 100),
    veins: [0, R(-0.62, -0.42), R(0.42, 0.62), R(-0.86, -0.74), R(0.74, 0.86)],
    wr: Array.from({ length: 4 }, () => R(0.05, 0.24)),
  }));
  const vein = (lon0: number, lat0: number, n: number, w: number, dl: number): { pts: Pair[]; w: number } => {
    const pts: Pair[] = [];
    let lon = lon0;
    let lat = lat0;
    let d = dl;
    for (let k = 0; k < n; k++) {
      pts.push([lon, lat]);
      d += R(-0.025, 0.025);
      lon += d;
      lat += R(0.07, 0.12);
    }
    return { pts, w };
  };
  const bveins: { pts: Pair[]; w: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const v = vein(R(-3.1, 3.1), R(-1.3, -0.6), 16, R(0.7, 1.4), R(-0.04, 0.04));
    bveins.push(v);
    for (let j = 0; j < 2; j++) {
      const at = v.pts[2 + ((r() * 9) | 0)]!;
      bveins.push(vein(at[0], at[1], 6 + ((r() * 5) | 0), v.w * R(0.4, 0.6), R(-0.1, 0.1)));
    }
  }
  const cells = Array.from({ length: 46 }, () => ({ lon: R(-3.1, 3.1), lat: R(-1.2, 1.3), r: R(3, 8), k: r() }));
  const specks = Array.from({ length: 46 }, () => {
    const a = R(0, TAU);
    const d = Math.sqrt(r());
    return { x: Math.cos(a) * d * 108, y: Math.sin(a) * d * 22, r: R(0.4, 1.3), k: r() };
  });
  const motes = Array.from({ length: 28 }, () => ({
    x: R(-112, 112),
    y: R(-132, 30),
    ph: R(0, TAU),
    k: 1 + ((r() * 3) | 0),
    r: R(0.45, 1.3),
  }));
  return { fibers, bands, pores, cracks, thorns, roots, petals, bveins, cells, specks, motes };
}

type Anatomy = ReturnType<typeof growSpire>;
type PetalSeed = Anatomy['petals'][number];
type RootSeed = Anatomy['roots'][number];

let anatomy: Anatomy | null = null;

/** The spire's anatomy, grown on first draw rather than at import. */
export function spireAnatomy(): Anatomy {
  anatomy ??= growSpire();
  return anatomy;
}

interface PetalItem {
  kind: 'petal';
  pd: PetalSeed;
  V: V3[][];
  os: number[];
  z: number;
}
interface MemItem {
  kind: 'mem';
  q: V3[];
  a: number;
  z: number;
}

function drawSpire(ctx: CanvasRenderingContext2D, t: number, s: number, T: Tone): void {
  const SPS = spireAnatomy();
  const det = s > 1.1;
  const G = 68;
  const base = G - 8;
  const top = -12;
  const w9 = TAU / 9;
  const GM: GlobalCompositeOperation = T.dark ? 'lighter' : 'source-over';
  const openAt = (tt: number): number => spBack(seg(tt, 3, 4.9)) * (1 - ease(seg(tt, 6.8, 8.7)));
  const I = sm(3.4, 5, t) * (1 - sm(6.4, 8.2, t));
  const flash = gauss((t - 5.6) / 0.35);
  const lum = Math.min(1.25, I + 0.7 * flash);
  const tw = Math.sin(Math.PI * seg(t, 4.6, 7.4));
  const phi = (TAU * t) / 9 + 1.2 * tw;
  const breathe = Math.sin(t * w9 * 2);
  const pulses: P3[] = [
    [0.2, 2.4, 0.45],
    [1.7, 3.9, 0.6],
    [4.3, 5.7, 1],
  ];
  const un = (y: number): number => clamp((base - y) / (base - top));
  const bulge = (y: number): number => {
    let b = 0;
    for (const [a, e, k] of pulses) {
      const p = seg(t, a, e);
      if (p > 0 && p < 1) b += k * gauss((y - mix(base, top, ease(p))) / 8) * (1 - p * 0.3);
    }
    return b;
  };
  const prof = (u: number): number => (u < 0.55 ? mix(17, 13, ease(u / 0.55)) : mix(13, 21, ((u - 0.55) / 0.45) ** 2));
  const W = (y: number): number => {
    const u = un(y);
    return (
      prof(u) * (1 + 0.05 * spN(u * 7, 3) + 0.025 * spN(u * 19, 5)) * (1 + 0.012 * breathe) * (1 + 0.14 * bulge(y))
    );
  };
  const X = (y: number): number => {
    const u = un(y);
    return (Math.sin(w9 * 2 * t - u * 0.9) * 2 + 1.4 * tw * Math.sin(u * 3)) * u ** 1.3 + spN(u * 5, 9) * 0.8;
  };
  const S = (th: number, y: number): Pair => [X(y) + Math.sin(th) * W(y), y + Math.cos(th) * W(y) * 0.16];
  const climb = seg(t, 3.6, 5.2);
  const glowAt = (u: number, y: number): number =>
    Math.max(bulge(y) * 0.85, climb > 0 && climb < 1 ? gauss((u - climb) / 0.09) : 0, lum * 0.55 * u ** 1.5);

  /* ---- ground ---- */
  creepPool(ctx, 0, G, 122, 24, 0.55, T);
  if (det) {
    for (const p of SPS.specks) {
      ctx.fillStyle = spRgb(p.k < 0.6 ? T.lo : T.hi, p.k < 0.6 ? 0.4 : 0.12);
      ctx.beginPath();
      ctx.ellipse(p.x, G + p.y, p.r * 1.6, p.r * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
  spBlob(ctx, 0, G + 1, 54, 9, T.lo, 0.75, 0.5);
  ctx.globalCompositeOperation = GM;
  spBlob(ctx, 0, G, 108, 21, T.green, 0.22 * lum);
  ctx.globalCompositeOperation = 'source-over';

  /* ---- roots ---- */
  const roots = SPS.roots.map((rt) => {
    const c = Math.cos(rt.b);
    const sn = Math.sin(rt.b);
    const n = det ? 13 : 7;
    const p0: Pair = [X(base) + c * W(base) * 0.62, base + 3 + sn * 3];
    const p1: Pair = [c * rt.len, G + sn * 13 + (rt.sink ? 6 : 0)];
    const ct: Pair = [(p0[0] + p1[0]) / 2 + c * 6, Math.min(p0[1], p1[1]) - rt.arch];
    const pts: P3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = 1 - u;
      const wig = spN(u * 4 * rt.kinks + rt.wig, 2) * 3 * u;
      pts.push([
        v * v * p0[0] + 2 * v * u * ct[0] + u * u * p1[0] - sn * wig * 0.3,
        v * v * p0[1] + 2 * v * u * ct[1] + u * u * p1[1] + wig * 0.5,
        rt.w0 * (1 - u) ** 0.7 * (1 + 0.18 * spN(u * 6 + rt.wig, 4)) + 0.8,
      ]);
    }
    return { rt, pts, back: sn < -0.1 };
  });
  for (const { pts } of roots) {
    for (const p of pts) {
      if (p[1] > G - 5) spBlob(ctx, p[0], Math.max(p[1], G) + p[2] * 0.3, p[2] * 1.5, p[2] * 0.45, T.lo, 0.42);
    }
  }
  const TUBE: readonly (readonly [number, number, number, number, number])[] = [
    [0, 1, 0, 0, 0.06],
    [1, 0.76, -0.08, -0.14, 0.4],
    [2, 0.28, -0.2, -0.3, 0.86],
  ];
  const tube = (pts: P3[], back: boolean, lit: number): void => {
    ctx.lineCap = 'round';
    for (const [pi, wf, ox, oy, k] of TUBE) {
      if (back && pi === 2) continue;
      if (pi === 2) {
        const wm = pts.reduce((a, p) => a + p[2], 0) / pts.length;
        spPath(
          ctx,
          pts.slice(0, -1).map((p) => [p[0] + ox * p[2], p[1] + oy * p[2]]),
        );
        ctx.strokeStyle = spRgb(spLit(T, spMix(spTone(T, 0.45), spTone(T, k), 0.6), lit * 0.4));
        ctx.lineWidth = Math.max(0.3, wm * wf);
        ctx.lineJoin = 'round';
        ctx.stroke();
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const w = (a[2] + b[2]) / 2;
        const col = spTone(T, back ? k * 0.72 : k);
        ctx.strokeStyle = spRgb(col, 1);
        ctx.lineWidth = Math.max(pi ? 0.3 : 0.9 / s, w * wf + (pi ? 0 : 0.8));
        ctx.beginPath();
        ctx.moveTo(a[0] + ox * w, a[1] + oy * w);
        ctx.lineTo(b[0] + ox * w, b[1] + oy * w);
        ctx.stroke();
      }
    }
  };
  const sinkAt = (p: readonly number[], w: number): void => {
    spBlob(ctx, p[0]!, p[1]! + 0.5, w * 1.5, 3.6, T.ground, 0.95, 0.55);
    ctx.beginPath();
    ctx.ellipse(p[0]!, p[1]! + 0.6, w * 0.9, 1.6, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = spRgb(T.lo, 0.5);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  };
  const drawRoot = ({ rt, pts, back }: { rt: RootSeed; pts: P3[]; back: boolean }): void => {
    const lit = lum * 0.6;
    const at = (v: number): { x: number; y: number; w: number; tx: number; ty: number } => {
      const f = v * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const k = f - i;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { x: mix(a[0], b[0], k), y: mix(a[1], b[1], k), w: mix(a[2], b[2], k), tx: (b[0] - a[0]) / L, ty: (b[1] - a[1]) / L };
    };
    for (const br of rt.branches) {
      const o = at(br.at);
      const a0 = Math.atan2(o.ty, o.tx) + br.side * 0.62;
      const bp: P3[] = [];
      for (let i = 0; i <= 5; i++) {
        const u = i / 5;
        bp.push([
          o.x + Math.cos(a0) * br.len * u + spN(u * 3 + rt.wig, 7) * 1.5,
          Math.min(G + (br.sink ? 5 : 2), o.y + Math.sin(a0) * br.len * u * 0.5 + u * u * 6),
          mix(o.w * br.w + 0.6, 0.7, u),
        ]);
      }
      tube(bp, back, lit);
      if (br.sink) sinkAt(bp[5]!, bp[4]![2] + 1);
    }
    tube(pts, back, lit);
    for (const v of rt.folds) {
      const o = at(v);
      const px = -o.ty;
      const py = o.tx;
      const h = o.w * 0.46;
      ctx.beginPath();
      ctx.moveTo(o.x - px * h, o.y - py * h);
      ctx.quadraticCurveTo(o.x + o.tx * o.w * 0.25, o.y + o.ty * o.w * 0.25, o.x + px * h, o.y + py * h);
      ctx.strokeStyle = spRgb(T.lo, 0.55);
      ctx.lineWidth = 0.7;
      ctx.stroke();
      if (!back) {
        const dx = o.tx * 0.7;
        const dy = o.ty * 0.7;
        ctx.beginPath();
        ctx.moveTo(o.x - px * h + dx, o.y - py * h + dy);
        ctx.quadraticCurveTo(o.x + o.tx * o.w * 0.25 + dx, o.y + o.ty * o.w * 0.25 + dy, o.x + px * h + dx, o.y + py * h + dy);
        ctx.strokeStyle = spRgb(T.hi, 0.22);
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
    }
    if (det && !back) {
      ctx.beginPath();
      for (let v = 0.18; v <= 0.72; v += 0.06) {
        const o = at(v);
        if (v < 0.2) ctx.moveTo(o.x + o.ty * o.w * 0.22, o.y - o.tx * o.w * 0.22);
        else ctx.lineTo(o.x + o.ty * o.w * 0.22, o.y - o.tx * o.w * 0.22);
      }
      ctx.strokeStyle = spRgb(T.hi, 0.3);
      ctx.lineWidth = 0.4;
      ctx.stroke();
      for (const rl of rt.rootlets) {
        const o = at(rl.at);
        let a = Math.atan2(o.ty, o.tx) + rl.side * 1.2;
        let x = o.x - o.ty * rl.side * o.w * 0.4;
        let y = o.y + o.tx * rl.side * o.w * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          a += rl.curl * 0.4;
          x += (Math.cos(a) * rl.len) / 4;
          y += (Math.sin(a) * rl.len) / 4;
          ctx.lineTo(x, Math.min(y, G + 3));
        }
        ctx.strokeStyle = spRgb(spTone(T, 0.3), 0.85);
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }
    }
    const e = pts[pts.length - 1]!;
    const d = pts[pts.length - 2]!;
    if (rt.sink) sinkAt(e, rt.w0 * 0.35 + 1);
    else spThorn(ctx, e[0], e[1], Math.atan2(e[1] - d[1], e[0] - d[0]) + 0.35 * Math.sign(Math.cos(rt.b)), 5, 1, T, 0.28);
  };
  roots.filter((rt) => rt.back).forEach(drawRoot);

  /* ---- stalk: thorns under it, then the shaded body in slices ---- */
  for (const th of SPS.thorns) {
    const y = mix(base, top, th.u);
    spThorn(ctx, X(y) + th.side * W(y) * 0.9, y, (th.side > 0 ? -0.55 : Math.PI + 0.55) + th.ang * th.side, th.len, th.w, T, 0.32);
  }
  const step = det ? 1.5 : 3;
  const ys: number[] = [];
  for (let y = base; y > top; y -= step) ys.push(y);
  ys.push(top);
  const STOPS: readonly Pair[] = [
    [0, 0.3],
    [0.14, 0.7],
    [0.42, 0.5],
    [0.78, 0.19],
    [0.95, 0.1],
    [1, 0.22],
  ];
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i]!;
    const y1 = ys[i + 1]!;
    const x0 = X(y0);
    const x1 = X(y1);
    const w0 = W(y0);
    const w1 = W(y1);
    const xm = (x0 + x1) / 2;
    const wm = (w0 + w1) / 2;
    const g = ctx.createLinearGradient(xm - wm, 0, xm + wm, 0);
    STOPS.forEach(([p, k]) => g.addColorStop(p, spRgb(spTone(T, k))));
    ctx.beginPath();
    ctx.moveTo(x0 - w0, y0 + 0.5);
    ctx.lineTo(x1 - w1, y1 - 0.5);
    ctx.lineTo(x1 + w1, y1 - 0.5);
    ctx.lineTo(x0 + w0, y0 + 0.5);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  // The silhouette, traced on the context where the artifact kept a Path2D.
  const sil = (): void => {
    ctx.beginPath();
    ys.forEach((y, i) => {
      if (i) ctx.lineTo(X(y) - W(y), y);
      else ctx.moveTo(X(y) - W(y), y);
    });
    for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(X(ys[i]!) + W(ys[i]!), ys[i]!);
    ctx.closePath();
  };
  ctx.save();
  sil();
  ctx.clip();
  if (det) {
    for (const f of SPS.fibers) {
      const pts: Pair[] = [];
      for (let u = f.y0; u <= f.y1 + 1e-6; u += 0.035) {
        const y = mix(base, top, u);
        pts.push(S(f.th + f.amp * Math.sin(u * 4.5 + f.ph) + 0.18 * tw * u, y));
      }
      const face = Math.max(0, Math.cos(f.th));
      if (!f.groove) {
        ctx.save();
        ctx.translate(0.5, 0.3);
        spPath(ctx, pts);
        ctx.strokeStyle = spRgb(T.lo, 0.3 * face);
        ctx.lineWidth = f.w * 0.6;
        ctx.stroke();
        ctx.restore();
      }
      spPath(ctx, pts);
      ctx.strokeStyle = f.groove ? spRgb(T.lo, 0.5 * face) : spRgb(T.hi, 0.26 * face);
      ctx.lineWidth = f.w * 0.55;
      ctx.stroke();
    }
    ctx.beginPath();
    for (const p of SPS.pores) {
      const y = mix(base, top, p.u);
      const q = S(p.th, y);
      ctx.moveTo(q[0] + p.r, q[1]);
      ctx.ellipse(q[0], q[1], p.r, p.r * 0.6, 0, 0, TAU);
    }
    ctx.fillStyle = spRgb(T.lo, 0.5);
    ctx.fill();
    ctx.beginPath();
    for (const p of SPS.pores) {
      const y = mix(base, top, p.u);
      const q = S(p.th, y);
      ctx.moveTo(q[0] - p.r, q[1] + p.r * 0.5);
      ctx.quadraticCurveTo(q[0], q[1] + p.r * 1.1, q[0] + p.r, q[1] + p.r * 0.5);
    }
    ctx.strokeStyle = spRgb(T.hi, 0.22);
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.beginPath();
    for (const ck of SPS.cracks) {
      ck.forEach(([th, u], i) => {
        const q = S(th, mix(base, top, u));
        if (i) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
      });
    }
    ctx.strokeStyle = spRgb(T.lo, 0.6);
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  /* pulses: light moving through the tissue and its vessels, not over it */
  ctx.globalCompositeOperation = GM;
  for (const [a, e, k] of pulses) {
    const p = seg(t, a, e);
    if (p <= 0 || p >= 1) continue;
    const yp = mix(base, top, ease(p));
    const al = k * (1 - p * 0.3);
    spBlob(ctx, X(yp), yp, W(yp) * 1.5, 9, T.green, 0.36 * al, 0.4);
    if (det) {
      for (const f of SPS.fibers) {
        if (!f.vessel) continue;
        const pts: Pair[] = [];
        for (let y = yp + 12; y >= yp - 12; y -= 2) pts.push(S(f.th + f.amp * Math.sin(un(y) * 4.5 + f.ph), y));
        spPath(ctx, pts);
        ctx.strokeStyle = spRgb(T.green, 0.5 * al);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }
  }
  spBlob(ctx, X(top), top, W(top) * 1.6, 26, T.green, 0.3 * lum);
  ctx.globalCompositeOperation = 'source-over';
  {
    const g = ctx.createLinearGradient(0, top, 0, top + 18);
    g.addColorStop(0, spRgb(T.lo, 0.7));
    g.addColorStop(1, spRgb(T.lo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-60, top, 120, 18);
  }
  {
    const g = ctx.createLinearGradient(0, base, 0, base - 12);
    g.addColorStop(0, spRgb(T.lo, 0.55));
    g.addColorStop(1, spRgb(T.lo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-60, base - 12, 120, 13);
  }
  ctx.restore();
  ctx.strokeStyle = spRgb(T.lo, 0.6);
  ctx.lineWidth = Math.max(0.9 / s, 0.9);
  sil();
  ctx.stroke();
  /* growth bands: raised, partial, uneven; they catch the light one by one */
  for (const b of SPS.bands) {
    const yb = mix(base, top, b.u);
    const wb = W(yb);
    const xb = X(yb);
    const n = det ? 18 : 8;
    const up: Pair[] = [];
    const lo: Pair[] = [];
    for (let i = 0; i <= n; i++) {
      const th = mix(b.th0, b.th1, i / n);
      const tk = b.tk * Math.sin((Math.PI * i) / n) ** 0.6 * (1 + 0.25 * spN(th * 3 + b.wob));
      const yy = yb + Math.cos(th) * wb * 0.16 + spN(th * 4 + b.wob, 1) * 0.6 + b.tilt * Math.sin(th) * wb;
      const x = xb + Math.sin(th) * wb * 1.03;
      up.push([x, yy - tk / 2]);
      lo.push([x, yy + tk / 2]);
    }
    ctx.save();
    ctx.translate(0.5, 0.9);
    spPath(ctx, lo);
    ctx.strokeStyle = spRgb(T.lo, 0.5);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
    spPath(ctx, up);
    for (let i = lo.length - 1; i >= 0; i--) ctx.lineTo(lo[i]![0], lo[i]![1]);
    ctx.closePath();
    let g = ctx.createLinearGradient(0, yb - b.tk, 0, yb + b.tk + wb * 0.16);
    g.addColorStop(0, spRgb(spTone(T, 0.78)));
    g.addColorStop(0.5, spRgb(spTone(T, 0.48)));
    g.addColorStop(1, spRgb(spTone(T, 0.16)));
    ctx.fillStyle = g;
    ctx.fill();
    g = ctx.createLinearGradient(xb - wb, 0, xb + wb, 0);
    g.addColorStop(0, spRgb(T.lo, 0));
    g.addColorStop(0.55, spRgb(T.lo, 0.05));
    g.addColorStop(1, spRgb(T.lo, 0.6));
    ctx.fillStyle = g;
    ctx.fill();
    const gl = glowAt(b.u, yb);
    if (gl > 0.03) {
      ctx.globalCompositeOperation = GM;
      ctx.fillStyle = spRgb(T.green, 0.5 * gl);
      ctx.fill();
      spBlob(ctx, xb, yb, wb * 1.1, 5, T.green, 0.2 * gl);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (det) {
      ctx.beginPath();
      for (const [f, len, bend] of b.tend) {
        const p = lo[Math.round(f * n)]!;
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(p[0] + bend * 2, p[1] + len * 0.5, p[0] + bend * 3, p[1] + len);
        ctx.moveTo(p[0] + bend * 1.5, p[1] + len * 0.5);
        ctx.lineTo(p[0] + bend * 1.5 + 1.4, p[1] + len * 0.85);
      }
      ctx.strokeStyle = spRgb(T.lo, 0.45);
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
  }
  /* the spiral: two ridges grown into the stalk, tapering where they wrap out of sight */
  for (let j = 0; j < 2; j++) {
    const pts: [number, number, number, number, number, number][] = [];
    for (let y = base - 4; y >= top + 6; y -= det ? 1.5 : 3) {
      const a = y * 0.07 + phi + j * Math.PI + 0.3 * spN(y * 0.05, j + 1);
      const z = Math.cos(a);
      const w = W(y);
      pts.push([X(y) + Math.sin(a) * w * 0.99, y + z * w * 0.16, (1.7 + 0.8 * spN(y * 0.11 + j * 4, 6)) * clamp(z * 3), z, Math.sin(a), y]);
    }
    ctx.lineCap = 'round';
    for (const pass of [0, 1, 2]) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const th = (a[2] + b[2]) / 2;
        if (a[3] < 0 || b[3] < 0 || th < 0.05) continue;
        ctx.beginPath();
        if (pass === 0) {
          ctx.moveTo(a[0] + 0.7, a[1] + 0.9);
          ctx.lineTo(b[0] + 0.7, b[1] + 0.9);
          ctx.strokeStyle = spRgb(T.lo, 0.55);
          ctx.lineWidth = th * 2 + 1.1;
        } else if (pass === 1) {
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = spRgb(spLit(T, spTone(T, 0.34 - 0.24 * b[4] + 0.12 * b[3]), glowAt(un(b[5]), b[5]) * 0.45));
          ctx.lineWidth = th * 1.6;
        } else {
          ctx.moveTo(a[0] - 0.45 * th, a[1] - 0.5 * th);
          ctx.lineTo(b[0] - 0.45 * th, b[1] - 0.5 * th);
          ctx.strokeStyle = spRgb(T.hi, 0.42 * b[3]);
          ctx.lineWidth = th * 0.45;
        }
        ctx.stroke();
      }
    }
    if (det) {
      ctx.beginPath();
      for (let i = 3; i < pts.length; i += 6) {
        const p = pts[i]!;
        if (p[3] < 0.3) continue;
        ctx.moveTo(p[0], p[1] + p[2]);
        ctx.lineTo(p[0] - 1.2, p[1] + p[2] + 2.2);
        ctx.moveTo(p[0], p[1] - p[2]);
        ctx.lineTo(p[0] + 1.3, p[1] - p[2] - 2);
      }
      ctx.strokeStyle = spRgb(T.lo, 0.5);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  }
  roots.filter((rt) => !rt.back).forEach(drawRoot);

  /* ---- the crown ---- */
  const cx = X(top);
  const cw = W(top);
  const Rb = 35.5 * (1 + 0.015 * breathe);
  const by = top - 36 + 0.5 * breathe;
  const lips = [0, 1, 2].map((k) => ({ y: top - k * 2.3, r: cw * (1 + 0.05 * k) + k * 0.6, tk: 2.7 - k * 0.5, k }));
  type Lip = (typeof lips)[number];
  const lipPts = (L: Lip, front: boolean): P3[] => {
    const n = det ? 26 : 12;
    const pts: P3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (front ? 0 : Math.PI) + (Math.PI * i) / n;
      const rr = L.r * (1 + 0.045 * spN(a * 3.2 + L.k * 7, 8) + 0.02 * Math.sin(t * w9 + a * 2 + L.k));
      pts.push([cx + Math.cos(a) * rr, L.y + Math.sin(a) * rr * 0.24, a]);
    }
    return pts;
  };
  const lipBand = (L: Lip, front: boolean): void => {
    const pts = lipPts(L, front);
    const up = pts.map((p): Pair => [p[0], p[1] - L.tk * (0.7 + 0.3 * Math.sin(p[2] * 5 + L.k))]);
    if (front) {
      ctx.save();
      ctx.translate(0.4, 1);
      spPath(ctx, pts);
      ctx.strokeStyle = spRgb(T.lo, 0.55);
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }
    spPath(ctx, up);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i]![0], pts[i]![1] + L.tk * 0.4);
    ctx.closePath();
    if (front) {
      const g = ctx.createLinearGradient(0, L.y - L.tk - 2, 0, L.y + cw * 0.24 + 2);
      g.addColorStop(0, spRgb(spTone(T, 0.74)));
      g.addColorStop(0.55, spRgb(spTone(T, 0.42)));
      g.addColorStop(1, spRgb(spTone(T, 0.12)));
      ctx.fillStyle = g;
      ctx.fill();
      const h = ctx.createLinearGradient(cx - L.r, 0, cx + L.r, 0);
      h.addColorStop(0, spRgb(T.lo, 0));
      h.addColorStop(1, spRgb(T.lo, 0.55));
      ctx.fillStyle = h;
      ctx.fill();
    } else {
      ctx.fillStyle = spRgb(spTone(T, 0.18));
      ctx.fill();
    }
    if (lum > 0.02) {
      ctx.globalCompositeOperation = GM;
      ctx.fillStyle = spRgb(T.green, (front ? 0.3 : 0.18) * lum);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (front && det) {
      ctx.beginPath();
      for (let i = 2; i < pts.length - 1; i += 3) {
        const p = pts[i]!;
        const q = up[i]!;
        ctx.moveTo(q[0] + 0.4, q[1] + 0.3);
        ctx.quadraticCurveTo(p[0] - 0.6, (p[1] + q[1]) / 2, p[0] + 0.2, p[1] + L.tk * 0.3);
      }
      ctx.strokeStyle = spRgb(T.lo, 0.45);
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
  };
  lips.forEach((L) => lipBand(L, false));

  /* the petals: thick, cupped surfaces hinged at the collar. Opening bends each one from the hinge outward, the
     tip trailing, so it peels rather than rotates; the ring's release shoves them and they settle. */
  const N = det ? 14 : 7;
  const M = det ? 4 : 2;
  const rho0 = cw * 0.9;
  const Y0 = -(top - 1);
  const Yc = -by;
  const psi0 = Math.atan2(Y0 - Yc, rho0);
  const Rp = Rb + 3.5;
  const items: (PetalItem | MemItem)[] = [];
  const petals = SPS.petals.map((pd): PetalItem => {
    const al = pd.az + phi * 0.35;
    const sa = Math.sin(al);
    const ca = Math.cos(al);
    const tx = ca;
    const tz = -sa;
    const psi1 = Math.PI / 2 - 0.2 + pd.lift;
    const ds = (Rp * (psi1 - psi0) * pd.lf) / N;
    let rho = rho0;
    let Y = Y0;
    const cen: Pair[] = [];
    const tan: number[] = [];
    const os: number[] = [];
    for (let k = 0; k <= N; k++) {
      const v = k / N;
      const tr = t - 5.65 - pd.lag * 0.3;
      const o =
        clamp(openAt(t - pd.lag - v * 0.55), 0, 1.15) +
        (tr > 0 ? 0.13 * Math.exp(-tr * 1.7) * Math.sin(tr * 6) * v : 0) +
        0.012 * spN(t * 4 + pd.seed + v * 3, 11);
      const th = mix(mix(psi0, psi1, v) + Math.PI / 2, mix(1.3, -1.15, v ** 1.15) + 0.1 * spN(pd.seed, 2), o);
      cen.push([rho, Y]);
      tan.push(th);
      os.push(o);
      const st = ds * (1 + 0.05 * Math.sin(Math.PI * clamp(o)));
      rho += Math.cos(th) * st;
      Y += Math.sin(th) * st;
    }
    const V: V3[][] = [];
    for (let k = 0; k <= N; k++) {
      const v = k / N;
      const [rk, yk] = cen[k]!;
      const th = tan[k]!;
      const o = clamp(os[k]!);
      const shape = Math.sin(Math.PI * Math.min(1, v * 1.04 + 0.04)) ** 0.75 * (1 - 0.3 * v);
      const cup = mix(pd.curl, 0.12, o);
      const ni = [-Math.sin(th), Math.cos(th)] as const;
      const row: V3[] = [];
      for (let m = 0; m <= M; m++) {
        const u = -1 + (2 * m) / M;
        const w = (mix(22, 15, o) * pd.wf * shape * (1 + 0.08 * spN(v * 9 + (u < 0 ? pd.seed : pd.seed + 50), 12)) + 0.5) * Math.abs(u);
        const inw = ((w * w) / 15) * cup;
        const rp = rk + ni[0] * inw;
        const yp = yk + ni[1] * inw;
        const lat = Math.sign(u) * w;
        row.push([cx + rp * sa + tx * lat, -yp, rp * ca + tz * lat]);
      }
      V.push(row);
    }
    let z = 0;
    V.forEach((row) => row.forEach((p) => (z += p[2])));
    z /= (N + 1) * (M + 1);
    const it: PetalItem = { kind: 'petal', pd, V, os, z };
    items.push(it);
    return it;
  });
  /* membranes stretched between neighbours near the hinge, seen only as they part */
  for (let i = 0; i < 7; i++) {
    const A = petals[i]!.V;
    const B = petals[(i + 1) % 7]!.V;
    const kk = Math.max(2, Math.round(N * 0.24));
    for (let k = 0; k < kk; k++) {
      const q = [A[k]![M]!, A[k + 1]![M]!, B[k + 1]![0]!, B[k]![0]!];
      const q1 = q[1]!;
      const q2 = q[2]!;
      const sep = Math.hypot(q1[0] - q2[0], q1[1] - q2[1], q1[2] - q2[2]);
      const a = clamp((sep - 3) / 12) * 0.5 * (1 - (k / kk) * 0.5);
      if (a > 0.02) items.push({ kind: 'mem', q, a, z: (q[0]![2] + q1[2] + q2[2] + q[3]![2]) / 4 });
    }
  }
  const drawPetal = ({ pd, V, os }: PetalItem): void => {
    const quads: [number, V3[], Rgb][] = [];
    const vis: boolean[][] = [];
    for (let k = 0; k < N; k++) {
      const visRow: boolean[] = [];
      vis.push(visRow);
      for (let m = 0; m < M; m++) {
        const a = V[k]![m]!;
        const b = V[k + 1]![m]!;
        const c = V[k + 1]![m + 1]!;
        const d = V[k]![m + 1]!;
        const qx = (a[0] + b[0] + c[0] + d[0]) / 4;
        const qy = (a[1] + b[1] + c[1] + d[1]) / 4;
        const qz = (a[2] + b[2] + c[2] + d[2]) / 4;
        const out = spNorm([qx - cx, qy - by, qz]);
        let nr = spNorm(spCross(spSub(b, a), spSub(d, a)));
        if (spDot(nr, out) < 0) nr = [-nr[0], -nr[1], -nr[2]];
        const outer = nr[2] > 0;
        const nv: V3 = outer ? nr : [-nr[0], -nr[1], -nr[2]];
        const dif = Math.max(0, spDot(nv, SP_LIGHT));
        let col = outer ? spTone(T, 0.13 + 0.66 * dif) : spMix(spTone(T, 0.24 + 0.58 * dif), T.hi, 0.12);
        const fall = clamp(1.4 - Math.hypot(qx - cx, qy - by, qz) / 75);
        const ua = Math.abs(-1 + (2 * m + 1) / M);
        if (lum > 0.01) {
          col = spLit(
            T,
            col,
            outer
              ? lum * 0.3 * fall * (0.35 + 0.65 * ua) * (1 - (0.4 * k) / N)
              : lum * 0.9 * fall * Math.max(0.15, spDot(nr, out)),
          );
        }
        quads.push([qz, [a, b, c, d], col]);
        visRow.push(outer);
      }
    }
    quads.sort((p, q) => p[0] - q[0]);
    for (const [, q, col] of quads) {
      ctx.beginPath();
      ctx.moveTo(q[0]![0], q[0]![1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(q[i]![0], q[i]![1]);
      ctx.closePath();
      const st = spRgb(col);
      ctx.fillStyle = st;
      ctx.fill();
      ctx.strokeStyle = st;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    const colAt = (k: number, uu: number): P3 => {
      const f = ((uu + 1) / 2) * M;
      const m = Math.min(M - 1, Math.floor(f));
      const r = f - m;
      const p = V[k]![m]!;
      const q = V[k]![m + 1]!;
      return [mix(p[0], q[0], r), mix(p[1], q[1], r), m];
    };
    if (det) {
      pd.veins.forEach((uu, vi) => {
        for (let k = 1; k < N - 1; k++) {
          const a = colAt(k, uu * (1 - (k / N) * 0.3));
          const b = colAt(k + 1, uu * (1 - ((k + 1) / N) * 0.3));
          const outer = vis[k]![a[2]];
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          if (outer) {
            ctx.strokeStyle = lum > 0.15 ? spRgb(T.lo, 0.25 + 0.4 * Math.min(1, lum)) : spRgb(T.hi, 0.24);
            ctx.lineWidth = vi ? 0.45 : 0.85;
            ctx.stroke();
            if (lum <= 0.15) {
              ctx.beginPath();
              ctx.moveTo(a[0] + 0.5, a[1] + 0.4);
              ctx.lineTo(b[0] + 0.5, b[1] + 0.4);
              ctx.strokeStyle = spRgb(T.lo, 0.3);
              ctx.lineWidth = 0.4;
              ctx.stroke();
            }
          } else {
            ctx.strokeStyle = spRgb(spLit(T, T.hi, lum * 0.5), 0.3);
            ctx.lineWidth = vi ? 0.4 : 0.7;
            ctx.stroke();
          }
        }
      });
      for (const wv of pd.wr) {
        const k = Math.max(1, Math.round(wv * N));
        const comp = 0.16 + 0.42 * (1 - clamp(os[k]!));
        const mid = M >> 1;
        const dv = [V[k + 1]![mid]![0] - V[k]![mid]![0], V[k + 1]![mid]![1] - V[k]![mid]![1]] as const;
        const pts: Pair[] = [];
        for (let i = 0; i <= 6; i++) {
          const uu = -0.85 + (1.7 * i) / 6;
          const p = colAt(k, uu);
          const wav = 0.15 * Math.sin(uu * 7 + pd.seed);
          pts.push([p[0] + dv[0] * wav, p[1] + dv[1] * wav]);
        }
        spPath(ctx, pts);
        ctx.strokeStyle = spRgb(T.lo, comp);
        ctx.lineWidth = 0.55;
        ctx.stroke();
        ctx.save();
        ctx.translate(-0.4, -0.5);
        spPath(ctx, pts);
        ctx.strokeStyle = spRgb(T.hi, comp * 0.5);
        ctx.lineWidth = 0.35;
        ctx.stroke();
        ctx.restore();
      }
    }
    /* the thick edge, then light catching it */
    const edge: V3[] = [];
    for (let k = 0; k <= N; k++) edge.push(V[k]![0]!);
    for (let k = N; k >= 0; k--) edge.push(V[k]![M]!);
    spPath(ctx, edge);
    ctx.strokeStyle = spRgb(T.lo, 0.85);
    ctx.lineWidth = Math.max(0.9 / s, 1.4);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.save();
    ctx.translate(-0.35, -0.35);
    spPath(ctx, edge);
    ctx.strokeStyle = spRgb(T.hi, 0.32);
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
    if (lum > 0.02) {
      ctx.globalCompositeOperation = GM;
      spPath(ctx, edge);
      ctx.strokeStyle = spRgb(T.green, 0.2 * lum);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    const tp = V[N]![M >> 1]!;
    const tq = V[N - 1]![M >> 1]!;
    spThorn(ctx, tp[0], tp[1], Math.atan2(tp[1] - tq[1], tp[0] - tq[0]), 5, 1, T, 0.24);
    const bp = V[0]![M >> 1]!;
    ctx.beginPath();
    ctx.ellipse(bp[0], bp[1] - 0.6, 2.4, 1.4, 0, 0, TAU);
    ctx.fillStyle = spRgb(spTone(T, 0.3), 0.7);
    ctx.fill();
  };
  const drawMem = ({ q, a }: MemItem): void => {
    ctx.beginPath();
    ctx.moveTo(q[0]![0], q[0]![1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i]![0], q[i]![1]);
    ctx.closePath();
    ctx.fillStyle = spRgb(spLit(T, spTone(T, 0.66), lum * 0.6), a);
    ctx.fill();
    if (det) {
      ctx.beginPath();
      ctx.moveTo((q[0]![0] + q[1]![0]) / 2, (q[0]![1] + q[1]![1]) / 2);
      ctx.lineTo((q[2]![0] + q[3]![0]) / 2, (q[2]![1] + q[3]![1]) / 2);
      ctx.strokeStyle = spRgb(T.lo, a * 0.8);
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }
  };
  const drawItem = (it: PetalItem | MemItem): void => (it.kind === 'petal' ? drawPetal(it) : drawMem(it));
  items.sort((a, b) => a.z - b.z);
  items.filter((it) => it.z < 0).forEach(drawItem);

  /* ring of light: forms on the bulb, then leaves it */
  const kr = seg(t, 5.6, 7.6);
  const RING: readonly Pair[] = [
    [14 * (1 - kr) + 4, 0.08],
    [5, 0.2],
    [1.6, 0.55],
  ];
  const ring = (front: boolean): void => {
    if (kr <= 0 || kr >= 1) return;
    const R = Rb * 1.02 + (1 - (1 - kr) ** 2.2) * 105;
    const a = (1 - kr) ** 1.4;
    ctx.globalCompositeOperation = GM;
    ctx.lineCap = 'butt';
    for (const [wd, al] of RING) {
      for (let i = 0; i < 40; i++) {
        const a0 = (front ? 0 : Math.PI) + (Math.PI * i) / 40;
        const a1 = a0 + Math.PI / 40;
        const rr = (q: number): number => R * (1 + 0.035 * spN(q * 3 + t * 0.8, 21));
        const m = 0.55 + 0.45 * spN(a0 * 2.4 + t * 1.3, 22);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * rr(a0), by + 2 + Math.sin(a0) * rr(a0) * 0.28);
        ctx.lineTo(cx + Math.cos(a1) * rr(a1), by + 2 + Math.sin(a1) * rr(a1) * 0.28);
        ctx.strokeStyle = spRgb(T.green, al * a * m);
        ctx.lineWidth = wd;
        ctx.stroke();
      }
    }
    if (front) {
      ctx.beginPath();
      ctx.ellipse(0, G, R * 0.9, R * 0.18, 0, 0, TAU);
      ctx.strokeStyle = spRgb(T.green, 0.14 * a);
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  ring(false);

  /* the bulb: dense tissue, lit from inside when it wakes */
  const proj = (lon: number, lat: number): P3 => {
    const L = lon + phi * 0.35;
    return [cx + Math.sin(L) * Math.cos(lat) * Rb, by - Math.sin(lat) * Rb * 1.02, Math.cos(L) * Math.cos(lat)];
  };
  const bulbPath = (): void => {
    ctx.beginPath();
    ctx.ellipse(cx, by, Rb, Rb * 1.02, 0, 0, TAU);
  };
  bulbPath();
  {
    const g = ctx.createRadialGradient(cx - Rb * 0.38, by - Rb * 0.42, 1, cx, by, Rb * 1.25);
    const BULB: readonly Pair[] = [
      [0, 0.8],
      [0.45, 0.5],
      [0.8, 0.2],
      [1, 0.08],
    ];
    BULB.forEach(([p, k]) => g.addColorStop(p, spRgb(spTone(T, k))));
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.save();
  bulbPath();
  ctx.clip();
  const veins = (dark: boolean): void => {
    for (const v of SPS.bveins) {
      const P = v.pts.map(([lo, la]) => proj(lo, la));
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1]!;
        const b = P[i]!;
        const z = (a[2] + b[2]) / 2;
        const tp = 1 - (0.75 * i) / P.length;
        ctx.lineCap = 'round';
        if (dark) {
          if (z < 0 && !det) continue;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = spRgb(T.lo, Math.min(1, lum) * (z > 0 ? 0.6 : 0.24));
          ctx.lineWidth = v.w * tp * (z > 0 ? 1 : 0.7);
          ctx.stroke();
        } else if (z > 0) {
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = spRgb(T.lo, 0.45 * z);
          ctx.lineWidth = v.w * tp * 0.9;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(a[0] - 0.4, a[1] - 0.4);
          ctx.lineTo(b[0] - 0.4, b[1] - 0.4);
          ctx.strokeStyle = spRgb(T.hi, 0.2 * z);
          ctx.lineWidth = v.w * tp * 0.4;
          ctx.stroke();
        }
      }
    }
  };
  veins(false);
  if (lum > 0.01) {
    ctx.globalCompositeOperation = GM;
    const R = Rb * (0.35 + 0.85 * I) + flash * 8;
    const g = ctx.createRadialGradient(cx + 2, by + 6, 0, cx + 2, by + 6, R);
    g.addColorStop(0, spRgb(T.core, Math.min(1, 0.55 * lum)));
    g.addColorStop(0.3, spRgb(T.green, 0.7 * Math.min(1, lum)));
    g.addColorStop(0.75, spRgb(T.green, 0.26 * lum));
    g.addColorStop(1, spRgb(T.green, 0.04 * lum));
    ctx.fillStyle = g;
    ctx.fillRect(cx - Rb, by - Rb * 1.05, Rb * 2, Rb * 2.1);
    const rf = seg(t, 5.15, 5.7);
    if (rf > 0 && t < 6) {
      const a = Math.sin(Math.PI * Math.min(1, rf * 1.2));
      for (const [wd, al] of [
        [9, 0.2],
        [2.5, 0.7],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, by + 2, Rb * 0.97, Rb * 0.28, 0, 0, TAU);
        ctx.strokeStyle = spRgb(T.green, al * a);
        ctx.lineWidth = wd;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  {
    const g = ctx.createRadialGradient(cx, by, Rb * 0.55, cx, by, Rb * 1.03);
    g.addColorStop(0, spRgb(T.lo, 0));
    g.addColorStop(1, spRgb(T.lo, 0.32 + 0.3 * Math.min(1, lum)));
    ctx.fillStyle = g;
    ctx.fillRect(cx - Rb, by - Rb * 1.05, Rb * 2, Rb * 2.1);
  }
  for (const c of SPS.cells) {
    const p = proj(c.lon, c.lat);
    if (p[2] < -0.2) continue;
    const a = (0.1 + 0.32 * Math.min(1, lum)) * (p[2] > 0 ? 1 : 0.5);
    spBlob(ctx, p[0], p[1], c.r * (0.6 + 0.4 * Math.abs(p[2])), c.r * 0.8, c.k < 0.7 ? T.lo : T.mid, a, 0.5);
  }
  if (lum > 0.05) veins(true);
  {
    const g = ctx.createLinearGradient(0, by + Rb, 0, by + Rb - 15);
    g.addColorStop(0, spRgb(T.lo, 0.8));
    g.addColorStop(1, spRgb(T.lo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - Rb, by + Rb - 15, Rb * 2, 16);
  }
  ctx.restore();
  bulbPath();
  ctx.strokeStyle = spRgb(T.lo, 0.6);
  ctx.lineWidth = Math.max(0.9 / s, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, by, Rb - 0.6, Rb * 1.02 - 0.6, 0, Math.PI * 1.05, Math.PI * 1.45);
  ctx.strokeStyle = spRgb(T.hi, 0.12);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (lum > 0.02) {
    ctx.globalCompositeOperation = GM;
    ctx.beginPath();
    ctx.ellipse(cx, by, Rb, Rb * 1.02, 0, Math.PI * 0.05, Math.PI * 0.62);
    ctx.strokeStyle = spRgb(T.green, 0.45 * lum);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  lips.forEach((L) => lipBand(L, true));
  items.filter((it) => it.z >= 0).forEach(drawItem);
  ring(true);

  /* the air around it: light scattering, and dust hanging in it */
  ctx.globalCompositeOperation = GM;
  spBlob(ctx, cx, by, 120, 110, T.green, 0.13 * lum);
  spBlob(ctx, cx, by, 200, 150, T.green, 0.05 * lum);
  ctx.globalCompositeOperation = 'source-over';
  if (det) {
    for (const m of SPS.motes) {
      const x = m.x + 4 * Math.sin(t * w9 * m.k + m.ph);
      const y = m.y + 5 * Math.sin(t * w9 * m.k + m.ph * 2);
      const d = Math.hypot(x - cx, y - by);
      const b = (T.dark ? 0.1 : 0.08) + lum * 0.85 * clamp(1 - d / 110);
      ctx.fillStyle = spRgb(lum > 0.05 ? spMix(T.hi, T.green, clamp(lum)) : T.hi, b);
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.fill();
    }
  }
}

export const SPIRE: BroodCreature = {
  dur: 9,
  rest: 5.2,
  box: [-118, -140, 236, 218],
  // The artifact's player hands `draw` its time already wrapped to the loop.
  draw: (ctx, t, s, T) => drawSpire(ctx, ((t % 9) + 9) % 9, s, T),
};
