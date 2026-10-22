import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TERM } from '@lib/terminal/ansi';
import { BUILT_IN_THEMES } from '@lib/theme/built-in-themes';
import { mixColour, parseColour } from '@lib/theme/colour';
import { contrastRatio } from '@lib/theme/validate';

/**
 * Story 015 requires `.claude/DESIGN-SYSTEM.md` to reproduce the token sets and
 * the terminal palette, and to be verified "by diffing the values, not by eye".
 *
 * This is that diff. A doc that drifts from the code is worse than no doc: it
 * gets trusted. Editing a token now fails here until the table is updated too.
 */

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const tokensCss = read('src/styles/tokens.css');
const designSystem = read('.claude/DESIGN-SYSTEM.md');

/** Pull `--cc-name: #value;` pairs out of a CSS block. */
function parseTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--cc-[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8})/gi)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

function block(source: string, startPattern: RegExp): string {
  const start = source.search(startPattern);
  expect(start, `could not find ${startPattern} in tokens.css`).toBeGreaterThan(-1);
  const end = source.indexOf('}', start);
  return source.slice(start, end);
}

const darkTokens = parseTokens(block(tokensCss, /:root\s*\{/));
const lightTokens = parseTokens(block(tokensCss, /body\[data-theme='light'\]\s*\{/));

describe('DESIGN-SYSTEM.md — colour tokens', () => {
  it('parses a complete dark token set from tokens.css', () => {
    // Guards the parser itself: a regex that silently matched nothing would
    // make every assertion below vacuously true.
    expect(Object.keys(darkTokens)).toHaveLength(46);
  });

  it('documents every dark token with the value tokens.css defines', () => {
    for (const [token, value] of Object.entries(darkTokens)) {
      expect(
        designSystem,
        `DESIGN-SYSTEM.md is missing dark ${token}: ${value}`,
      ).toContain(`\`${token}\``);
      expect(
        designSystem,
        `DESIGN-SYSTEM.md has a stale value for dark ${token} (expected ${value})`,
      ).toContain(value);
    }
  });

  it('documents every light override with the value tokens.css defines', () => {
    for (const [token, value] of Object.entries(lightTokens)) {
      expect(
        designSystem,
        `DESIGN-SYSTEM.md has a stale value for light ${token} (expected ${value})`,
      ).toContain(value);
    }
  });

  it('gives the terminal a light surface in light mode', () => {
    /**
     * This assertion used to say the opposite — that `--cc-term-bg` and
     * `--cc-term-input` had *no* light override, because the terminal stayed
     * dark in both themes. It was inverted deliberately: the terminal shares
     * the centre stage with an editor that follows the theme, and one dark slab
     * in a light app reads as a panel that failed to load.
     *
     * Every `--cc-term-*` token is checked, not just the two surfaces. The
     * chrome that sits *on* the terminal ground has to move with it, or the
     * table headers and row highlights end up dark-on-light.
     */
    for (const token of [
      '--cc-term-bg',
      '--cc-term-input',
      '--cc-term-row-hover',
      '--cc-term-row-active',
      '--cc-term-head',
      '--cc-term-track',
    ]) {
      expect(
        lightTokens[token],
        `${token} has no light override — the terminal would stay dark`,
      ).toBeDefined();
      expect(lightTokens[token]).not.toBe(darkTokens[token]);
    }

    // Dark is untouched by the change.
    expect(darkTokens['--cc-term-bg']).toBe('#0b1023');
    // And the light ground is the editor's, which is the whole point.
    expect(lightTokens['--cc-term-bg']).toBe(lightTokens['--cc-panel-2']);
  });

  /**
   * "Different from dark" is not "visible", and the check above cannot tell
   * them apart.
   *
   * The first cut of the light theme set `--cc-term-row-hover` to `--cc-hover`
   * (#f4f9ff), which is calibrated against a **white** panel and is therefore
   * *lighter* than the terminal's #f7fafb ground. It passed every assertion
   * above while moving a hovered row by 1.008:1 — no affordance at all.
   *
   * Light lifts by deepening, so both row states must be darker than the
   * ground, and the selected row must read stronger than a merely hovered one.
   */
  it('gives the light terminal row states that can actually be seen', () => {
    const luminance = (hex: string) =>
      [0, 2, 4]
        .map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);

    const ground = luminance(lightTokens['--cc-term-bg']);
    const hover = luminance(lightTokens['--cc-term-row-hover']);
    const active = luminance(lightTokens['--cc-term-row-active']);

    expect(hover, 'hover must deepen against the light ground').toBeLessThan(ground);
    expect(active, 'active must deepen further than hover').toBeLessThan(hover);

    // And the step has to be big enough to register: the app's own light hover
    // moves 1.058:1 on a panel, so anything near 1.0 is a non-affordance.
    const contrast = (a: number, b: number) =>
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    expect(contrast(ground, hover)).toBeGreaterThan(1.03);
  });

  it('does not document a token that no longer exists', () => {
    const documented = [
      ...designSystem.matchAll(/`(--cc-[a-z0-9-]+)`/g),
    ].map((match) => match[1]);

    for (const token of new Set(documented)) {
      expect(darkTokens, `DESIGN-SYSTEM.md documents removed token ${token}`)
        .toHaveProperty(token);
    }
  });
});

describe('DESIGN-SYSTEM.md — terminal palette', () => {
  it('documents every TERM value exactly', () => {
    for (const [key, value] of Object.entries(TERM)) {
      expect(
        designSystem,
        `DESIGN-SYSTEM.md has a stale value for TERM.${key} (expected ${value})`,
      ).toContain(value);
    }
  });

  it('lists every TERM key', () => {
    for (const key of Object.keys(TERM)) {
      expect(designSystem).toContain(`\`${key}\``);
    }
  });
});

describe('AGENTS.md', () => {
  const agents = read('AGENTS.md');

  /**
   * Raised from 200 to 250 (HIVE-145), and to 255 for the harness port's fence
   * and its deep-dive row (HIVE-232).
   *
   * The cap is a forcing function for the file's own opening claim — "this file
   * is deliberately thin" — not a measurement of anything, so the number moves
   * when the always-applicable rules genuinely grow. Two session audits added a
   * "Working a ticket" section that is forty-four lines of rules a session has
   * to have loaded *before* it starts, which is exactly the content the routing
   * table cannot hold: a rule you only read after following a link is a rule
   * you follow after you needed it.
   *
   * What has not changed is what the cap is for. Anything that is reference —
   * how a subsystem works, what a token means, why a decision went the way it
   * did — still belongs in a deep-dive behind the table.
   */
  it('stays under 255 lines — anything longer belongs in a deep-dive', () => {
    expect(agents.split('\n').length).toBeLessThan(255);
  });

  it('routes to every deep-dive doc that exists', () => {
    for (const doc of [
      'docs/terminal-architecture.md',
      'docs/explorer-and-editor.md',
      'docs/state-and-data.md',
      'docs/component-patterns.md',
      'docs/architecture.md',
      'docs/README.md',
      '.claude/DESIGN-SYSTEM.md',
      '.claude/COMPONENTS.md',
    ]) {
      expect(agents, `AGENTS.md does not route to ${doc}`).toContain(doc);
      // And the target must exist — a routing table pointing at a missing file
      // is worse than no table.
      expect(() => read(doc)).not.toThrow();
    }
  });

  it('states the always-on rules', () => {
    expect(agents).toContain('pnpm lint');
    expect(agents).toContain('pnpm type-check');
    expect(agents).toContain('TerminalTransport');
    expect(agents).toContain('selector hook');
    expect(agents).toContain('80%');
  });
});

describe('the amber text colour (HIVE-210, HIVE-223)', () => {
  const declared = (selector: RegExp) =>
    /--cc-amber-text:\s*([^;]+);/.exec(block(tokensCss, selector))?.[1]?.trim();
  const toHex = (colour: string) =>
    `#${parseColour(colour)!
      .slice(0, 3)
      .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
      .join('')}`;

  it('binds the creature colours as Tailwind utilities (HIVE-210)', () => {
    expect(tokensCss).toContain('--color-creep: var(--cc-creep);');
    expect(tokensCss).toContain('--color-chitin: var(--cc-chitin);');
  });

  it('is a utility, and the count-only name is gone', () => {
    expect(tokensCss).toContain('--color-amber-text: var(--cc-amber-text);');
    expect(tokensCss).not.toContain('amber-count');
  });

  it('is the drawn amber in dark', () => {
    expect(declared(/:root\s*\{/)).toBe('var(--cc-amber)');
  });

  it('clears AA on every light ground, in every built-in theme', () => {
    const value = declared(/body\[data-theme='light'\]\s*\{/);
    const match = /^color-mix\(in srgb, var\(--cc-amber\) (\d+)%, var\(--cc-ink\)\)$/.exec(value ?? '');
    expect(match, `unexpected light --cc-amber-text: ${String(value)}`).not.toBeNull();
    const amberShare = Number(match![1]) / 100;
    for (const theme of Object.values(BUILT_IN_THEMES)) {
      const { ui } = theme.modes.light;
      const text = toHex(mixColour(ui.amber, ui.ink, 1 - amberShare));
      for (const ground of ['bg', 'panel', 'panel2', 'chip', 'hover', 'active', 'termBg', 'termRowHover', 'termRowActive'] as const) {
        expect(contrastRatio(text, ui[ground]), `${theme.name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/**
 * HIVE-225: the vendored shadcn primitives used colour names this app never
 * binds (`bg-popover`, `ring-ring`, …), so Tailwind generated nothing and a bare
 * `border` fell back to `currentColor`. None may come back.
 */
const SHADCN_NAME =
  /(?:^|[\s"'`:])(?:bg|text|ring|ring-offset|border|outline)-(?:background|foreground|popover(?:-foreground)?|accent(?:-foreground)?|destructive|ring|muted-foreground|primary(?:-foreground)?|secondary(?:-foreground)?|card(?:-foreground)?|input)\b/;
const UI_DIR = resolve(process.cwd(), 'src/components/ui');
const uiFiles = readdirSync(UI_DIR).filter((f) => f.endsWith('.tsx'));

describe('src/components/ui — no shadcn colour names', () => {
  it('scans the primitives', () => {
    expect(uiFiles).toEqual(expect.arrayContaining(['dialog.tsx', 'dropdown-menu.tsx']));
  });

  it.each(uiFiles)('%s uses only the app’s own colour names', (file) => {
    const source = readFileSync(join(UI_DIR, file), 'utf8');
    expect(source.match(SHADCN_NAME)?.[0]).toBeUndefined();
  });
});

/** Every `src/**` file, for the scans below. */
function sourceFiles(dir = resolve(process.cwd(), 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
const relative = (path: string) => path.slice(process.cwd().length + 1);

describe('menus — one surface, one item recipe (HIVE-225)', () => {
  const files = sourceFiles().filter((f) => !f.endsWith('components/ui/dropdown-menu.tsx'));

  it('no consumer re-states the menu surface', () => {
    const offenders = files.filter((f) =>
      readFileSync(f, 'utf8').includes('rounded-lg border border-border bg-panel p-1'),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('no consumer highlights a menu item with hover', () => {
    const offenders = files.filter((f) => {
      const source = readFileSync(f, 'utf8');
      return source.includes('DropdownMenuItem') && /focus:bg-hover|data-\[highlighted\]:bg-hover/.test(source);
    });
    expect(offenders.map(relative)).toEqual([]);
  });
});

describe('overlays — one scrim (HIVE-225)', () => {
  it('binds the scrim to the theme background', () => {
    expect(tokensCss).toContain('--color-scrim: color-mix(in srgb, var(--cc-bg) 70%, transparent);');
  });

  it('no overlay picks its own veil', () => {
    const offenders = sourceFiles().filter((f) => /\bbg-(?:black|bg)\/\d+/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(relative)).toEqual([]);
  });
});

describe('native controls follow the mode (HIVE-225)', () => {
  const globalCss = read('src/styles/global.css');

  it('declares dark on :root and light under the light theme', () => {
    expect(globalCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark;/);
    expect(globalCss).toMatch(/body\[data-theme='light'\]\s*\{[^}]*color-scheme:\s*light;/);
  });
});

describe('primary buttons — one atom (HIVE-225)', () => {
  /** A quoted class string carrying the brand fill and a horizontal padding is a hand-rolled button. */
  const HAND_ROLLED = /['"`][^'"`]*\bbg-brand-fill[^'"`]*['"`]/g;
  const files = sourceFiles().filter((f) => !f.endsWith('components/ui/button.tsx'));

  it('no file outside button.tsx hand-rolls a primary button', () => {
    const offenders = files.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(HAND_ROLLED)]
        .filter((m) => /\bpx-/.test(m[0]))
        .map(() => relative(f)),
    );
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe('type scale (HIVE-225)', () => {
  const SRC = resolve(process.cwd(), 'src');
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
  const PX = /text-\[(\d+(?:\.\d+)?)px\]/g;
  const EXEMPT = 'type-floor-exempt:';
  /** Display headings sit above the scale; `em` sizes are not matched at all. */
  const DISPLAY_MIN = 18;

  it('scans the source tree', () => {
    // Guards the walk: an empty list would pass the next test vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  it('leaves no arbitrary pixel size below the display headings', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(SRC, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const [, px] of line.matchAll(PX)) {
          const n = Number(px);
          if (n >= DISPLAY_MIN) continue;
          const marked = line.includes(EXEMPT) || (lines[i - 1] ?? '').includes(EXEMPT);
          if (marked && n < 11) continue;
          offenders.push(`src/${file}:${String(i + 1)} text-[${px}px]`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('documents every step of the scale with its size', () => {
    const steps = [...tokensCss.matchAll(/--text-([a-z-]+):\s*([\d.]+px)/g)];
    expect(steps.map(([, name]) => name)).toEqual(['ui-lg', 'ui', 'control', 'ui-sm', 'micro']);
    for (const [, name, size] of steps) {
      expect(designSystem, `DESIGN-SYSTEM.md is missing text-${name} (${size})`).toMatch(
        new RegExp(`\`text-${name}\`\\s*\\|\\s*${size.replace('.', '\\.')}`),
      );
    }
  });
});

describe('radius — Tailwind’s scale, nothing arbitrary (HIVE-224)', () => {
  it('no rounded-[Npx] anywhere in src', () => {
    const offenders = sourceFiles().flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/\brounded(?:-[a-z]{1,2})?-\[/.test(line) ? [`${relative(f)}:${String(i + 1)}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});

describe('tints — one map, in srgb (HIVE-224)', () => {
  it.each(['green', 'amber', 'red', 'brand'])('binds %s’s three steps to the live token', (hue) => {
    expect(tokensCss).toContain(`--color-${hue}-soft: color-mix(in srgb, var(--cc-${hue}) 10%, transparent);`);
    expect(tokensCss).toContain(`--color-${hue}-strong: color-mix(in srgb, var(--cc-${hue}) 16%, transparent);`);
    expect(tokensCss).toContain(`--color-${hue}-edge: color-mix(in srgb, var(--cc-${hue}) 50%, var(--cc-border));`);
  });
});

/** Lines matching `pattern`, unless the line or the one above carries `marker`; comment lines skipped. */
function unmarked(pattern: RegExp, marker: string): string[] {
  return sourceFiles()
    .filter((f) => f.endsWith('.tsx'))
    .flatMap((f) => {
      const lines = readFileSync(f, 'utf8').split('\n');
      return lines.flatMap((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return [];
        if (!pattern.test(line)) return [];
        if (line.includes(marker) || (lines[i - 1] ?? '').includes(marker)) return [];
        return [`${relative(f)}:${String(i + 1)}`];
      });
    });
}

describe('tints — status fills come from the map (HIVE-224)', () => {
  it('no bg/ring tint of green, amber, red or brand mixed by hand', () => {
    expect(
      unmarked(/\b(?:bg|ring)-(?:\[color-mix\(in_srgb,var\(--cc-(?:green|amber|red|brand)\)|(?:green|amber|red|brand)\/\d)/, 'tint-exempt:'),
    ).toEqual([]);
  });
});

describe('tints — tinted borders and strokes come from the map (HIVE-224)', () => {
  it('no border/stroke/outline tint of green, amber, red or brand mixed by hand', () => {
    expect(
      unmarked(/\b(?:border|stroke|outline)-(?:\[color-mix\(in_srgb,var\(--cc-(?:green|amber|red|brand)\)|(?:green|amber|red|brand)\/\d)/, 'tint-exempt:'),
    ).toEqual([]);
  });
});

describe('colour literals — none unannotated in components (HIVE-224)', () => {
  it('no rgb()/rgba(), no white/black utility or mix, no arbitrary accent var', () => {
    expect(
      unmarked(
        /rgba?\(|\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|accent|outline|decoration|divide|caret)-(?:white|black)\b|(?:color-mix|-gradient)\([^'"`]*\b(?:white|black)\b|accent-\[var\(/,
        'colour-literal-exempt:',
      ),
    ).toEqual([]);
  });
});

describe('DESIGN-SYSTEM.md records the scales (HIVE-224)', () => {
  const doc = readFileSync(resolve(process.cwd(), '.claude/DESIGN-SYSTEM.md'), 'utf8');
  it('has a radius scale and the tint map, with their exemption markers', () => {
    expect(doc).toMatch(/^## Radius$/m);
    for (const name of ['rounded-xs', 'rounded-md', 'rounded-lg', 'rounded-xl', 'green-soft', 'green-strong', 'green-edge', 'tint-exempt:', 'colour-literal-exempt:']) {
      expect(doc).toContain(name);
    }
  });
  it('names no utility that does not exist', () => {
    expect(doc).not.toMatch(/`border-soft`/);
  });
});
