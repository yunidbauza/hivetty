import { describe, expect, it } from 'vitest';

import { isSvgFile } from '@lib/explorer/is-svg';

describe('isSvgFile', () => {
  it('matches .svg in any case, and nothing else', () => {
    expect(isSvgFile('logo.svg')).toBe(true);
    expect(isSvgFile('LOGO.SVG')).toBe(true);
    expect(isSvgFile('logo.svgz')).toBe(false);
    expect(isSvgFile('logo.png')).toBe(false);
  });
});
