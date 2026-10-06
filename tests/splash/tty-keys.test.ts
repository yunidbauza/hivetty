// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The cursor sits after the `tty` keys in the markup, so a key that is merely
 * transparent still pushes it right: it floated past HIVE's end for the ~1.4s
 * before the first key landed, then jumped back. The keys must take no room
 * until they are typed, and `key-in` must give it back as it reveals them.
 */

const appRoot = join(import.meta.dirname, '../..');
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe.each(['src/splash/splash.css', 'src/about/about.css'])('%s', (path) => {
  const css = strip(readFileSync(join(appRoot, path), 'utf8'));

  it('keeps an untyped tty key out of the layout', () => {
    const rule = /\.wordmark \.tty i \{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/max-width:\s*0/);
    expect(rule).toMatch(/overflow:\s*hidden/);
  });

  it('gives the room back when key-in reveals the key', () => {
    const frames = /@keyframes key-in \{([\s\S]*?)\n\}/.exec(css)![1];
    expect(frames).toMatch(/max-width:\s*1em/);
  });

  it('shows the keys in full under reduced motion', () => {
    const media = css.slice(css.indexOf('prefers-reduced-motion'));
    const rule = /[^}]*\.wordmark \.tty i[^{]*\{([^}]*)\}/.exec(media)![1];
    expect(rule).toMatch(/max-width:\s*none/);
  });
});

describe('src/about/about.css', () => {
  const css = strip(readFileSync(join(appRoot, 'src/about/about.css'), 'utf8'));

  it('holds the centred lockup still while tty types: the box is its finished width from the start', () => {
    // About centres the wordmark, so a tty that grew key by key would slide HIVE left with each key.
    const rule = /\.wordmark \.tty \{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/width:\s*calc\(3ch \+ [^)]*\)/);
  });
});
