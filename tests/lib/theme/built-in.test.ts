import { describe, expect, it } from 'vitest';

import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { BUILT_IN_THEMES } from '@lib/theme/built-in-themes';
import { luminance, parseColour, swarmPaletteOf } from '@lib/theme/colour';
import {
  SYNTAX_KEYS,
  TERMINAL_KEYS,
  UI_KEYS,
  UI_OPTIONAL_KEYS,
  syntaxTokenName,
  uiTokenName,
} from '@lib/theme/contract';
import {
  DARK_SELECTOR,
  LIGHT_SELECTOR,
  TOKENS_CSS,
  parseTokenBlock,
} from '@tests/support/css-tokens';

describe('the format', () => {
  it('counts 50 colours per mode', () => {
    expect(UI_KEYS).toHaveLength(28);
    expect(SYNTAX_KEYS).toHaveLength(11);
    expect(TERMINAL_KEYS).toHaveLength(11);
    expect(UI_OPTIONAL_KEYS).toEqual([
      'creep', 'chitin', 'tissueDeep', 'tissue', 'tissueLit', 'glowCore', 'ground',
    ]);
  });
});

describe('the built-in theme mirrors tokens.css', () => {
  const dark = parseTokenBlock(TOKENS_CSS, DARK_SELECTOR);
  const light = parseTokenBlock(TOKENS_CSS, LIGHT_SELECTOR);

  it('matches the dark ui block', () => {
    for (const key of UI_KEYS) {
      expect(BUILT_IN_THEME.modes.dark.ui[key], key).toBe(dark[uiTokenName(key)]);
    }
  });

  /**
   * The creature colours the app applies: the theme's own where it carries
   * them, derived where it does not (`apply.ts` writes `swarmPaletteOf`'s).
   * Hive dark derives its tissue ramp, so the token is compared as a colour.
   */
  it.each([
    ['dark', dark],
    ['light', light],
  ] as const)('carries the creature colours in the %s block', (mode, block) => {
    const applied = swarmPaletteOf(BUILT_IN_THEME.modes[mode].ui);
    for (const key of UI_OPTIONAL_KEYS) {
      expect(parseColour(block[uiTokenName(key)] ?? ''), key).toEqual(parseColour(applied[key]));
    }
  });

  it('matches the dark syntax block', () => {
    for (const key of SYNTAX_KEYS) {
      expect(BUILT_IN_THEME.modes.dark.syntax[key], key).toBe(
        dark[syntaxTokenName(key)],
      );
    }
  });

  /**
   * The light block overrides only 22 of the 27 ui tokens — five are
   * deliberately theme-invariant and inherit `:root`. The built-in theme
   * spells all 27 out for both modes, so the invariant five are compared
   * against the dark block on purpose.
   */
  it('matches the light ui block, invariants falling back to dark', () => {
    for (const key of UI_KEYS) {
      const token = uiTokenName(key);
      expect(BUILT_IN_THEME.modes.light.ui[key], key).toBe(
        light[token] ?? dark[token],
      );
    }
  });

  it('matches the light syntax block', () => {
    for (const key of SYNTAX_KEYS) {
      expect(BUILT_IN_THEME.modes.light.syntax[key], key).toBe(
        light[syntaxTokenName(key)],
      );
    }
  });

  /**
   * The other direction, and the one the guarantee was missing.
   *
   * Every test above walks a *key list* and looks the token up in the CSS, so
   * a `--cc-*` colour added to the stylesheet and to no key list passed green:
   * the built-in painted it from the sheet, and it was simply un-themeable —
   * an imported theme could never set it, and would leave it at whatever the
   * stylesheet said while everything around it changed. Walking the parsed CSS
   * instead closes it.
   *
   * `parseTokenBlock` only captures declarations whose value is a hex colour,
   * which is what keeps the spacing and density tokens (`320px`, `7px`) out of
   * this by construction rather than by an exclusion list somebody has to
   * maintain.
   */
  const THEMEABLE_TOKENS = new Set<string>([
    ...UI_KEYS.map(uiTokenName),
    ...UI_OPTIONAL_KEYS.map(uiTokenName),
    ...SYNTAX_KEYS.map(syntaxTokenName),
  ]);

  it.each([
    ['dark', dark],
    ['light', light],
  ] as const)('names every colour token the %s block declares', (_mode, block) => {
    for (const token of Object.keys(block)) {
      expect(THEMEABLE_TOKENS.has(token), `${token} is in tokens.css but in no key list`).toBe(
        true,
      );
    }
  });

  it('grounds each mode terminal on the same colour the DOM paints', () => {
    expect(BUILT_IN_THEME.modes.dark.terminal.bg).toBe(
      BUILT_IN_THEME.modes.dark.ui.termBg,
    );
    expect(BUILT_IN_THEME.modes.light.terminal.bg).toBe(
      BUILT_IN_THEME.modes.light.ui.termBg,
    );
  });
});

/**
 * The Brood on Hive dark (the hard-coded tissue ramp sat almost on the ground):
 * the creature's body and its lit edges must clear the background at least as
 * well as the weakest of the other built-in dark themes.
 */
describe('the creatures on Hive dark', () => {
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const of = (ui: (typeof BUILT_IN_THEME)['modes']['dark']['ui']) => {
    const p = swarmPaletteOf(ui);
    return { body: contrast(p.tissue, ui.bg), lit: contrast(p.tissueLit, ui.bg) };
  };
  const others = Object.values(BUILT_IN_THEMES)
    .filter((t) => t !== BUILT_IN_THEME && t.name !== BUILT_IN_THEME.name)
    .map((t) => of(t.modes.dark.ui));

  it('stand off the ground as the other themes do', () => {
    expect(others.length).toBeGreaterThan(3);
    const hive = of(BUILT_IN_THEME.modes.dark.ui);
    // Within 5% of the weakest other theme: the same formula, on Hive's own colours.
    expect(hive.body).toBeGreaterThanOrEqual(Math.min(...others.map((o) => o.body)) * 0.95);
    expect(hive.lit).toBeGreaterThanOrEqual(Math.min(...others.map((o) => o.lit)) * 0.95);
  });
});
