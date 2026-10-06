import { describe, expect, it } from 'vitest';

import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { clearColour, mixColour, parseColour, swarmPaletteOf } from '@lib/theme/colour';

describe('parseColour', () => {
  it.each([
    ['#fff', [255, 255, 255, 1]],
    ['#10152a', [16, 21, 42, 1]],
    ['#10152a80', [16, 21, 42, 128 / 255]],
    ['rgb(16, 21, 42)', [16, 21, 42, 1]],
    ['rgb(16, 21, 42, 0.5)', [16, 21, 42, 0.5]],
    ['rgb(16 21 42 / 50%)', [16, 21, 42, 0.5]],
    ['rgb(100% 0% 0%)', [255, 0, 0, 1]],
    ['oklch(1 0 0)', [255, 255, 255, 1]],
    ['oklch(0 0 0)', [0, 0, 0, 1]],
    ['oklch(62.796% 0.25768 29.2339)', [255, 0, 0, 1]],
  ] as const)('reads %s', (input, want) => {
    const got = parseColour(input);
    expect(got).not.toBeNull();
    got!.forEach((channel, i) => expect(channel).toBeCloseTo(want[i]!, 0));
  });

  it('answers null for anything validate.ts would refuse', () => {
    expect(parseColour('hsl(0 0% 0%)')).toBeNull();
    expect(parseColour('rgb(1 2)')).toBeNull();
    expect(parseColour('red')).toBeNull();
  });
});

describe('mixColour', () => {
  it('blends in sRGB and emits modern rgb()', () => {
    expect(mixColour('#10152a', '#8fa7f2', 0.4)).toBe('rgb(67 79 122)');
    expect(mixColour('#10152a', '#b9a7f0', 0.18)).toBe('rgb(46 47 78)');
  });

  it('mixes across formats', () => {
    expect(mixColour('oklch(0 0 0)', 'rgb(255 255 255)', 0.5)).toBe('rgb(128 128 128)');
  });

  it('hands back the base unchanged when either side is unreadable', () => {
    expect(mixColour('nonsense', '#fff', 0.5)).toBe('nonsense');
    expect(mixColour('#000000', 'nonsense', 0.5)).toBe('#000000');
  });
});

describe('clearColour', () => {
  it('keeps the channels and drops the alpha to zero', () => {
    expect(clearColour('#5b3d8f')).toBe('rgb(91 61 143 / 0)');
  });
});

describe('swarmPaletteOf', () => {
  const { creep: _c, chitin: _h, ...bare } = BUILT_IN_THEME.modes.dark.ui;
  const plain = { ...bare, bg: '#10152a', brand: '#8fa7f2', ink: '#e4e8fb' };

  it('uses the theme creature colours when present', () => {
    const p = swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui);
    expect(p.creep).toBe('#5b3d8f');
    expect(p.chitin).toBe('#b9a7f0');
    expect(p.carapace).toBe(mixColour(BUILT_IN_THEME.modes.dark.ui.bg, '#b9a7f0', 0.18));
  });

  it('derives them from bg, brand and ink when absent (formulas pinned)', () => {
    const p = swarmPaletteOf(plain);
    expect(p.creep).toBe('rgb(67 79 122)'); // mix(bg, brand, 0.4)
    expect(p.chitin).toBe('rgb(173 190 245)'); // mix(brand, ink, 0.35)
    expect(p.carapace).toBe(mixColour('#10152a', 'rgb(173 190 245)', 0.18));
    expect(p.creepClear).toBe('rgb(67 79 122 / 0)');
  });

  it('passes the nine chrome colours through untouched', () => {
    const ui = BUILT_IN_THEME.modes.light.ui;
    expect(swarmPaletteOf(ui)).toMatchObject({
      bg: ui.bg,
      panel2: ui.panel2,
      ink: ui.ink,
      muted: ui.muted,
      subtle: ui.subtle,
      brand: ui.brand,
      green: ui.green,
      amber: ui.amber,
      red: ui.red,
    });
  });

  it('derives the dark tissue ramp and carries the rest from the built-in', () => {
    // Hive dark carries no tissue ramp: derived from bg, chitin and ink like every other dark theme.
    const p = swarmPaletteOf(BUILT_IN_THEME.modes.dark.ui);
    expect([p.tissueDeep, p.tissue, p.tissueLit, p.glowCore, p.ground]).toEqual([
      'rgb(23 27 50)', 'rgb(53 53 86)', 'rgb(195 181 242)', '#e2ffee', '#141128',
    ]);
    const l = swarmPaletteOf(BUILT_IN_THEME.modes.light.ui);
    expect([l.tissueDeep, l.tissue, l.tissueLit, l.glowCore, l.ground]).toEqual([
      '#7a68b6', '#d4ccee', '#fbf9ff', '#96deb8', '#eeeafa',
    ]);
  });

  it('derives the tissue ramp for a theme that lacks it', () => {
    const {
      tissueDeep: _a, tissue: _b, tissueLit: _c, glowCore: _d, ground: _e, ...bareTissue
    } = BUILT_IN_THEME.modes.dark.ui;
    const p = swarmPaletteOf(bareTissue);
    for (const c of [p.tissueDeep, p.tissue, p.tissueLit, p.glowCore, p.ground]) {
      expect(parseColour(c)).not.toBeNull();
      expect(c).toMatch(/^rgb\(/);
    }
  });
});

describe('the creature accents (HIVE-221)', () => {
  /** Every channel of `a` within `tolerance` of the artifact's literal `b`. */
  const near = (a: string, b: readonly number[], tolerance: number): boolean => {
    const parsed = parseColour(a);
    return parsed !== null && b.every((v, i) => Math.abs(parsed[i]! - v) <= tolerance);
  };

  // The Brood v15's literals: dark, then light. The maw on light is the
  // artifact's `spTone(T, 0.04)`.
  const ARTIFACT = {
    membrane: [[150, 80, 150], [196, 140, 206]],
    maw: [[9, 3, 13], [129, 112, 186]],
    gum: [[40, 10, 32], [120, 70, 110]],
    stain: [[96, 60, 70], [96, 60, 70]],
    glint: [[255, 255, 255], [255, 255, 255]],
  } as const;

  it.each([
    ['dark', 0],
    ['light', 1],
  ] as const)('derives each accent within 12 of the artifact in %s', (mode, at) => {
    const p = swarmPaletteOf(BUILT_IN_THEME.modes[mode].ui);
    for (const [key, literals] of Object.entries(ARTIFACT)) {
      // The mouth and gums are mixed from the shadowed tissue, which Hive dark now derives.
      if (mode === 'dark' && (key === 'maw' || key === 'gum')) continue;
      const value = p[key as keyof typeof ARTIFACT];
      expect(near(value, literals[at], 12), `${mode} ${key}: ${value}`).toBe(true);
    }
  });

  it('derives every accent as a colour for a theme with no creature keys', () => {
    const {
      creep: _c, chitin: _h, tissueDeep: _a, tissue: _b, tissueLit: _d, glowCore: _e,
      ground: _f, ...bare
    } = BUILT_IN_THEME.modes.light.ui;
    const p = swarmPaletteOf(bare);
    for (const c of [p.membrane, p.maw, p.gum, p.stain, p.glint]) {
      expect(parseColour(c)).not.toBeNull();
    }
  });
});
