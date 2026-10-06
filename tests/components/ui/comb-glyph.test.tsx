import { Robot } from '@phosphor-icons/react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CombGlyph } from '@components/ui/comb-glyph';

/** The not-wired places' glyph: the icon in a comb cell that tries to light and fails. */
afterEach(() => {
  vi.unstubAllGlobals();
});

const comb = () => document.querySelector('[data-glyph="comb"]');

describe('CombGlyph', () => {
  it('holds the icon in the middle of three cells', () => {
    render(<CombGlyph icon={Robot} />);

    expect(comb()?.querySelectorAll('polygon[data-cell]')).toHaveLength(3);
    // The Phosphor icon draws its own svg inside the comb.
    expect(comb()?.querySelector('svg')).not.toBeNull();
  });

  it('runs the rim, the failure and the icon on one loop', () => {
    render(<CombGlyph icon={Robot} />);

    expect(comb()?.querySelector('[data-part="rim"]')).toHaveClass('animate-cccombrim');
    expect(comb()?.querySelector('[data-part="fail"]')).toHaveClass('animate-cccombfail');
    expect(comb()?.querySelector('[data-part="icon"]')).toHaveClass('animate-cccombicon');
  });

  it('holds the dark cell still under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })),
    );
    render(<CombGlyph icon={Robot} />);

    expect(comb()?.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
  });
});
