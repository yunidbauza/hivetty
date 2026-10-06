import type { BroodCreature } from '@lib/swarm/brood';
import {
  clamp,
  creepPool,
  ease,
  gauss,
  hash,
  LW,
  mix,
  sm,
  spBlob,
  spCross,
  spDot,
  spN2,
  spNorm,
  spPath,
  spRng,
  spSub,
  TAU,
  type V3,
} from '@lib/swarm/kit';
import { spMix, spRgb, spTone, type Tone } from '@lib/swarm/tone';

/**
 * The mutalisk, holding the air (HIVE-221): a flyer suspended in place over
 * the creep, beating slow heavy wings.
 *
 * Each stroke is phased (downstroke, compression, recovery, upstroke, a brief
 * spread at the top), lagging from the shoulder out to the tip, and lifts the
 * torso; the torso, its pitch and roll and drift, is simulated once as a
 * damped body, and the spine below it is a chain of vertebrae that follows its
 * parent's bend with stiffness falling off toward the tip, so every wingbeat
 * and correction travels down the tail late, later, latest.
 *
 * Ported number for number from the artifact (`brood-v15.html`, lines
 * 1404–1762). The simulation runs six loops and records the last, once per
 * module, on first draw rather than at import.
 */

type P3 = [number, number, number];
/** Torso state: x, y, z, pitch, roll, yaw. */
type State = readonly number[];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** Rotate `v` by the smallest rotation that takes unit `a` onto unit `b`. */
const swing = (a: V3, b: V3, v: V3): V3 => {
  const c = spDot(a, b);
  const k = spCross(a, b);
  if (c < -0.999) return v;
  const kv = spCross(k, v);
  const kd = spDot(k, v) / (1 + c);
  return [v[0] * c + kv[0] + k[0] * kd, v[1] * c + kv[1] + k[1] * kd, v[2] * c + kv[2] + k[2] * kd];
};

/** The torso's orientation as a rotation of body-frame vectors. */
const rot = (st: State): ((v: V3) => V3) => {
  const pit = st[3]!;
  const rol = st[4]!;
  const yaw = st[5]!;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(-pit);
  const sp = Math.sin(-pit);
  const cr = Math.cos(rol);
  const sr = Math.sin(rol);
  return (v) => {
    const x = v[0] * cr - v[1] * sr;
    const y = v[0] * sr + v[1] * cr;
    const z = v[2];
    const y2 = y * cp - z * sp;
    const z2 = y * sp + z * cp;
    return [x * cy + z2 * sy, y2, -x * sy + z2 * cy];
  };
};

function simulate() {
  const TP = 4;
  const BP = 2;
  const FPS = 120;
  const NF = TP * FPS;
  const dt = 1 / FPS;
  const L = 4;
  const r = spRng(211);
  const R = (a: number, b: number): number => a + (b - a) * r();
  const loopN = (t: number, sd: number, f = 1): number => {
    const a = (TAU * t) / TP;
    return spN2(Math.cos(a) * f + sd * 3.1, Math.sin(a) * f + sd * 1.7, sd);
  };
  /* the spine at rest, in the body's frame (chest at the origin, y up, z forward): head high and forward, the body
     hanging under the wings and hooking forward, the tail tip turned up. A little off the midline, never mirrored. */
  const ctl: P3[] = [
    [11, 17, 19],
    [6, 18, 12],
    [2, 12, 6],
    [0.5, 0, 0],
    [0, -14, -6],
    [-0.9, -29, -8],
    [-1.6, -43, -3],
    [-1.4, -55, 8],
    [-0.5, -60, 22],
    [0.7, -56, 35],
    [1.4, -47, 42],
  ];
  const dense: V3[] = [];
  for (let j = 0; j < ctl.length - 1; j++) {
    const p0 = ctl[Math.max(0, j - 1)]!;
    const p1 = ctl[j]!;
    const p2 = ctl[j + 1]!;
    const p3 = ctl[Math.min(ctl.length - 1, j + 2)]!;
    for (let q = 0; q < 40; q++) {
      const u = q / 40;
      const u2 = u * u;
      const u3 = u2 * u;
      const at = (k: 0 | 1 | 2): number =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * u +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
      dense.push([at(0), at(1), at(2)]);
    }
  }
  dense.push(ctl[ctl.length - 1]!);
  const rest: V3[] = [dense[0]!];
  {
    let prev = dense[0]!;
    let acc = 0;
    for (let i = 1; i < dense.length; i++) {
      const q = dense[i]!;
      let d = len(spSub(q, prev));
      while (acc + d >= L) {
        const k = (L - acc) / d;
        prev = [mix(prev[0], q[0], k), mix(prev[1], q[1], k), mix(prev[2], q[2], k)];
        rest.push(prev);
        d = len(spSub(q, prev));
        acc = 0;
      }
      acc += d;
      prev = q;
    }
  }
  const N = rest.length;
  let CH = 0;
  rest.forEach((p, i) => {
    if (len(p) < len(rest[CH]!)) CH = i;
  });
  /* head, neck and chest are carried; everything after TK is simulated */
  const TK = CH + 1;
  const radAt = (i: number): number => {
    const u = i / (N - 1);
    return (
      (u < 0.06
        ? mix(4.2, 4.8, u / 0.06)
        : u < 0.16
          ? mix(3.6, 4.4, (u - 0.06) / 0.1)
          : u < 0.3
            ? mix(5.2, 10.6, ease((u - 0.16) / 0.14))
            : u < 0.5
              ? mix(10.6, 6.6, ease((u - 0.3) / 0.2))
              : u < 0.95
                ? mix(6.2, 2.1, ((u - 0.5) / 0.45) ** 0.9)
                : mix(2.1, 2.9, (u - 0.95) / 0.05)) *
      (1 + 0.05 * Math.sin(i * 2.1))
    );
  };
  /* the stroke: downstroke (fast), compression at the bottom, recovery and upstroke (slow), a brief spread at the top */
  const WK: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.36, 0.5],
    [0.46, 0.535],
    [0.84, 0.97],
    [1, 1],
  ];
  const warp = (u0: number): number => {
    const u = ((u0 % 1) + 1) % 1;
    for (let j = 1; j < WK.length; j++) {
      if (u <= WK[j]![0]) {
        const [a0, b0] = WK[j - 1]!;
        const [a1, b1] = WK[j]!;
        return b0 + ((b1 - b0) * (u - a0)) / (a1 - a0);
      }
    }
    return 1;
  };
  const thOf = (u: number, amp = 1): number => 0.32 + 0.52 * amp * Math.cos(TAU * warp(u));
  const press = (u: number): number => clamp(-(thOf(u + 0.004) - thOf(u - 0.004)) / 0.008 / 4.6);
  const foldOf = (u0: number): number => {
    const u = ((u0 % 1) + 1) % 1;
    return sm(0.33, 0.47, u) * (1 - sm(0.7, 0.9, u));
  };
  /* two wingbeats a loop, the second one harder on the right: [right strength, left strength, left lag (cycles), slack] */
  const BEAT: readonly (readonly number[])[] = [
    [1, 1, 0.02, 0],
    [1.13, 0.97, 0.02, 0],
  ];
  const bv = (t: number, j: number): number => {
    const x = (((t / BP) % 2) + 2) % 2;
    const k = Math.floor(x);
    const f = sm(0.82, 1, x - k);
    return mix(BEAT[k]![j]!, BEAT[(k + 1) % 2]![j]!, f);
  };
  const wrap = (t: number): number => ((t % TP) + TP) % TP;
  const uOf = (t: number, side: number): number => t / BP - (side < 0 ? bv(t, 2) : 0);
  const ampOf = (t: number, side: number): number => bv(t, side > 0 ? 0 : 1);
  /* the head: dwelling right, drifting left through the first beat, sweeping back right while the beam searches */
  const headYaw = (t: number): number => {
    const m = wrap(t);
    return 0.14 * (1 - 2 * sm(0.15, 1.7, m) + 2 * sm(2.3, 3.4, m)) + 0.015 * loopN(t, 7, 1.2);
  };
  const headPit = (t: number): number => 0.025 * loopN(t, 8, 1.1);
  /* the tail steers too: a slow bias that wanders, a long drift to one side and back, and a wide correction at the tip */
  const tailBias = (t: number): number => {
    const m = wrap(t);
    return 0.06 * loopN(t, 11, 1.1) - 0.32 * (sm(2.3, 3.2, m) - sm(3.4, 3.95, m));
  };
  const tipBias = (t: number): number => 0.06 * loopN(t, 12, 1.4);
  /* mean lift, so the torso hangs where it is put */
  let LM = 0;
  for (let j = 0; j < 400; j++) LM += press(j / 400);
  LM /= 400;
  const st = [0, 0, 0, 0, 0, 0];
  const vel = [0, 0, 0, 0, 0, 0];
  const nodes: V3[] = rest.map((p): V3 => [...p]);
  const prv: V3[] = rest.map((p): V3 => [...p]);
  const REC = 3 * N + 6;
  const rec = new Float32Array(NF * REC);
  /* the last vertebrae carry no momentum of their own: they ease toward their parent's bend, so the tip trails late
     and small and cannot whip */
  const TIP = N - 8;
  const Kt = (i: number): number => 0.55 * Math.exp(-(i - TK - 1) / 7) + 0.11;
  for (let step = 0; step < 6 * NF; step++) {
    const t = step * dt;
    const uL = uOf(t, -1);
    const uR = uOf(t, 1);
    const aL = ampOf(t, -1);
    const aR = ampOf(t, 1);
    const pL = press(uL) * aL;
    const pR = press(uR) * aR;
    const lift = (pL + pR) / (2 * LM) - 1;
    const ht = headYaw(t);
    const acc = [
      7 * (1.1 * loopN(t, 1, 0.9) - st[0]!) - 2.6 * vel[0]!,
      5 * lift - 34 * st[1]! - 4.2 * vel[1]!,
      6 * (0.9 * loopN(t, 2, 0.8) - 0.4 * lift - st[2]!) - 2.6 * vel[2]!,
      0.4 * lift - 46 * st[3]! - 5.5 * vel[3]!,
      (1.6 * (pR - pL)) / LM - 40 * st[4]! - 5 * vel[4]!,
      8 * (0.035 * loopN(t, 3, 0.9) - 0.3 * ht - st[5]!) - 3 * vel[5]!,
    ];
    for (let k = 0; k < 6; k++) {
      vel[k]! += acc[k]! * dt;
      st[k]! += vel[k]! * dt;
    }
    const Rt = rot(st);
    const pos: V3 = [st[0]!, st[1]!, st[2]!];
    const at = (p: V3): V3 => add(Rt(p), pos);
    /* carried: chest and neck with the torso; the head stabilised, absorbing most of the bob and roll, then its own look */
    const hst = [st[0]! * 0.85, st[1]! * 0.4, st[2]! * 0.85, st[3]! * 0.3 + headPit(t), st[4]! * 0.3, st[5]! * 0.4 + ht];
    const Rh = rot(hst);
    const piv = rest[CH - 1]!;
    for (let i = 0; i <= TK; i++) {
      const tp = at(rest[i]!);
      if (i >= CH - 1) {
        nodes[i] = tp;
        continue;
      }
      const hp = add(add(Rh(spSub(rest[i]!, piv)), Rt(piv)), [0, st[1]! * -0.6, 0]);
      const w = clamp((i - 2) / (CH - 3)) ** 1.5;
      nodes[i] = [mix(hp[0], tp[0], w), mix(hp[1], tp[1], w), mix(hp[2], tp[2], w)];
    }
    /* simulated: inertia, a little gravity, air drag */
    for (let i = TK + 1; i < TIP; i++) {
      const p = nodes[i]!;
      const q = prv[i]!;
      const d = 0.985;
      prv[i] = [...p];
      nodes[i] = [p[0] + (p[0] - q[0]) * d, p[1] + (p[1] - q[1]) * d - 0.002, p[2] + (p[2] - q[2]) * d];
    }
    const latW = Rt([1, 0, 0]);
    const tb = tailBias(t);
    const tpb = tipBias(t);
    for (let it = 0; it < 4; it++) {
      for (let i = TK + 1; i < N; i++) {
        const a = nodes[i - 1]!;
        const b = nodes[i - 2]!;
        const cur = spNorm(spSub(a, b));
        const rd = Rt(spNorm(spSub(rest[i - 1]!, rest[i - 2]!)));
        let dl = Rt(spSub(rest[i]!, rest[i - 1]!));
        const gb = i < TK + 12 ? 0.2 : 0;
        const gt = i > N - 11 ? 0.32 : 0;
        dl = add(dl, sc(latW, tb * gb + tpb * gt));
        const tg = add(a, swing(rd, cur, dl));
        const an = at(rest[i]!);
        const k = i >= TIP ? 0.07 : Kt(i);
        const p: P3 = [...nodes[i]!];
        for (let c = 0; c < 3; c++) p[c]! += (tg[c]! - p[c]!) * k + (an[c]! - p[c]!) * 0.02;
        const e = spSub(p, a);
        const el = len(e) || 1;
        nodes[i] = add(a, sc(e, L / el));
      }
    }
    if (step >= 5 * NF) {
      const o = (step - 5 * NF) * REC;
      for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) rec[o + i * 3 + c] = nodes[i]![c]!;
      for (let k = 0; k < 6; k++) rec[o + 3 * N + k] = st[k]!;
    }
  }
  const frame = (t: number): { ns: P3[]; st: number[] } => {
    const ft = (((t % TP) + TP) % TP) * FPS;
    const f0 = Math.floor(ft) % NF;
    const f1 = (f0 + 1) % NF;
    const k = ft - Math.floor(ft);
    const a = f0 * REC;
    const b = f1 * REC;
    const ns: P3[] = [];
    const lerp = (i: number): number => mix(rec[a + i]!, rec[b + i]!, k);
    for (let i = 0; i < N; i++) ns.push([lerp(i * 3), lerp(i * 3 + 1), lerp(i * 3 + 2)]);
    const s6 = [0, 1, 2, 3, 4, 5].map((c) => lerp(3 * N + c));
    return { ns, st: s6 };
  };
  /* anatomy, grown once */
  const lump = Array.from({ length: N }, () => R(-1, 1));
  const knobs = Array.from({ length: N }, (_, i) => ({
    k: i > CH - 3 && i < N - 4 && r() < 0.55,
    sz: R(0.3, 0.55),
    spine: i > CH - 2 && i < N - 4 && r() < 0.34,
    sl: R(1, 1.8),
    a: R(-0.5, 0.5),
  }));
  const wing = (side: number) => ({
    side,
    hum: 18 * R(0.95, 1.05),
    fore: 24 * R(0.95, 1.05),
    fin: [60, 52, 43, 33].map((l) => l * R(0.94, 1.06)),
    rel: [-0.12, -0.62, -1.08, -1.52].map((a) => a + R(-0.06, 0.06)),
    att: N - 1 - Math.round(N * 0.5) + (side > 0 ? 1 : 0),
    rag: Array.from({ length: 4 }, () =>
      Array.from({ length: 11 }, (_, j) => (j === 0 || j === 10 ? 0 : R(0, 1) ** 2 * (r() < 0.15 ? 2.6 : 1))),
    ),
    holes: Array.from(
      { length: 1 + ((r() * 2) | 0) },
      (): [number, number, number, number, number] => [(r() * 3) | 0, R(0.45, 0.8), R(0.3, 0.7), R(0.9, 1.7), R(0, 9)],
    ),
    veins: Array.from({ length: 4 }, (): [number, number, number, number] => [
      R(0.25, 0.4),
      R(0.6, 0.75),
      R(0.35, 0.6),
      R(-0.2, 0.2),
    ]),
    kink: Array.from({ length: 4 }, (): [number, number] => [R(-3, 3), R(-1.5, 2.5)]),
    ph: R(0, 6),
  });
  const wings = [wing(-1), wing(1)];
  /* the skin, grown once and pinned to the body by (vertebra, angle round the body): it bends with it and never
     swims. angle 0 is the belly, PI the back */
  const PI = Math.PI;
  const A2 = (): number => R(-PI, PI);
  const skin = Array.from({ length: N }, () => ({
    spots: Array.from({ length: 4 }, (): [number, number, number, number] => [A2(), R(0, 1), R(0.18, 0.42), r() < 0.45 ? 1 : 0]),
    pores: Array.from({ length: 7 }, (): [number, number, number] => [A2(), R(0, 1), r() < 0.25 ? R(0.35, 0.75) : 0]),
    glints: Array.from({ length: 7 }, (): [number, number, number] => [A2(), R(0, 1), R(0.3, 1)]),
    veins: [] as [number, number, number, number, number, number][],
    sacs: [] as [number, number, number][],
  }));
  const vein = (u0: number, u1: number, a0: number, a1: number, wob: number, kind: number): [number, number][] => {
    const n = Math.max(3, Math.round(Math.abs(u1 - u0) * 2.2));
    const ph = R(0, 9);
    const pts: [number, number][] = [];
    for (let j = 0; j <= n; j++) {
      const q = j / n;
      pts.push([mix(u0, u1, q), mix(a0, a1, q) + wob * Math.sin(q * 7 + ph) * Math.sin(PI * q)]);
    }
    for (let j = 0; j < n; j++) {
      const [ua, aa] = pts[j]!;
      const [ub, ab] = pts[j + 1]!;
      const i = clamp(Math.floor(Math.min(ua, ub)), 2, N - 2);
      skin[i]!.veins.push([ua, aa, ub, ab, kind, j / n]);
    }
    return pts;
  };
  vein(CH + 0.5, 2.2, 0.35, 0.12, 0.25, 0);
  vein(CH + 0.5, 2.5, -0.42, -0.6, 0.2, 0);
  vein(CH - 0.5, 2.8, 0.9, 1.3, 0.15, 0);
  for (const sd of [1, -1]) {
    vein(CH + 1.5, CH - 1, sd * 0.6, sd * 2.1, 0.2, 1);
    vein(CH + 3, CH - 0.2, sd * 0.95, sd * 2.4, 0.25, 1);
    const main = vein(CH + 1, N - 3, sd * 1.25, sd * 1.45, 0.35, 2);
    for (const j of [3, 8, 14, 21]) {
      const m = main[j];
      if (m) vein(m[0], m[0] + R(1.8, 3), m[1], m[1] * 0.25, 0.15, 2);
    }
  }
  vein(CH + 2, N * 0.62, 0.1, -0.25, 0.3, 2);
  const SACS: readonly [number, number, number][] = [
    [2.6, 0.25, 1.2],
    [3.7, -0.35, 0.95],
    [5.1, 0.4, 1.4],
    [CH + 2.5, 0.05, 1.7],
    [CH + 5, -0.32, 1.2],
    [CH + 8, 0.28, 1.35],
  ];
  for (const [u, a, sz] of SACS) skin[clamp(Math.floor(u), 2, N - 2)]!.sacs.push([u, a, sz]);
  /* teeth: uneven, a few broken, a few crooked; upper along the snout, lower along the jaw */
  const teeth: { low: boolean; f: number; sd: number; len: number; tilt: number; broken: boolean; w: number }[] = [];
  for (let k = 0; k < 18; k++) {
    const low = k >= 10;
    const f = low ? R(1.5, 9.5) : R(1.5, 10.5);
    teeth.push({
      low,
      f,
      sd: r() < 0.5 ? 1 : -1,
      len: R(0.7, 2.3) * (low ? 0.8 : 1),
      tilt: R(-0.35, 0.4),
      broken: r() < 0.2,
      w: R(0.45, 0.7),
    });
  }
  const hblots = Array.from({ length: 9 }, (): [number, number, number, number] => [R(-8, 9), R(-1, 4), R(0.8, 1), R(0.8, 1.8)]);
  const dust = Array.from({ length: 26 }, () => ({ a: R(0, TAU), r: R(14, 70), sz: R(0.5, 1.4), sd: R(0, 9) }));
  const blot = Array.from({ length: N }, (_, i): [number, number, number] => [
    hash(i * 3.1) * TAU,
    0.25 + 0.3 * hash(i * 7.7),
    hash(i * 1.9),
  ]);
  return {
    TP,
    BP,
    N,
    CH,
    L,
    rest,
    radAt,
    frame,
    rot,
    thOf,
    press,
    foldOf,
    uOf,
    ampOf,
    bv,
    lump,
    knobs,
    wings,
    dust,
    LM,
    headYaw,
    skin,
    teeth,
    hblots,
    blot,
  };
}

export type HoverSim = ReturnType<typeof simulate>;

let sim: HoverSim | null = null;

/** The artifact's `HM`: recorded on first use, then the same object every time. */
export function hoverSim(): HoverSim {
  sim ??= simulate();
  return sim;
}

type Pt = [number, number];
type Prim = [number, () => void];
interface Panel {
  root: V3;
  a: readonly [V3, V3];
  b: readonly [V3, V3];
  k: number;
  extra?: readonly [V3, V3, V3];
  flank?: V3;
}

const M3 = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

function drawHover(ctx: CanvasRenderingContext2D, t: number, s: number, T: Tone, o: { field?: boolean } = {}): void {
  const HM = hoverSim();
  const det = s > 1.1;
  const lw = LW(s);
  const { ns, st } = HM.frame(t);
  const N = HM.N;
  const Rt = HM.rot(st);
  const GY = -84;
  const A = add;
  const S3 = sc;
  /* the camera watches: three-quarter, slightly above, drifting only a part of the way with the flyer */
  const cyw = 0.32;
  const cY = Math.cos(cyw);
  const sY = Math.sin(cyw);
  const pc = 0.27;
  const cP = Math.cos(pc);
  const sP = Math.sin(pc);
  const cam: V3 = [st[0]! * 0.75, st[1]! * 0.75 + 4, st[2]! * 0.75];
  const P = (p: V3): P3 => {
    const x = p[0] - cam[0];
    const y = p[1] - cam[1];
    const z = p[2] - cam[2];
    const vx = x * cY + z * sY;
    const vz = -x * sY + z * cY;
    return [vx, -y * cP + vz * sP, y * sP + vz * cP];
  };
  const pv = (v: V3): Pt => {
    const vx = v[0] * cY + v[2] * sY;
    const vz = -v[0] * sY + v[2] * cY;
    return [vx, -v[1] * cP + vz * sP];
  };
  const fromView = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [(v[0] * cY - v[2] * sY) / l, v[1] / l, (v[0] * sY + v[2] * cY) / l];
  };
  const VW = fromView([0, sP, cP]);
  const LK = fromView([-0.5, 0.72, -0.48]);
  const LF = fromView([0.35, 0.45, 0.82]);
  const HH = spNorm([LF[0] + VW[0], LF[1] + VW[1], LF[2] + VW[2]]);
  const DG = T.dark ? 1.3 : 1;
  const brightB = (n: V3): number =>
    DG * (0.13 + 0.3 * Math.max(0, spDot(n, LF)) + 0.66 * Math.max(0, spDot(n, LK)) ** 1.4);
  const bright = (n: V3): number =>
    DG * (0.14 + 0.34 * Math.max(0, spDot(n, LF)) + 0.62 * Math.max(0, spDot(n, LK)) ** 1.4) +
    0.4 * Math.max(0, spDot(n, HH)) ** 26;
  const MEM = T.membrane;
  const breath = Math.sin((TAU * t) / HM.TP);
  const tm = ((t % HM.TP) + HM.TP) % HM.TP;
  const charge = sm(1.7, 2, tm) * (1 - sm(3.4, 3.85, tm));
  const ya = (HM.frame(t - 0.04).st[1]! + HM.frame(t - 0.2).st[1]! - 2 * HM.frame(t - 0.12).st[1]!) / 0.0064;
  const gm: GlobalCompositeOperation = T.dark ? 'lighter' : 'source-over';
  const lg2 = ((): Pt => {
    const v = pv(LK);
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  })();
  /* a soft wet sphere of tissue: the light's side brighter, the edge a little translucent */
  const orb = (p3: V3, rr: number, k = 1, a = 1): void => {
    const p = P(p3);
    const g = ctx.createRadialGradient(p[0] + lg2[0] * rr * 0.4, p[1] + lg2[1] * rr * 0.4, rr * 0.05, p[0], p[1], rr);
    g.addColorStop(0, spRgb(spTone(T, 0.5 * k * DG), a));
    g.addColorStop(0.5, spRgb(spTone(T, 0.22 * k * DG), a));
    g.addColorStop(0.88, spRgb(spTone(T, 0.08 * DG), a));
    g.addColorStop(1, spRgb(spTone(T, 0.16 * DG), a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p[0], p[1], rr, 0, TAU);
    ctx.fill();
  };
  /* ---- the creep far below: its shadow, the downwash ---- */
  const g0 = P([cam[0] * 0.2, GY, 0]);
  if (!o.field) creepPool(ctx, g0[0], g0[1], 150, 30, 0.42, T);
  const uM = HM.uOf(t, 1);
  const spread = Math.cos(HM.thOf(uM)) * (1 - 0.3 * HM.foldOf(uM));
  ctx.save();
  if (det && 'filter' in ctx) ctx.filter = 'blur(3px)';
  spBlob(ctx, g0[0] + st[0]! * 0.4, g0[1], 20 + 50 * spread, 6 + 6 * spread, T.lo, T.dark ? 0.5 : 0.3);
  spBlob(ctx, g0[0] + st[0]! * 0.4, g0[1], 14, 5, T.lo, T.dark ? 0.55 : 0.28);
  ctx.restore();
  {
    const ph = (((t / HM.BP - 0.15) % 1) + 1) % 1;
    const rr = 14 + ph * 56;
    const a = (1 - ph) * 0.1 * sm(0, 0.15, ph);
    if (a > 0.003) {
      ctx.beginPath();
      ctx.ellipse(g0[0], g0[1], rr, rr * sP * 1.15, 0, 0, TAU);
      ctx.strokeStyle = spRgb(T.hi, a);
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
    }
  }
  if (det) {
    for (const d of HM.dust) {
      const ph = (((t / HM.BP - 0.2 + d.sd) % 1) + 1) % 1;
      const push = 6 * (1 - Math.exp(-ph * 5)) * Math.exp(-ph * 1.2);
      const hop = 3 * Math.sin(Math.PI * clamp(ph * 2.2)) * (d.sz / 1.4);
      const rr = d.r + push;
      const p = P([Math.cos(d.a) * rr, GY + hop, Math.sin(d.a) * rr]);
      ctx.fillStyle = spRgb(T.hi, 0.1 + 0.1 * clamp(1 - ph * 2));
      ctx.beginPath();
      ctx.arc(p[0], p[1], d.sz * 0.6, 0, TAU);
      ctx.fill();
    }
  }
  /* ---- frames along the spine ---- */
  const latW = Rt([1, 0, 0]);
  const Tn = ns.map((_, i) => spNorm(spSub(ns[Math.max(0, i - 1)]!, ns[Math.min(N - 1, i + 1)]!)));
  const Dn = Tn.map((tn) => {
    const l = spNorm(spSub(latW, S3(tn, spDot(latW, tn))));
    return spCross(tn, l);
  });
  const Ln = Tn.map((tn, i) => spCross(Dn[i]!, tn));
  /* ---- a beam from the eyes, looking down: it follows the head, and its pool slides over the creep ---- */
  const bm = (() => {
    const fw = spNorm(spSub(ns[0]!, ns[2]!));
    const e = A(A(ns[0]!, S3(fw, 3.5)), S3(Dn[1]!, 2.4));
    const hy = HM.headYaw(t + 0.15);
    const d = spNorm(A(S3(fw, 0.32), [Math.sin(hy * 3) * 0.6, -1.9, Math.cos(hy * 3) * 0.1]));
    const k = (GY - e[1]) / d[1];
    const g = A(e, S3(d, k));
    return { e: P(e), g: P(g), on: (0.85 + 0.15 * breath) * sm(2, 2.3, tm) * (1 - sm(3.4, 3.8, tm)) };
  })();
  if (bm.on > 0.005) {
    const rx = 13;
    const ry = rx * sP * 1.2;
    ctx.save();
    ctx.globalCompositeOperation = gm;
    spBlob(ctx, bm.g[0], bm.g[1], rx * 1.6, ry * 1.6, T.green, (T.dark ? 0.14 : 0.1) * bm.on);
    spBlob(ctx, bm.g[0], bm.g[1], rx, ry, T.green, (T.dark ? 0.22 : 0.14) * bm.on, 0.6);
    ctx.restore();
  }
  const rad = (i: number): number => {
    const j = Math.min(N - 1, Math.max(0, Math.round(i)));
    return (
      HM.radAt(i) *
      (1 + 0.16 * HM.lump[j]! * (i > 3 ? 1 : 0)) *
      (i > 4 && i < HM.CH + 7 ? 1 + 0.04 * breath * gauss((i - HM.CH - 2) / 3) : 1)
    );
  };
  const prims: Prim[] = [];
  /* ---- the body: one soft, lumpy, wet tissue. Its form comes from a dark tube lit only at the rim; everything
     that reads on it (mottling, creases, pores, warts, ribs, raised veins, glow sacs, broken wet glints) is pinned
     to a vertebra and an angle round the body, so it bends with it and never slides ---- */
  const surf = (u: number, a: number, h = 1): [V3, V3] => {
    const i = clamp(Math.floor(u), 0, N - 2);
    const k = u - i;
    const n = A(S3(Dn[i]!, -Math.cos(a)), S3(Ln[i]!, Math.sin(a)));
    return [A(M3(ns[i]!, ns[i + 1]!, k), S3(n, rad(u) * h)), n];
  };
  const arcOn = (u: number, a0: number, a1: number, h: number, col: string, w: number): void => {
    ctx.beginPath();
    let on = false;
    for (let k = 0; k <= 8; k++) {
      const [p, n] = surf(u, mix(a0, a1, k / 8), h);
      const q = P(p);
      if (spDot(n, VW) > 0.04) {
        if (on) ctx.lineTo(q[0], q[1]);
        else ctx.moveTo(q[0], q[1]);
        on = true;
      } else on = false;
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  const inhale = 0.5 + 0.5 * breath;
  const pulseAt = (d: number): number => {
    const ph = ((((3 * t) / HM.TP - d * 0.07) % 1) + 1) % 1;
    return Math.exp(-(((ph - 0.5) / 0.11) ** 2));
  };
  const VG = T.green;
  const VMG = T.membrane;
  for (let i = 2; i < N - 1; i++) {
    const a3 = ns[i]!;
    const b3 = ns[i + 1]!;
    const m3 = M3(a3, b3, 0.5);
    const ta = spNorm(spSub(a3, b3));
    const ra = rad(i);
    const rb = rad(i + 1);
    const kn = HM.knobs[i]!;
    const dv = Dn[i]!;
    const tail = i > N * 0.5 ? 0.9 : 1;
    const sk = HM.skin[i]!;
    const dvis = spDot(dv, VW);
    /* spines: long curved horn breaking the outline; one turned away is drawn first, so the body hides its root */
    const spine = (): void => {
      const b0 = A(m3, S3(dv, ra * 0.7));
      const c3 = A(A(b0, S3(dv, ra * 0.95 * kn.sl)), S3(ta, -ra * 0.15));
      const e3 = A(A(b0, S3(dv, ra * 1.15 * kn.sl)), S3(ta, -ra * 1.5 * kn.sl));
      const p0 = P(b0);
      const p1 = P(c3);
      const p2 = P(e3);
      const w0 = Math.max(lw * 0.5, ra * 0.3);
      const dx = p2[0] - p0[0];
      const dy = p2[1] - p0[1];
      const dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl;
      const ny = dx / dl;
      ctx.beginPath();
      ctx.moveTo(p0[0] + nx * w0, p0[1] + ny * w0);
      ctx.quadraticCurveTo(p1[0] + nx * w0 * 0.5, p1[1] + ny * w0 * 0.5, p2[0], p2[1]);
      ctx.quadraticCurveTo(p1[0] - nx * w0 * 0.3, p1[1] - ny * w0 * 0.3, p0[0] - nx * w0, p0[1] - ny * w0);
      ctx.closePath();
      ctx.fillStyle = spRgb(spTone(T, 0.06 + 0.4 * bright(dv)));
      ctx.fill();
      if (det) {
        ctx.beginPath();
        ctx.moveTo(p0[0] + nx * w0 * 0.6, p0[1] + ny * w0 * 0.6);
        ctx.quadraticCurveTo(p1[0] + nx * w0 * 0.4, p1[1] + ny * w0 * 0.4, p2[0], p2[1]);
        ctx.strokeStyle = spRgb(T.hi, 0.22);
        ctx.lineWidth = lw * 0.4;
        ctx.stroke();
      }
    };
    prims.push([
      P(m3)[2],
      () => {
        if (kn.spine && dvis < 0) spine();
        const nv = spNorm(spSub(VW, S3(ta, spDot(VW, ta))));
        const ne = spCross(ta, nv);
        const pa = P(a3);
        const pb = P(b3);
        const e2 = pv(ne);
        const g = ctx.createLinearGradient(pa[0] - e2[0] * ra, pa[1] - e2[1] * ra, pa[0] + e2[0] * ra, pa[1] + e2[1] * ra);
        for (const w of [-1, -0.9, -0.6, -0.2, 0.25, 0.65, 0.9, 1]) {
          const n = A(S3(nv, Math.sqrt(1 - w * w)), S3(ne, w));
          const k = tail * (0.03 + 0.92 * brightB(n)) + (Math.abs(w) > 0.85 ? 0.05 * DG : 0);
          g.addColorStop((w + 1) / 2, spRgb(spTone(T, k)));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(pa[0] + e2[0] * ra, pa[1] + e2[1] * ra);
        ctx.lineTo(pb[0] + e2[0] * rb, pb[1] + e2[1] * rb);
        ctx.lineTo(pb[0] - e2[0] * rb, pb[1] - e2[1] * rb);
        ctx.lineTo(pa[0] - e2[0] * ra, pa[1] - e2[1] * ra);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pb[0], pb[1], rb, 0, TAU);
        ctx.fill();
      },
    ]);
    /* the skin's detail draws just after the neighbouring segments, so no joint paints over it */
    prims.push([
      P(m3)[2] + 6,
      () => {
        /* mottling, lighter and darker violet */
        for (const [a, du, sz, light] of sk.spots) {
          const [p, n] = surf(i + du, a, 0.97);
          const vv = spDot(n, VW);
          if (vv > 0.1) {
            const q = P(p);
            const col = light ? spTone(T, 0.34 * DG) : T.lo;
            spBlob(ctx, q[0], q[1], ra * sz * 1.25, ra * sz * (0.45 + 0.55 * vv), col, light ? 0.2 : 0.32);
          }
        }
        /* creases on the inside of every bend, folds at the neck and wing roots */
        if (det) {
          const kv = spSub(Tn[i - 1]!, Tn[i + 1]!);
          const km = len(kv);
          if (km > 0.12) {
            const ac = Math.atan2(spDot(kv, Ln[i]!), -spDot(kv, dv));
            arcOn(i + 0.5, ac - 0.6, ac + 0.6, 1, spRgb(T.lo, Math.min(0.3, km * 1.6)), lw * 0.45);
          }
          const lump = HM.lump[i]!;
          if (i < HM.CH + 1 && lump > -0.3) {
            for (const du of [0.45]) arcOn(i + du, -1.4 + lump * 0.3, 1.4 + lump * 0.3, 1, spRgb(T.lo, 0.22), lw * 0.45);
          }
          if (i >= HM.CH - 1 && i <= HM.CH + 1) {
            for (const sd of [1, -1]) arcOn(i + 0.5, sd * 1.3, sd * 2.5, 1, spRgb(T.lo, 0.35), lw * 0.55);
          }
          /* ribs under the chest, showing as it fills */
          if (i >= HM.CH && i <= HM.CH + 5) {
            for (const sd of [1, -1]) {
              arcOn(i + 0.5, sd * 0.85, sd * 2.0, 1, spRgb(T.lo, 0.08 + 0.2 * inhale), lw * 0.6);
              arcOn(i + 0.62, sd * 0.85, sd * 1.9, 1.01, spRgb(spTone(T, 0.4 * DG), 0.06 + 0.12 * inhale), lw * 0.4);
            }
          }
          /* pores and warts */
          for (const [a, du, wart] of sk.pores) {
            const [p, n] = surf(i + du, a, 1);
            const vv = spDot(n, VW);
            if (vv < 0.2) continue;
            const q = P(p);
            if (wart) {
              const g2 = ctx.createRadialGradient(q[0] + lg2[0] * wart * 0.4, q[1] + lg2[1] * wart * 0.4, 0, q[0], q[1], wart);
              g2.addColorStop(0, spRgb(spTone(T, 0.26 * DG)));
              g2.addColorStop(1, spRgb(spTone(T, 0.12 * DG)));
              ctx.fillStyle = g2;
              ctx.beginPath();
              ctx.arc(q[0], q[1], wart, 0, TAU);
              ctx.fill();
            } else {
              ctx.fillStyle = spRgb(T.lo, 0.55);
              ctx.beginPath();
              ctx.arc(q[0], q[1], 0.24, 0, TAU);
              ctx.fill();
            }
          }
        }
        /* raised veins: a dark cord with a lit top, and a dim glow in them, a pulse travelling out from the chest */
        for (const [u0, a0, u1, a1, kind, fq] of sk.veins) {
          const [p0, n0] = surf(u0, a0, 1.02);
          const [p1] = surf(u1, a1, 1.02);
          if (spDot(n0, VW) < 0.05) continue;
          const q0 = P(p0);
          const q1 = P(p1);
          const w = Math.max(lw * 0.4, ra * 0.045);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(q0[0], q0[1]);
          ctx.lineTo(q1[0], q1[1]);
          ctx.strokeStyle = spRgb(spTone(T, 0.09 * DG));
          ctx.lineWidth = w * 1.6;
          ctx.stroke();
          const col = kind === 1 ? spMix(VG, VMG, fq) : kind === 2 ? spMix(VG, T.mid, 0.35) : VG;
          const gA =
            (0.05 + 0.2 * pulseAt(Math.abs(u0 - HM.CH)) + (kind === 0 ? 0.16 * charge : 0)) *
            (kind === 2 ? 0.75 : 1) *
            (T.dark ? 1 : 0.7);
          ctx.save();
          ctx.globalCompositeOperation = gm;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(q0[0], q0[1]);
          ctx.lineTo(q1[0], q1[1]);
          ctx.strokeStyle = spRgb(col, gA);
          ctx.lineWidth = w * 1.0;
          ctx.stroke();
          ctx.restore();
        }
        /* glow sacs: translucent blisters along the throat and belly, filling with light on the inhale */
        for (const [u, a, sz] of sk.sacs) {
          const [p, n] = surf(u, a, 1.0);
          const vv = spDot(n, VW);
          if (vv < 0.12) continue;
          const q = P(p);
          const rz = sz * (0.9 + 0.12 * inhale);
          const ry = rz * (0.5 + 0.5 * vv);
          ctx.beginPath();
          ctx.ellipse(q[0], q[1], rz * 1.3, ry * 0.8, Math.atan2(pv(ta)[1], pv(ta)[0]), 0, TAU);
          ctx.fillStyle = spRgb(spTone(T, 0.16 * DG), 0.5);
          ctx.fill();
          ctx.save();
          ctx.globalCompositeOperation = gm;
          const glow = (0.05 + 0.15 * inhale + (u < HM.CH ? 0.08 * charge : 0)) * (T.dark ? 1 : 0.7);
          spBlob(ctx, q[0], q[1], rz * 1.6, ry * 1.6, VG, glow);
          ctx.restore();
          ctx.fillStyle = spRgb(T.hi, 0.35);
          ctx.beginPath();
          ctx.arc(q[0] + lg2[0] * rz * 0.5, q[1] + lg2[1] * ry * 0.4, Math.max(0.18, rz * 0.12), 0, TAU);
          ctx.fill();
        }
        /* wet: small broken glints riding the lumps, and a rim glint where the back light grazes the edge */
        for (const [a, du, sz] of sk.glints) {
          const [p, n] = surf(i + du, a, 1);
          const vv = spDot(n, VW);
          if (vv < 0.03) continue;
          const sp = Math.max(0, spDot(n, HH)) ** 16 * (0.7 + 0.3 * HM.lump[i]!);
          const rim = vv < 0.35 ? Math.max(0, spDot(n, LK)) ** 3 * (1 - vv / 0.35) : 0;
          const k = Math.max(sp, rim * 0.8);
          if (k < 0.12) continue;
          const q = P(p);
          const ang = Math.atan2(pv(ta)[1], pv(ta)[0]) + a * 0.3;
          ctx.fillStyle = spRgb(spMix(T.hi, T.glint, 0.3), 0.6 * k);
          ctx.beginPath();
          ctx.ellipse(q[0], q[1], (0.3 + 0.7 * sz) * (0.6 + k), 0.25 + 0.3 * sz * k, ang, 0, TAU);
          ctx.fill();
        }
        if (kn.spine && dvis >= 0) spine();
        if (kn.k && dvis > -0.12) orb(A(m3, S3(dv, ra * 0.72)), ra * kn.sz, 1);
      },
    ]);
  }
  /* ---- the tail's end: hooks of horn, ridged and chipped, held in a swollen cuff of flesh ---- */
  {
    const e3 = ns[N - 1]!;
    const tt = S3(Tn[N - 1]!, -1);
    const dv = Dn[N - 1]!;
    const lv = Ln[N - 1]!;
    const open = 0.45 + 0.12 * Math.sin((TAU * t) / HM.TP + 1) + 0.04 * Math.sin((TAU * 3 * t) / HM.TP);
    prims.push([
      P(e3)[2] + 1,
      () => {
        const qb = (a: Pt, c: Pt, b: readonly number[], q: number): Pt => [
          (1 - q) * (1 - q) * a[0] + 2 * (1 - q) * q * c[0] + q * q * b[0]!,
          (1 - q) * (1 - q) * a[1] + 2 * (1 - q) * q * c[1] + q * q * b[1]!,
        ];
        const hooks: [V3, V3, number, number][] = [
          [dv, lv, 1, 1],
          [S3(dv, -1), lv, 0.9, 0],
          [lv, dv, 0.55, 0],
        ];
        hooks.forEach(([d, l, sz, chip]) => {
          const b3 = A(e3, S3(d, 1.3));
          const c3 = A(A(b3, S3(tt, 5.5 * sz)), S3(d, (2.5 + 3 * open) * sz));
          const f3 = A(A(b3, S3(tt, 9.8 * sz)), S3(d, -1.8 * sz));
          const b2 = P(b3);
          const c2 = P(c3);
          const f2 = P(f3);
          const w2 = pv(S3(l, 1.9 * sz));
          const out: Pt[] = [];
          const inn: Pt[] = [];
          for (let k = 0; k <= 6; k++) {
            const q = k / 6;
            out.push(qb([b2[0] + w2[0], b2[1] + w2[1]], [c2[0] + w2[0] * 0.7, c2[1] + w2[1] * 0.7], f2, q));
            inn.push(qb([b2[0] - w2[0], b2[1] - w2[1]], [c2[0] - w2[0] * 0.45, c2[1] - w2[1] * 0.45], f2, q));
          }
          if (chip) out[4] = [mix(out[4]![0], inn[4]![0], 0.45), mix(out[4]![1], inn[4]![1], 0.45)];
          spPath(ctx, [...out, ...inn.slice(0, -1).reverse()]);
          ctx.closePath();
          const g = ctx.createLinearGradient(b2[0], b2[1], f2[0], f2[1]);
          g.addColorStop(0, spRgb(spTone(T, 0.1 * DG)));
          g.addColorStop(0.3, spRgb(spTone(T, 0.36 * DG)));
          g.addColorStop(0.75, spRgb(spMix(spTone(T, 0.44 * DG), spMix(T.mid, T.glint, 0.3), 0.12)));
          g.addColorStop(1, spRgb(spTone(T, 0.2 * DG)));
          ctx.fillStyle = g;
          ctx.fill();
          if (det) {
            for (let k = 1; k <= 4; k++) {
              ctx.beginPath();
              ctx.moveTo(out[k]![0], out[k]![1]);
              ctx.lineTo(mix(out[k]![0], inn[k]![0], 0.85), mix(out[k]![1], inn[k]![1], 0.85));
              ctx.strokeStyle = spRgb(T.lo, 0.45);
              ctx.lineWidth = lw * 0.4;
              ctx.stroke();
            }
            spPath(ctx, out.slice(1, 6));
            ctx.strokeStyle = spRgb(T.hi, 0.28);
            ctx.lineWidth = lw * 0.4;
            ctx.stroke();
          }
        });
        orb(e3, 2.2, 0.6);
        if (det) arcOn(N - 1.4, -2.6, 2.6, 1.05, spRgb(T.lo, 0.5), lw * 0.6);
      },
    ]);
  }
  /* ---- the head: a predator in silhouette. A skull swept back into a ridged, notched crest over a long snout; a
     separate jaw hanging open on sinew, uneven broken teeth in wet gums; tusks curving forward like claws; small
     green eyes sunk under a brow ---- */
  {
    const h0 = ns[0]!;
    const fw = spNorm(spSub(ns[0]!, ns[2]!));
    const up = spNorm(spSub(Dn[1]!, S3(fw, spDot(Dn[1]!, fw))));
    const lt = spCross(up, fw);
    const H = (f: number, u: number, l: number): V3 => A(A(A(h0, S3(fw, f * 1.3)), S3(up, u * 1.3)), S3(lt, l * 1.3));
    const near = spDot(lt, VW) >= 0 ? 1 : -1;
    const jo = 0.34 + 0.16 * inhale;
    const J = (f: number, u: number, l: number): V3 => H(f, u * Math.cos(jo) - (f + 1) * Math.sin(jo) * 0.75 - 1.4, l);
    prims.push([
      P(H(2, 0, 0))[2] + 2,
      () => {
        const lag = clamp(-ya * 0.0014, -1, 1);
        const fuse = (ms: [V3, number][], k: number): void => {
          const cpts: Pt[] = [];
          for (const [p3, rr] of ms) {
            const p = P(p3);
            for (let j = 0; j < 14; j++) {
              cpts.push([p[0] + Math.cos((TAU * j) / 14) * rr, p[1] + Math.sin((TAU * j) / 14) * rr]);
            }
          }
          const p = cpts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const cr = (q0: Pt, a: Pt, b: Pt): number => (a[0] - q0[0]) * (b[1] - q0[1]) - (a[1] - q0[1]) * (b[0] - q0[0]);
          const lo: Pt[] = [];
          const hi: Pt[] = [];
          for (const q of p) {
            while (lo.length > 1 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
            lo.push(q);
          }
          for (const q of p.slice().reverse()) {
            while (hi.length > 1 && cr(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 0) hi.pop();
            hi.push(q);
          }
          const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
          let cx = 0;
          let cy = 0;
          hull.forEach((q) => {
            cx += q[0] / hull.length;
            cy += q[1] / hull.length;
          });
          const gg = ctx.createLinearGradient(cx + lg2[0] * 9, cy + lg2[1] * 9, cx - lg2[0] * 9, cy - lg2[1] * 9);
          gg.addColorStop(0, spRgb(spTone(T, 0.36 * DG * k)));
          gg.addColorStop(0.3, spRgb(spTone(T, 0.17 * DG * k)));
          gg.addColorStop(0.85, spRgb(spTone(T, 0.06 * DG)));
          gg.addColorStop(1, spRgb(spTone(T, 0.14 * DG)));
          ctx.beginPath();
          hull.forEach((q, j) => {
            const nx = hull[(j + 1) % hull.length]!;
            if (!j) ctx.moveTo((q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2);
            else ctx.quadraticCurveTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2);
          });
          {
            const q = hull[0]!;
            const nx = hull[1]!;
            ctx.quadraticCurveTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2);
          }
          ctx.closePath();
          ctx.fillStyle = gg;
          ctx.fill();
        };
        const line = (pts: V3[], col: string, w: number): void => {
          const Q = pts.map(P);
          ctx.beginPath();
          ctx.moveTo(Q[0]![0], Q[0]![1]);
          for (let k = 1; k < Q.length; k++) ctx.lineTo(Q[k]![0], Q[k]![1]);
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        };
        /* tusks: thick at the root, forward and hooking down like claws, chipped and stained toward the tip; one shorter */
        const tusk = (sd: number): void => {
          const sh = sd < 0 ? 0.86 : 1;
          const bones: P3[] = [
            [0.5, -2.8, 3.2],
            [5.5 * sh, -4.6 + lag, 6.4],
            [11 * sh, -5.6 + lag * 2, 7.6],
            [15.5 * sh, -7.6 + lag * 3, 6.2],
            [17 * sh, -11 * sh + lag * 4, 4.2],
          ];
          const pts = bones.map(([f, u, l]) => P(H(f, u, l * sd)));
          const wv = [3.8, 3.3, 2.5, 1.5, 0.15];
          const o2: Pt[] = [];
          const i2: Pt[] = [];
          for (let k = 0; k < pts.length; k++) {
            const a = pts[Math.max(0, k - 1)]!;
            const b = pts[Math.min(pts.length - 1, k + 1)]!;
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const l = Math.hypot(dx, dy) || 1;
            const pk = pts[k]!;
            const wk = wv[k]!;
            o2.push([pk[0] - (dy / l) * wk * 0.55, pk[1] + (dx / l) * wk * 0.55]);
            i2.push([pk[0] + (dy / l) * wk * 0.45, pk[1] - (dx / l) * wk * 0.45]);
          }
          if (sd === near) {
            o2.splice(3, 0, [
              mix(o2[2]![0], o2[3]![0], 0.5) + (i2[3]![0] - o2[3]![0]) * 0.35,
              mix(o2[2]![1], o2[3]![1], 0.5) + (i2[3]![1] - o2[3]![1]) * 0.35,
            ]);
          }
          ctx.beginPath();
          ctx.moveTo(o2[0]![0], o2[0]![1]);
          for (let k = 1; k < o2.length - 1; k++) {
            const a = o2[k]!;
            const b = o2[k + 1]!;
            ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          }
          ctx.lineTo(o2[o2.length - 1]![0], o2[o2.length - 1]![1]);
          const rr = i2.slice().reverse();
          for (let k = 0; k < rr.length - 1; k++) {
            const a = rr[k]!;
            const b = rr[k + 1]!;
            ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          }
          ctx.closePath();
          const nb = spNorm(A(S3(lt, sd), S3(fw, 0.4)));
          const lit = 0.25 + 0.75 * clamp(spDot(nb, LK) + 0.5);
          const g = ctx.createLinearGradient(pts[0]![0], pts[0]![1], pts[4]![0], pts[4]![1]);
          g.addColorStop(0, spRgb(spTone(T, 0.12 * DG)));
          g.addColorStop(0.25, spRgb(spTone(T, (0.3 + 0.18 * lit) * DG)));
          g.addColorStop(0.65, spRgb(spMix(spTone(T, 0.34 * DG), T.stain, 0.25)));
          g.addColorStop(1, spRgb(spMix(spTone(T, 0.14 * DG), T.stain, 0.35)));
          ctx.fillStyle = g;
          ctx.fill();
          if (det) {
            for (const k of [1, 1.6, 2.3]) {
              const j = Math.floor(k);
              const q = k - j;
              const a: Pt = [mix(o2[j]![0], o2[j + 1]![0], q), mix(o2[j]![1], o2[j + 1]![1], q)];
              const b: Pt = [mix(i2[j]![0], i2[j + 1]![0], q), mix(i2[j]![1], i2[j + 1]![1], q)];
              ctx.beginPath();
              ctx.moveTo(a[0], a[1]);
              ctx.lineTo(b[0], b[1]);
              ctx.strokeStyle = spRgb(T.lo, 0.4);
              ctx.lineWidth = lw * 0.4;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(o2[1]![0], o2[1]![1]);
            for (let k = 2; k < o2.length - 1; k++) ctx.lineTo(o2[k]![0], o2[k]![1]);
            ctx.strokeStyle = spRgb(T.hi, 0.25 * lit);
            ctx.lineWidth = lw * 0.45;
            ctx.stroke();
          }
        };
        tusk(-near);
        /* the jaw, hanging open on the breath; the maw behind it dark and wet, a faint light far down inside */
        const jaw: [number, number, number, number][] = [
          [-1, -1.4, 0, 3],
          [2.5, -1.9, 0, 2.8],
          [6, -2.3, 0, 2.2],
          [9, -2.5, 0, 1.6],
          [10.8, -2.4, 0, 1.1],
        ];
        fuse(
          jaw.map(([f, u, l, rr]): [V3, number] => [J(f, u, l), rr * 1.3]),
          0.8,
        );
        const mw = [H(-0.8, -0.9, 2.6), H(4, -1.7, 2.1), H(9.8, -1.9, 0.6), J(9.3, -0.7, 0.5), J(4, -0.3, 2.1), J(-0.8, -0.1, 2.6)];
        const mw2 = [H(-0.8, -0.9, -2.6), H(4, -1.7, -2.1), H(9.8, -1.9, -0.6), J(9.3, -0.7, -0.5), J(4, -0.3, -2.1), J(-0.8, -0.1, -2.6)];
        spPath(ctx, [...mw.map(P), ...mw2.map(P).reverse()]);
        ctx.closePath();
        ctx.fillStyle = spRgb(T.dark ? T.maw : spTone(T, 0.04));
        ctx.fill();
        {
          const q = P(H(2.5, -2.6, 0));
          ctx.save();
          ctx.globalCompositeOperation = gm;
          spBlob(ctx, q[0], q[1], 6, 4, VG, (0.04 + 0.03 * inhale + 0.05 * charge) * (T.dark ? 1 : 0.6));
          ctx.restore();
        }
        /* sinew at the hinge, stretched by the open jaw */
        const sinew: Pt[] = [
          [-0.6, 0],
          [-1.1, 0.5],
          [-1.6, 1],
        ];
        for (const [u0, du] of sinew) {
          line([H(-1.6 + du, u0, near * 2.9), J(-0.4 + du, u0 + 0.6, near * 2.8)], spRgb(spTone(T, 0.3 * DG), 0.7), lw * 0.55);
        }
        /* the skull */
        const skull: [number, number, number, number][] = [
          [-9, 3.2, 0.5, 2.6],
          [-7.5, 4.2, -0.6, 2.4],
          [-6, 3, 0, 3.5],
          [-3.5, 1.9, 0, 4.3],
          [-0.5, 0.9, 0, 4.3],
          [3, 0.2, 0, 3.5],
          [6.5, -0.4, 0, 2.7],
          [9.5, -0.9, 0, 2],
          [11.8, -1.2, 0, 1.3],
        ];
        const masses = skull.map(([f, u, l, rr]): [V3, number] => [H(f, u, l), rr * 1.3]);
        for (const sd of [1, -1]) masses.push([H(-3.5, -0.6, 3.4 * sd), 3.4], [H(2, -0.4, 2.6 * sd), 2.6]);
        fuse(masses, 1);
        /* teeth: uneven, some broken, some crooked; the gums dark and wet */
        for (const th of HM.teeth) {
          const l = th.sd * (2.35 - th.f * 0.17);
          const bite = th.len * (th.broken ? 0.45 : 1);
          const b0 = th.low ? J(th.f - th.w * 0.5, -0.45, l) : H(th.f - th.w * 0.5, -1.65, l);
          const b1 = th.low ? J(th.f + th.w * 0.5, -0.45, l) : H(th.f + th.w * 0.5, -1.65, l);
          const tp = th.low
            ? J(th.f + th.tilt * th.len, -0.45 + bite, l * 0.9)
            : H(th.f + th.tilt * th.len, -1.65 - bite, l * 0.9);
          const q0 = P(b0);
          const q1 = P(b1);
          const qt = P(tp);
          ctx.beginPath();
          ctx.moveTo(q0[0], q0[1]);
          if (th.broken) {
            ctx.lineTo(qt[0] - 0.35, qt[1]);
            ctx.lineTo(qt[0] + 0.35, qt[1] + 0.2);
          } else ctx.lineTo(qt[0], qt[1]);
          ctx.lineTo(q1[0], q1[1]);
          ctx.closePath();
          const enamel = spTone(T, (th.broken ? 0.42 : 0.55) * DG);
          ctx.fillStyle = spRgb(spMix(enamel, spMix(T.hi, T.glint, 0.5), T.dark ? 0.08 : 0));
          ctx.fill();
        }
        line([H(0, -1.5, near * 2.5), H(4, -1.75, near * 2.0), H(9.5, -1.95, near * 0.7)], spRgb(T.gum, 0.85), lw * 0.8);
        line([J(0, -0.35, near * 2.5), J(4, -0.4, near * 2.0), J(9, -0.6, near * 0.7)], spRgb(T.gum, 0.85), lw * 0.8);
        if (det) {
          const q = P(J(5, -0.35, near * 1.8));
          ctx.fillStyle = spRgb(T.hi, 0.5);
          ctx.beginPath();
          ctx.arc(q[0], q[1], 0.3, 0, TAU);
          ctx.fill();
        }
        /* the crest: swept back and up over the skull, ridged, creased, one notch bitten out of it */
        const top: Pt[] = [
          [3, 3.6],
          [0.5, 4.8],
          [-2, 5.4],
          [-3.8, 6.0],
          [-5.2, 6.2],
          [-5.7, 5.2],
          [-6.3, 6.3],
          [-7.8, 6.9],
          [-9.6, 7.3],
          [-11.4, 7.0],
          [-13, 6.3],
          [-14.4, 5.2],
          [-15.3, 4.0],
        ];
        const thick = (f: number): number => mix(2.6, 1.1, clamp(-f / 15));
        const notch = (f: number, u: number): number => (u < 5.5 && f < -5 && f > -6.5 ? -1 : 0);
        const crest = [
          ...top.map(([f, u]) => H(f, u, 0)),
          ...top
            .slice()
            .reverse()
            .map(([f, u]) => H(f, u - thick(f) - notch(f, u), 0)),
        ].map(P);
        spPath(ctx, crest);
        ctx.closePath();
        {
          const a = P(H(-6, 7, 0));
          const b = P(H(-6, 3, 0));
          const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
          g.addColorStop(0, spRgb(spTone(T, 0.3 * DG)));
          g.addColorStop(0.3, spRgb(spTone(T, 0.12 * DG)));
          g.addColorStop(1, spRgb(spTone(T, 0.08 * DG)));
          ctx.fillStyle = g;
          ctx.fill();
        }
        line(
          top.map(([f, u]) => H(f, u, 0)),
          spRgb(T.hi, 0.3),
          lw * 0.55,
        );
        if (det) {
          line(
            top.slice(1, -1).map(([f, u]) => H(f, u - 0.7, 0.3)),
            spRgb(T.lo, 0.5),
            lw * 0.45,
          );
          line(
            top.slice(2, -2).map(([f, u]) => H(f, u - 1.4, 0.4)),
            spRgb(T.lo, 0.35),
            lw * 0.4,
          );
          for (const f of [-2.8, -4.4, -8.6, -10.5, -12.2, -13.7]) {
            const u = top.reduce((b, q) => (Math.abs(q[0] - f) < Math.abs(b[0] - f) ? q : b))[1];
            line([H(f, u - 0.05, 0), H(f + 0.6, u - 1.3, 0.2)], spRgb(T.lo, 0.55), lw * 0.45);
          }
        }
        /* skin of the skull: mottling, creases at the neck and jaw, a scar, pores, broken glints */
        if (det) {
          for (const [f, u, sl, rr] of HM.hblots) {
            const q = P(H(f, u, near * 3.2 * sl));
            spBlob(ctx, q[0], q[1], rr * 1.3, rr, T.lo, 0.28);
          }
          const creases: Pt[] = [
            [-5.5, 1.8],
            [-6.8, 1.2],
            [-4.4, 2.6],
          ];
          for (const [f, u0] of creases) {
            line([H(f, u0, near * 3.3), H(f + 0.5, u0 - 1.6, near * 3.6), H(f + 0.3, u0 - 3, near * 3.2)], spRgb(T.lo, 0.45), lw * 0.45);
          }
          line(
            [H(-3, 1.4, near * 3.9), H(-1.4, 0.6, near * 4.1), H(0.2, 1.1, near * 4.0), H(2.4, 0.0, near * 3.5)],
            spRgb(spTone(T, 0.42 * DG), 0.5),
            lw * 0.5,
          );
          line(
            [H(-3, 1.2, near * 3.9), H(-1.4, 0.4, near * 4.1), H(0.2, 0.9, near * 4.0), H(2.4, -0.2, near * 3.5)],
            spRgb(T.lo, 0.5),
            lw * 0.4,
          );
          for (let k = 0; k < 14; k++) {
            const q = P(H(-6 + hash(k * 3.7) * 15, -0.5 + hash(k * 5.3) * 3.5, near * (3 + hash(k * 1.3))));
            ctx.fillStyle = spRgb(T.lo, 0.5);
            ctx.beginPath();
            ctx.arc(q[0], q[1], 0.22, 0, TAU);
            ctx.fill();
          }
          const sheen: P3[] = [
            [-1, 3.6, 2.2],
            [3.5, 2.2, 2.1],
            [7.5, 0.6, 1.2],
            [-5, 4.8, 1.2],
            [10.5, 0, 0.6],
          ];
          for (const [f, u, l] of sheen) {
            const n = spNorm(A(A(S3(up, u), S3(lt, near * l)), S3(fw, f * 0.05)));
            const sp = Math.max(0, spDot(n, HH)) ** 10;
            if (sp > 0.15) {
              const q = P(H(f, u, near * l));
              ctx.fillStyle = spRgb(spMix(T.hi, T.glint, 0.3), 0.55 * sp);
              ctx.beginPath();
              ctx.ellipse(q[0], q[1], 0.9, 0.4, 0.4, 0, TAU);
              ctx.fill();
            }
          }
        }
        /* nostrils: slits near the end of the snout */
        for (const sd of [1, -1]) {
          if (sd === near || det) line([H(10, 0.25, sd * 0.95), H(11.3, -0.35, sd * 0.62)], spRgb(T.lo, 0.9), lw * 0.7);
        }
        /* the brow, heavy over the eyes, and the eyes sunk in their sockets under it, wet */
        const brow: P3[] = [
          [5, 1.5, 2.3],
          [3, 2.6, 2.8],
          [1, 3.4, 2.7],
        ];
        for (const sd of [1, -1]) {
          if (sd !== near && !det) continue;
          for (const [f, u, l] of brow) {
            const q = P(H(f, u, sd * l));
            spBlob(ctx, q[0], q[1], 3.2, 2.2, T.lo, 0.45);
          }
          line([H(5.8, 1.95, sd * 2.3), H(3, 3.45, sd * 2.95), H(-1, 4.35, sd * 2.6)], spRgb(T.lo, 0.55), lw * 0.8);
          line([H(5.8, 2.3, sd * 2.2), H(3, 3.85, sd * 2.85), H(-1, 4.75, sd * 2.5)], spRgb(T.hi, 0.18), lw * 0.45);
        }
        const eyes: [number, number, number, number][] = [
          [4.3, 1.4, 2.35, 0.56],
          [2.7, 2.3, 2.75, 0.36],
          [5.3, 0.8, 2.2, 0.28],
          [1.2, 3.0, 2.65, 0.46],
          [3.7, 1.5, -2.25, 0.5],
          [2.0, 2.5, -2.6, 0.3],
          [0.8, 3.2, -2.25, 0.42],
          [5.6, 0.9, -1.85, 0.25],
        ];
        for (const [f, u, l, rr] of eyes) {
          const n = spNorm(A(S3(lt, Math.sign(l)), S3(fw, 0.6)));
          const vis = spDot(n, VW);
          if (vis < -0.1) continue;
          const q = P(H(f, u, l));
          const rz = Math.max(0.45 / s, rr * 1.3 * (0.55 + 0.45 * clamp(vis)));
          ctx.fillStyle = spRgb(T.dark ? T.maw : spTone(T, 0.05));
          ctx.beginPath();
          ctx.ellipse(q[0], q[1], rz * 1.9, rz * 1.5, 0, 0, TAU);
          ctx.fill();
          ctx.save();
          ctx.globalCompositeOperation = gm;
          spBlob(ctx, q[0], q[1], rz * 3.6, rz * 3.2, VG, (0.24 + 0.16 * charge + 0.04 * breath) * (T.dark ? 1 : 0.7));
          ctx.restore();
          ctx.fillStyle = spRgb(spMix(VG, T.core, 0.4 + 0.3 * charge), 0.95);
          ctx.beginPath();
          ctx.arc(q[0], q[1], rz * 0.72, 0, TAU);
          ctx.fill();
          ctx.fillStyle = spRgb(T.glint, 0.8);
          ctx.beginPath();
          ctx.arc(q[0] + lg2[0] * rz * 0.35, q[1] + lg2[1] * rz * 0.35, Math.max(0.18, rz * 0.24), 0, TAU);
          ctx.fill();
        }
        tusk(near);
        /* drool: strands stretching from the jaw, swinging late behind the head */
        {
          const h1 = HM.frame(t - 0.12).ns[0]!;
          const h2 = HM.frame(t - 0.26).ns[0]!;
          const drool: [number, number, number, number][] = [
            [9.2, -2.4, 0.9, 5 + 2.6 * inhale],
            [6.2, -2.8, -1.3, 3.4 + 1.8 * inhale],
          ];
          for (const [f, u, l, ln] of drool) {
            const a3 = J(f, u, l);
            const m3 = A(A(a3, [0, -ln * 0.5, 0]), S3(spSub(h1, h0), 0.9));
            const e3 = A(A(a3, [0, -ln, 0]), S3(spSub(h2, h0), 1.5));
            const a = P(a3);
            const m = P(m3);
            const e = P(e3);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.quadraticCurveTo(m[0], m[1], e[0], e[1]);
            ctx.strokeStyle = spRgb(spTone(T, 0.5 * DG), 0.35);
            ctx.lineWidth = lw * 0.4;
            ctx.stroke();
            ctx.fillStyle = spRgb(spTone(T, 0.5 * DG), 0.5);
            ctx.beginPath();
            ctx.arc(e[0], e[1], 0.55, 0, TAU);
            ctx.fill();
            ctx.fillStyle = spRgb(T.glint, 0.55);
            ctx.beginPath();
            ctx.arc(e[0] - 0.15, e[1] - 0.15, 0.18, 0, TAU);
            ctx.fill();
          }
        }
      },
    ]);
  }
  /* ---- the wings: carried high and behind; curved bones, a ragged veined membrane; the stroke lags outward ---- */
  const aB = Rt(spNorm([0, 0.89, 0.45]));
  const dB = Rt(spNorm([0, 0.45, -0.89]));
  const lB = latW;
  const chest = A(Rt([0, 0, 0]), [st[0]!, st[1]!, st[2]!]);
  for (const wd of HM.wings) {
    const sd = wd.side;
    const u = HM.uOf(t, sd);
    const uu = ((u % 1) + 1) % 1;
    const amp = HM.ampOf(t, sd);
    const fold = HM.foldOf(u);
    const slack = HM.bv(t, 3);
    const pr = HM.press(u) * amp;
    const tau = clamp(0.3 + 0.7 * pr + 0.4 * sm(0.8, 0.95, uu) * (1 - sm(0.98, 1, uu)) - 0.3 * slack * (1 - pr));
    const span = (th: number): V3 => A(S3(lB, sd * Math.cos(th)), S3(dB, Math.sin(th)));
    const dir = (th: number, ps: number): V3 => A(S3(span(th), Math.cos(ps)), S3(aB, Math.sin(ps)));
    const th = (lag: number, gain = 1): number =>
      HM.thOf(u - lag, amp) * gain + 0.16 * HM.press(u - lag - 0.03) * amp * (lag > 0.05 ? 1 : 0);
    const S0 = A(A(chest, S3(lB, sd * 4.4)), S3(dB, 4.6));
    const psH = 0.22 + 0.22 * fold;
    const psF = -0.16 - 0.6 * fold;
    const E = A(S0, S3(dir(th(0), psH), wd.hum));
    const W = A(E, S3(dir(th(0.035), psF), wd.fore));
    /* the wing's dorsal direction, as the fingers see it */
    const wDors = (): V3 => A(S3(lB, -sd * Math.sin(th(0.05))), S3(dB, Math.cos(th(0.05))));
    const fingers = wd.fin.map((ln, k): [V3, V3] => {
      const ps = psF + wd.rel[k]! * (1 - 0.35 * fold) - 0.2 * fold;
      const d0 = dir(th(0.07 + 0.01 * k), ps);
      const kink = wd.kink[k]!;
      const mid = A(A(A(W, S3(d0, ln * 0.5)), S3(spNorm(spCross(d0, wDors())), kink[0])), S3(wDors(), kink[1]));
      const tip = A(mid, S3(dir(th(0.11 + 0.018 * k, 1.03), ps - 0.05), ln * 0.5));
      return [mid, tip];
    });
    const ai = wd.att;
    const attP = A(A(ns[ai]!, S3(Dn[ai]!, HM.radAt(ai) * 0.55)), S3(lB, sd * HM.radAt(ai) * 0.55));
    const fi = HM.CH + 2;
    const flank = A(A(ns[fi]!, S3(Dn[fi]!, HM.radAt(fi) * 0.6)), S3(lB, sd * HM.radAt(fi) * 0.5));
    const [f0, f1, f2, f3] = fingers as [[V3, V3], [V3, V3], [V3, V3], [V3, V3]];
    const nW = spNorm(spCross(spSub(f0[1], W), spSub(f3[1], W)));
    const nD = spDot(nW, wDors()) > 0 ? nW : S3(nW, -1);
    const bil = (k: number): V3 =>
      S3(nD, (2.4 * pr + 1.1 * (1 - tau) * Math.sin(TAU * 1.25 * t - k * 1.3 + wd.ph)) * (0.6 + 0.2 * k));
    const depth = (P(W)[2] + P(f1[1])[2] + P(E)[2] + P(S0)[2]) / 4 - 4;
    prims.push([
      depth,
      () => {
        const panels: Panel[] = [
          { root: W, a: f0, b: f1, k: 0 },
          { root: W, a: f1, b: f2, k: 1 },
          { root: W, a: f2, b: f3, k: 2 },
          { root: S0, a: f3, b: [M3(f3[1], attP, 0.5), attP], k: 3, extra: [E, W, f3[0]], flank },
        ];
        /* a spar through its knuckle, as a smooth curve: the control point that makes a quadratic pass through the mid */
        const thru = (r0: V3, m: V3, t0: V3): [number, number, number, number] => {
          const a = P(r0);
          const b = P(m);
          const c = P(t0);
          return [2 * b[0] - (a[0] + c[0]) / 2, 2 * b[1] - (a[1] + c[1]) / 2, c[0], c[1]];
        };
        for (const pn of panels) {
          const ta = pn.a[1];
          const tb = pn.b[1];
          const mE = M3(ta, tb, 0.5);
          const pull = mix(0.08, 0.26, 1 - tau);
          const c = A(A(mE, S3(spSub(pn.root, mE), pull)), bil(pn.k));
          const Pr = P(pn.root);
          const n0 = spNorm(spCross(spSub(ta, pn.root), spSub(tb, pn.root)));
          const nv = spDot(n0, VW) >= 0 ? n0 : S3(n0, -1);
          const under = spDot(nv, nD) < 0;
          const front = Math.max(0, spDot(nv, LK)) * 0.7 + Math.max(0, spDot(nv, LF)) * 0.35;
          const trans = Math.max(0, -spDot(nv, LK));
          const vk = [1, 0.9, 1.05, 0.85][pn.k]!;
          const base = spTone(T, (0.05 + 0.36 * front) * DG * (under ? 0.7 : 1) * vk);
          const thin = spMix(base, MEM, (T.dark ? 0.12 + 0.55 * trans : 0.15 + 0.4 * trans) * (0.7 + 0.3 * tau));
          /* the trailing edge, ragged: scalloped between the fingers, nicked, never a clean curve */
          const rag = wd.rag[pn.k]!;
          const edge: P3[] = [];
          for (let j = 0; j <= 10; j++) {
            const q = j / 10;
            const v = 1 - q;
            const e3: V3 = [
              v * v * ta[0] + 2 * v * q * c[0] + q * q * tb[0],
              v * v * ta[1] + 2 * v * q * c[1] + q * q * tb[1],
              v * v * ta[2] + 2 * v * q * c[2] + q * q * tb[2],
            ];
            const inw = spSub(pn.root, e3);
            const il = len(inw) || 1;
            const fl = Math.sin(TAU * 1.75 * t + j * 1.1 + wd.ph) * (1 - tau) * 0.5;
            edge.push(P(A(e3, S3(inw, (rag[j]! * 1.5 + fl) / il))));
          }
          // The panel's outline, traced on the context where the artifact kept a Path2D.
          const path = (): void => {
            ctx.beginPath();
            ctx.moveTo(Pr[0], Pr[1]);
            if (pn.extra) {
              const Pe = P(pn.extra[0]);
              const Pw = P(pn.extra[1]);
              const Pm = P(pn.extra[2]);
              const Pa = P(ta);
              ctx.lineTo(Pe[0], Pe[1]);
              ctx.lineTo(Pw[0], Pw[1]);
              ctx.quadraticCurveTo(2 * Pm[0] - (Pw[0] + Pa[0]) / 2, 2 * Pm[1] - (Pw[1] + Pa[1]) / 2, Pa[0], Pa[1]);
            } else {
              const [cx, cy, x, y] = thru(pn.root, pn.a[0], ta);
              ctx.quadraticCurveTo(cx, cy, x, y);
            }
            for (let j = 1; j <= 10; j++) ctx.lineTo(edge[j]![0], edge[j]![1]);
            const e10 = edge[10]!;
            if (pn.flank) {
              const Pf = P(pn.flank);
              ctx.quadraticCurveTo(mix(e10[0], Pf[0], 0.5), mix(e10[1], Pf[1], 0.5) - 2, Pf[0], Pf[1]);
            } else {
              const a = P(tb);
              const b = P(pn.b[0]);
              const cc = P(pn.root);
              ctx.quadraticCurveTo(2 * b[0] - (a[0] + cc[0]) / 2, 2 * b[1] - (a[1] + cc[1]) / 2, cc[0], cc[1]);
            }
            ctx.closePath();
          };
          const Pc = P(c);
          const gr = ctx.createLinearGradient(Pr[0], Pr[1], Pc[0], Pc[1]);
          gr.addColorStop(0, spRgb(spTone(T, DG * (0.04 + 0.22 * front) * (under ? 0.8 : 1)), 0.97));
          gr.addColorStop(0.35, spRgb(base, 0.93));
          gr.addColorStop(0.8, spRgb(spMix(base, thin, 0.75), 0.86));
          gr.addColorStop(1, spRgb(thin, 0.76));
          ctx.fillStyle = gr;
          path();
          ctx.fill();
          if (det) {
            ctx.save();
            path();
            ctx.clip();
            /* veins: branching from the root, embedded, faintly lit when the light comes through */
            for (const [v0, v1, fb, bend] of wd.veins) {
              const e3 = A(M3(ta, tb, fb), S3(spSub(c, mE), 0.8));
              const m3 = A(M3(pn.root, e3, v0), S3(spSub(ta, tb), bend * 0.15));
              const b3 = M3(pn.root, e3, v1);
              const p0 = P(m3);
              const p1 = P(b3);
              const p2 = P(e3);
              const br = P(M3(m3, fb < 0.5 ? ta : tb, 0.45));
              ctx.beginPath();
              ctx.moveTo(Pr[0], Pr[1]);
              ctx.quadraticCurveTo(p0[0], p0[1], p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
              ctx.moveTo(p0[0], p0[1]);
              ctx.quadraticCurveTo(mix(p0[0], br[0], 0.5) + 1, mix(p0[1], br[1], 0.5), br[0], br[1]);
              ctx.strokeStyle = spRgb(spMix(T.lo, MEM, 0.15 + 0.4 * trans), 0.3);
              ctx.lineWidth = lw * 0.5;
              ctx.stroke();
            }
            const shine = pr * (under ? 0.4 : 1);
            if (shine > 0.05) {
              const gl = ctx.createLinearGradient(Pr[0], Pr[1], Pc[0], Pc[1]);
              gl.addColorStop(0.25, spRgb(T.hi, 0));
              gl.addColorStop(0.62, spRgb(T.hi, 0.1 * shine));
              gl.addColorStop(0.95, spRgb(T.hi, 0));
              ctx.fillStyle = gl;
              path();
              ctx.fill();
            }
            for (const [pk, fa, fb, rr, sd2] of wd.holes) {
              if (pk !== pn.k) continue;
              const q = P(A(A(pn.root, S3(spSub(ta, pn.root), fa)), S3(spSub(tb, ta), fb * fa)));
              ctx.beginPath();
              for (let j = 0; j < 9; j++) {
                const a = (TAU * j) / 9;
                const rj = rr * (0.7 + 0.5 * hash(j + sd2 * 13));
                if (j) ctx.lineTo(q[0] + Math.cos(a) * rj, q[1] + Math.sin(a) * rj * 0.7);
                else ctx.moveTo(q[0] + Math.cos(a) * rj, q[1] + Math.sin(a) * rj * 0.7);
              }
              ctx.closePath();
              ctx.fillStyle = spRgb(spMix(T.bg, T.lo, 0.5), 0.8);
              ctx.fill();
            }
            ctx.restore();
          }
        }
        /* bones: a heavy curved arm, knotted joints, long fingers tapering to nothing, a hooked claw at the wrist */
        const bone = (a3: V3, m3: V3, b3: V3, w0: number, w1: number): void => {
          const a = P(a3);
          const b = P(b3);
          const m = P(m3);
          const cx = 2 * m[0] - (a[0] + b[0]) / 2;
          const cy = 2 * m[1] - (a[1] + b[1]) / 2;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l;
          const ny = dx / l;
          const wm = (w0 + w1) / 2;
          const n3 = spNorm(spCross(spSub(b3, a3), VW));
          const g = ctx.createLinearGradient(m[0] + nx * wm, m[1] + ny * wm, m[0] - nx * wm, m[1] - ny * wm);
          g.addColorStop(0, spRgb(spTone(T, 0.08 + 0.62 * bright(n3))));
          g.addColorStop(0.55, spRgb(spTone(T, 0.06 + 0.3 * DG)));
          g.addColorStop(1, spRgb(spTone(T, 0.06 + 0.5 * bright(S3(n3, -1)))));
          ctx.beginPath();
          ctx.moveTo(a[0] + nx * w0, a[1] + ny * w0);
          ctx.quadraticCurveTo(cx + nx * wm, cy + ny * wm, b[0] + nx * w1, b[1] + ny * w1);
          ctx.arc(b[0], b[1], w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
          ctx.quadraticCurveTo(cx - nx * wm, cy - ny * wm, a[0] - nx * w0, a[1] - ny * w0);
          ctx.arc(a[0], a[1], w0, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
          ctx.fillStyle = g;
          ctx.fill();
        };
        bone(S0, M3(S0, E, 0.5), E, 3.6, 2.5);
        bone(E, A(M3(E, W, 0.5), S3(dB, 1.2)), W, 2.5, 1.8);
        fingers.forEach(([m, tp], k) => {
          const w0 = [1.6, 1.25, 1.05, 0.9][k]!;
          bone(W, M3(W, m, 0.5), m, w0, w0 * 0.72);
          bone(m, A(M3(m, tp, 0.5), S3(nD, 0.8 * pr)), tp, w0 * 0.7, Math.max(lw * 0.3, 0.2));
        });
        {
          const q = P(W);
          const d3 = A(dir(th(0.035), psF + 1.1), S3(aB, 0.2));
          const c = P(A(A(W, S3(d3, 4)), S3(nD, 1.5)));
          const e = P(A(A(W, S3(d3, 6.5)), S3(nD, -1)));
          const w2 = 1.1;
          ctx.beginPath();
          ctx.moveTo(q[0] + w2, q[1]);
          ctx.quadraticCurveTo(c[0], c[1], e[0], e[1]);
          ctx.quadraticCurveTo(c[0] - w2 * 0.6, c[1] + w2 * 0.6, q[0] - w2, q[1]);
          ctx.closePath();
          ctx.fillStyle = spRgb(spTone(T, 0.3 * DG));
          ctx.fill();
        }
      },
    ]);
  }
  prims.sort((a, b) => a[0] - b[0]).forEach((p) => p[1]());
  /* the cone itself: faint, widening to the pool, motes turning in it */
  if (bm.on > 0.005) {
    const rx = 13;
    const ry = rx * sP * 1.2;
    const e = bm.e;
    const g = bm.g;
    const gr = ctx.createLinearGradient(e[0], e[1], g[0], g[1]);
    gr.addColorStop(0, spRgb(T.green, (T.dark ? 0.2 : 0.14) * bm.on));
    gr.addColorStop(0.5, spRgb(T.green, (T.dark ? 0.08 : 0.06) * bm.on));
    gr.addColorStop(1, spRgb(T.green, (T.dark ? 0.11 : 0.08) * bm.on));
    ctx.save();
    ctx.globalCompositeOperation = gm;
    ctx.beginPath();
    ctx.moveTo(e[0] - 0.8, e[1]);
    ctx.lineTo(g[0] - rx, g[1]);
    ctx.ellipse(g[0], g[1], rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(e[0] + 0.8, e[1]);
    ctx.closePath();
    ctx.fillStyle = gr;
    ctx.fill();
    if (det) {
      for (let k = 0; k < 9; k++) {
        const f = (t * 0.25 + hash(k * 4.3)) % 1;
        const w = (hash(k * 9.1) - 0.5) * 1.6 * f;
        const x = mix(e[0], g[0], f) + w * rx;
        const y = mix(e[1], g[1], f) + Math.sin((TAU * t) / HM.TP + k) * 1.5;
        ctx.fillStyle = spRgb(T.dark ? T.core : T.green, 0.35 * Math.sin(Math.PI * f) * bm.on);
        ctx.beginPath();
        ctx.arc(x, y, 0.45, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export const HOVER: BroodCreature = {
  dur: 4,
  rest: 3.9,
  box: [-110, -86, 220, 184],
  // The artifact's player hands `draw` its time already wrapped to the loop.
  draw: (ctx, t, s, T, o) => drawHover(ctx, ((t % 4) + 4) % 4, s, T, o),
};
