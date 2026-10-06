import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The splash and the About window paint nothing until their own stylesheet
 * applies. Without the guard, a window that draws first (always under the dev
 * server, where Vite injects the CSS from the module; on a slow cold start in
 * a build) showed the copy for a moment as unstyled black text.
 *
 * Read as files: what matters is that the hiding rule is in the document
 * itself, ahead of any stylesheet, and that the stylesheet outranks it.
 */
const appRoot = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(appRoot, path), 'utf8');

describe.each([
  ['splash.html', 'src/splash/splash.css'],
  ['about.html', 'src/about/about.css'],
])('%s', (html, css) => {
  it('hides its body in the document, before any stylesheet can load', () => {
    const head = read(html).split('</head>')[0]!;
    expect(head).toMatch(/<style>\s*body \{\s*visibility: hidden;\s*\}\s*<\/style>/);
  });

  it('is revealed by its own stylesheet, with a selector that outranks the guard', () => {
    expect(read(css)).toMatch(/html body \{\s*visibility: visible;\s*\}/);
  });
});
