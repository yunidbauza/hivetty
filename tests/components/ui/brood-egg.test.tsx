import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BroodEgg } from '@components/ui/brood-egg';

/** The Brood's egg, shared by the empty Hatchery and `SwarmCreature`. */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BroodEgg', () => {
  it("draws the Hatchery's whole scene by default", () => {
    const { container } = render(<BroodEgg />);

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '-160 -150 320 230');
  });

  it('takes a crop and the caller’s size classes', () => {
    const { container } = render(<BroodEgg viewBox="-80 -96 160 150" className="h-full w-full" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '-80 -96 160 150');
    expect(svg).toHaveClass('overflow-visible', 'h-full', 'w-full');
  });

  it('runs its loop, and holds still under reduced motion', () => {
    const { container, unmount } = render(<BroodEgg />);
    expect(container.querySelectorAll('[class*="animate-"]').length).toBeGreaterThan(0);
    unmount();

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })),
    );
    const still = render(<BroodEgg />);
    expect(still.container.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
  });
});
