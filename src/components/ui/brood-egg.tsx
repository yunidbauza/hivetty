import { useId, type CSSProperties } from 'react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

import {
  BLISTERS,
  CREASES,
  FOLDS,
  GLINT_ROT,
  GROUND,
  MOTTLE,
  OCCUPANT,
  PORES,
  RIM_THICK,
  SHELL_D,
  SPECKS,
  SPORES,
  TENDRILS,
  VEIN_BAND_DELAYS,
  VEIN_BANDS,
  VEINS,
  WET,
} from '@lib/swarm/egg-data';
import { useResolvedTheme } from '@stores/appearance-store';

const FILL_BOX = { transformBox: 'fill-box' } as const;
/** The design's `#000`: black, but never blacker than the theme's ground allows. */
// colour-literal-exempt: shading toward black is the egg's depth, the same in every theme.
const DARK = 'color-mix(in srgb, var(--cc-bg) 30%, black)';
/** The shell darkened by `pct`% of itself: the design's `color-mix(shell pct%, #000)`. */
const shellShade = (pct: number) => `color-mix(in srgb, var(--cc-shell) ${String(pct)}%, ${DARK})`;
const OCC = shellShade(35);
const delay = (s: number): CSSProperties => ({ animationDelay: `${String(s)}s` });
const turn = (rot: number, cx: number, cy: number) => `rotate(${String(rot)} ${String(cx)} ${String(cy)})`;

/**
 * The Brood's egg (HIVE-221): a living shell with something in it. Over one 7s
 * loop it swells, the occupant darkens and twitches, the veins silhouette and
 * pulse root to tip, the blisters catch the light and the egg rocks; a
 * heartbeat thumps throughout. Shapes are `egg-data`; colours are tokens alone,
 * the shell `--cc-shell`, the light `--cc-brand`, the pool and tendrils
 * `--cc-creep`, the spores `--cc-chitin`. Under reduced motion it holds still.
 *
 * The empty Hatchery draws it whole; `SwarmCreature` crops `viewBox` to the
 * shell so it sits in a creature's box like the others.
 */
export function BroodEgg({
  className,
  viewBox = '-160 -150 320 230',
}: {
  className?: string;
  viewBox?: string;
}) {
  const still = useReducedMotion();
  const light = useResolvedTheme() === 'light';
  const id = useId();
  const ids = {
    crp: `${id}-crp`,
    yolk: `${id}-yolk`,
    edge: `${id}-edge`,
    blis: `${id}-blis`,
    shellc: `${id}-shellc`,
    eb1: `${id}-eb1`,
    eb2: `${id}-eb2`,
    cmk: `${id}-cmk`,
    cm: `${id}-cm`,
    cloud: `${id}-cloud`,
  };
  const url = (name: keyof typeof ids) => `url(#${ids[name]})`;
  const anim = (name: string) => (still ? undefined : name);

  return (
  <svg viewBox={viewBox} aria-hidden className={`overflow-visible ${className ?? ''}`}>
    <defs>
      <radialGradient id={ids.crp} cx="50%" cy="50%" r="50%">
        <stop offset="0" style={{ stopColor: 'var(--cc-creep)' }} stopOpacity={0.55} />
        <stop offset="1" style={{ stopColor: 'var(--cc-creep)' }} stopOpacity={0} />
      </radialGradient>
      <radialGradient id={ids.yolk} cx="50%" cy="60%" r="50%">
        <stop offset="0" style={{ stopColor: 'var(--cc-brand)' }} stopOpacity={0.42} />
        <stop offset="0.6" style={{ stopColor: 'var(--cc-brand)' }} stopOpacity={0.16} />
        <stop offset="1" style={{ stopColor: 'var(--cc-brand)' }} stopOpacity={0} />
      </radialGradient>
      <radialGradient id={ids.edge} cx="42%" cy="36%" r="62%">
        <stop offset="0.55" style={{ stopColor: DARK }} stopOpacity={0} />
        <stop offset="1" style={{ stopColor: DARK }} stopOpacity={0.45} />
      </radialGradient>
      <radialGradient id={ids.blis} cx="38%" cy="34%" r="70%">
        <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--cc-subtle) 32%, var(--cc-shell))' }} />
        <stop offset="1" style={{ stopColor: shellShade(85) }} />
      </radialGradient>
      <clipPath id={ids.shellc}>
        <path d={SHELL_D} />
      </clipPath>
      <filter id={ids.eb2} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
      <filter id={ids.eb1}>
        <feGaussianBlur stdDeviation="1.1" />
      </filter>
      {/* The design's luminance mask (white to black), as alpha: a token ink is dark in light. */}
      <radialGradient id={ids.cmk}>
        <stop offset="0.3" style={{ stopColor: 'var(--cc-ink)' }} stopOpacity={1} />
        <stop offset="1" style={{ stopColor: DARK }} stopOpacity={0} />
      </radialGradient>
      <mask id={ids.cm} maskContentUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
        <ellipse cx="0" cy="-12" rx="28" ry="34" fill={url('cmk')} />
      </mask>
      <filter id={ids.cloud} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves={3} seed={4} />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.55" />
        <feComposite in="SourceGraphic" operator="in" />
      </filter>
    </defs>
    <ellipse
      cx="0"
      cy="44"
      rx="150"
      ry="26"
      fill={url('crp')}
      className={anim('animate-cccreep')}
      style={{ ...FILL_BOX, transformOrigin: '50% 50%' }}
    />
    <ellipse cx="0" cy="44" rx="40" ry="7" opacity={0.35} style={{ fill: DARK }} />
    <g
      fill="none"
      strokeLinecap="round"
      opacity={0.7}
      style={{ stroke: 'color-mix(in srgb, var(--cc-creep) 70%, var(--cc-bg))' }}
    >
      {GROUND.map((t) => (
        <path key={t.d} d={t.d} strokeWidth={t.w} />
      ))}
    </g>
    <g data-part="egg" className={anim('animate-cceggrock')} style={{ ...FILL_BOX, transformOrigin: '50% 100%' }}>
      <path d={SHELL_D} style={{ fill: 'var(--cc-shell)' }} />
      <g clipPath={url('shellc')}>
        <rect x="-42" y="-74" width="84" height="112" fill={url('edge')} opacity={light ? 0.4 : undefined} />
        <g className={anim('animate-cceggglow')} opacity={still ? 0.25 : undefined}>
          <ellipse cx="0" cy="-8" rx="26" ry="34" fill={url('yolk')} />
          <ellipse cx="-9" cy="-20" rx="14" ry="16" fill={url('yolk')} opacity={0.45} />
          <ellipse cx="10" cy="2" rx="12" ry="13" fill={url('yolk')} opacity={0.35} />
          <rect
            x="-30"
            y="-50"
            width="60"
            height="70"
            opacity={0.28}
            filter={url('cloud')}
            mask={url('cm')}
            style={{ fill: 'var(--cc-brand)' }}
          />
        </g>
        <g opacity={0.35} style={{ fill: 'color-mix(in srgb, var(--cc-brand) 70%, var(--cc-ink))' }}>
          {SPECKS.map((s) => (
            <circle
              key={`${String(s.cx)},${String(s.cy)}`}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              className={anim('animate-cceggspeck')}
              style={{ ...delay(s.delay), ...({ '--dx': `${String(s.dx)}px`, '--dy': `${String(s.dy)}px` } as CSSProperties) }}
            />
          ))}
        </g>
        <g className={anim('animate-cceggtwitch')} style={{ ...FILL_BOX, transformOrigin: '50% 50%' }}>
          <g
            className={anim('animate-cceggocc')}
            filter={url('eb2')}
            style={{ fill: OCC, stroke: OCC, opacity: 0.05 }}
          >
            {OCCUPANT.map((part) =>
              part.kind === 'ellipse' ? (
                <ellipse key="head" cx={part.cx} cy={part.cy} rx={part.rx} ry={part.ry} />
              ) : part.kind === 'stroke' ? (
                <path key={part.d} d={part.d} fill="none" strokeWidth={part.w} strokeLinecap="round" />
              ) : (
                <path key={part.d} d={part.d} />
              ),
            )}
          </g>
        </g>
        <ellipse
          data-part="heart"
          cx="-5"
          cy="-14"
          rx="4"
          ry="3.4"
          filter={url('eb1')}
          className={anim('animate-cceggheart')}
          style={{ ...FILL_BOX, transformOrigin: '50% 50%', fill: 'var(--cc-brand)', opacity: 0.05 }}
        />
        <g fill="none" strokeLinecap="round" opacity={0.3} style={{ stroke: shellShade(75) }}>
          {VEINS.map((v, i) => (
            <path key={i} d={v.d} strokeWidth={v.w} />
          ))}
        </g>
        <g
          fill="none"
          strokeLinecap="round"
          className={anim('animate-cceggveinsil')}
          style={{ stroke: shellShade(30), opacity: 0 }}
        >
          {VEINS.map((v, i) => (
            <path key={i} d={v.d} strokeWidth={v.w} />
          ))}
        </g>
        {VEIN_BANDS.map((band, b) => (
          <g
            key={b}
            fill="none"
            strokeLinecap="round"
            className={anim('animate-cceggveinpulse')}
            style={{ ...delay(VEIN_BAND_DELAYS[b]), stroke: 'var(--cc-brand)', opacity: 0 }}
          >
            {band.map((i) => (
              <path key={i} d={VEINS[i].d} strokeWidth={VEINS[i].w} />
            ))}
          </g>
        ))}
        <g filter={url('eb2')}>
          {MOTTLE.map((m) => (
            <ellipse
              key={`${String(m.cx)},${String(m.cy)}`}
              cx={m.cx}
              cy={m.cy}
              rx={m.rx}
              ry={m.ry}
              transform={turn(m.rot, m.cx, m.cy)}
              opacity={m.light ? 0.55 : 0.5}
              style={{
                fill: m.light ? 'color-mix(in srgb, var(--cc-subtle) 30%, var(--cc-shell))' : shellShade(55),
              }}
            />
          ))}
        </g>
        <ellipse cx="0" cy="36" rx="40" ry="11" filter={url('eb2')} opacity={0.7} style={{ fill: shellShade(45) }} />
        <g fill="none" strokeWidth={0.5} strokeLinecap="round" opacity={0.65} style={{ stroke: shellShade(45) }}>
          {[...CREASES, ...FOLDS].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g opacity={0.6} style={{ fill: shellShade(40) }}>
          {PORES.map((p) => (
            <circle key={`${String(p.cx)},${String(p.cy)}`} cx={p.cx} cy={p.cy} r={p.r} />
          ))}
        </g>
        <g
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
          style={{ stroke: 'color-mix(in srgb, var(--cc-creep) 60%, var(--cc-shell))' }}
        >
          {TENDRILS.map((t) => (
            <path key={t.d} d={t.d} strokeWidth={t.w} />
          ))}
        </g>
        <g className={anim('animate-cceggcatch')} style={{ fill: 'var(--cc-brand)', opacity: 0.03 }}>
          {BLISTERS.map(({ catch: c }) => (
            <ellipse key={`${String(c.cx)},${String(c.cy)}`} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} />
          ))}
        </g>
        <g opacity={0.32} style={{ fill: 'color-mix(in srgb, var(--cc-ink) 80%, transparent)' }}>
          {WET.map((w) => (
            <ellipse
              key={`${String(w.cx)},${String(w.cy)}`}
              cx={w.cx}
              cy={w.cy}
              rx={w.rx}
              ry={w.ry}
              transform={turn(w.rot, w.cx, w.cy)}
            />
          ))}
        </g>
      </g>
      <g>
        {BLISTERS.map(({ x, y, shadow, body, glint }) => (
          <g key={`${String(x)},${String(y)}`}>
            <ellipse
              cx={shadow.cx}
              cy={shadow.cy}
              rx={shadow.rx}
              ry={shadow.ry}
              opacity={0.3}
              filter={url('eb1')}
              style={{ fill: DARK }}
            />
            <ellipse
              cx={body.cx}
              cy={body.cy}
              rx={body.rx}
              ry={body.ry}
              fill={url('blis')}
              strokeWidth={0.4}
              style={{ stroke: shellShade(50) }}
            />
            <ellipse
              cx={glint.cx}
              cy={glint.cy}
              rx={glint.rx}
              ry={glint.ry}
              transform={turn(GLINT_ROT, glint.cx, glint.cy)}
              opacity={0.55}
              style={{ fill: 'var(--cc-ink)' }}
            />
          </g>
        ))}
      </g>
      <path d={SHELL_D} fill="none" strokeWidth={1.3} style={{ stroke: 'var(--cc-subtle)' }} />
      {RIM_THICK.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={2.3}
          strokeLinecap="round"
          opacity={0.75}
          style={{ stroke: 'var(--cc-subtle)' }}
        />
      ))}
    </g>
    {still
      ? null
      : SPORES.map((s) => (
          <circle
            key={s.delay}
            data-part="spore"
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            opacity={0}
            className="animate-ccspore"
            style={{ ...delay(s.delay), fill: 'color-mix(in srgb, var(--cc-chitin) 60%, transparent)' }}
          />
        ))}
  </svg>
  );
}
