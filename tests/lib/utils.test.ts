import { describe, expect, it } from 'vitest';

import { cn } from '@lib/utils';

/**
 * Reference pattern for pure-function tests (story 013). Utility modules are
 * the cheapest coverage in the repo and the natural home for logic that would
 * otherwise hide inside a component.
 */
describe('cn', () => {
  it('joins class names', () => {
    expect(cn('flex', 'items-center')).toBe('flex items-center');
  });

  it('drops falsy values so conditional classes read cleanly', () => {
    expect(cn('flex', false && 'hidden', undefined, null, 'gap-2')).toBe(
      'flex gap-2',
    );
  });

  it('lets the last conflicting Tailwind utility win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-ink', 'text-muted')).toBe('text-muted');
  });

  it('treats the type scale as sizes, not colours', () => {
    expect(cn('text-ui', 'text-muted')).toBe('text-ui text-muted');
    expect(cn('text-control', 'text-muted')).toBe('text-control text-muted');
    expect(cn('text-micro', 'text-amber-text')).toBe('text-micro text-amber-text');
    expect(cn('text-ui-sm', 'text-ui-lg')).toBe('text-ui-lg');
    expect(cn('text-micro', 'text-control')).toBe('text-control');
    expect(cn('text-ui', 'text-[12px]')).toBe('text-[12px]');
  });

  it('flattens arrays and objects', () => {
    expect(cn(['flex', 'gap-2'], { 'text-brand': true, hidden: false })).toBe(
      'flex gap-2 text-brand',
    );
  });
});
