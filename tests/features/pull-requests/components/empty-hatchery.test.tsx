import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EmptyHatchery } from '@features/pull-requests/components/empty-hatchery';
import { useAppearanceStore } from '@stores/appearance-store';
import { useUiStore } from '@stores/ui-store';
import { expectNoHexColour, inLight } from '@tests/support/light';

const motion = { reduced: false };
vi.mock('@/hooks/use-reduced-motion', () => ({ useReducedMotion: () => motion.reduced }));

beforeEach(() => {
  motion.reduced = false;
  useUiStore.getState().reset();
});

afterEach(() => {
  act(() => useAppearanceStore.getState().setTheme('dark'));
});

describe('EmptyHatchery', () => {
  it('renders in light on tokens alone (HIVE-210)', () => {
    inLight();
    const { container } = render(<EmptyHatchery />);
    expect(screen.getByRole('heading', { name: 'The Hatchery is quiet' })).toBeInTheDocument();
    expectNoHexColour(container);
  });

  it('says the Hatchery is quiet and what comes next', () => {
    render(<EmptyHatchery />);
    expect(screen.getByRole('heading', { name: 'The Hatchery is quiet' })).toBeInTheDocument();
    expect(screen.getByText(/No pull request is open or in draft\./)).toBeInTheDocument();
    expect(screen.getByText(/The next one hatches here when a session or the builder opens it\./)).toBeInTheDocument();
  });

  it('Search older PRs opens the panel with the search', async () => {
    render(<EmptyHatchery />);
    await userEvent.click(screen.getByRole('button', { name: 'Search older PRs' }));
    expect(useUiStore.getState().prSearchOpen).toBe(true);
  });

  it('sets each button\'s icon beside its label, not above it', () => {
    // Preflight makes an svg a block; without a flex button the icon takes its own line.
    render(<EmptyHatchery />);
    for (const name of ['Search older PRs', 'New session']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/\binline-flex\b.*\bitems-center\b/);
    }
  });

  it('New session opens the picker', async () => {
    render(<EmptyHatchery />);
    await userEvent.click(screen.getByRole('button', { name: 'New session' }));
    expect(useUiStore.getState().picker).toBe(true);
  });

  it('rocks, beats and drifts with motion (HIVE-221)', () => {
    const { container } = render(<EmptyHatchery />);
    expect(container.querySelector('[data-part="egg"]')).toHaveClass('animate-cceggrock');
    expect(container.querySelectorAll('[data-part="spore"]')).toHaveLength(5);
    expect(container.querySelector('[data-part="heart"]')).toHaveClass('animate-cceggheart');
    expect(container.querySelector('[data-part="crack"]')).toBeNull();
  });

  it('holds still under reduced motion: no animation, no spores', () => {
    motion.reduced = true;
    const { container } = render(<EmptyHatchery />);
    expect(container.querySelector('[class*="animate-"]')).toBeNull();
    expect(container.querySelectorAll('[data-part="spore"]')).toHaveLength(0);
  });

  it('gives each mount its own SVG ids, so two eggs never share a gradient', () => {
    const { container } = render(
      <>
        <EmptyHatchery />
        <EmptyHatchery />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ref of container.innerHTML.matchAll(/url\(#([^)]+)\)/g)) {
      expect(ids).toContain(ref[1]);
    }
  });

  it('paints in dark on tokens alone', () => {
    const { container } = render(<EmptyHatchery />);
    expectNoHexColour(container);
  });
});
