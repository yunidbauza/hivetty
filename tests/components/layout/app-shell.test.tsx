import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@components/layout/app-shell';
import { TooltipProvider } from '@components/ui/tooltip';
import { STAGE_MIN, useAppearanceStore } from '@stores/appearance-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { resetProjectConfig } from '@lib/project-config';
import { seedDemoFleet } from '@tests/support/demo-fleet';

vi.mock('@xterm/xterm');
vi.mock('@xterm/addon-fit');

const stubWindowWidth = (narrow: boolean) => {
  const mql = { matches: narrow, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => mql as unknown as MediaQueryList));
};

const renderShell = () =>
  render(
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>,
  );

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.getState().reset();
    useAppearanceStore.getState().reset();
    useHiveStore.getState().reset();
    // jsdom's window is 1,024px, which reads as narrow (HIVE-211). These cases are about a wide window.
    stubWindowWidth(false);
  });
  afterEach(() => {
    resetProjectConfig();
    vi.unstubAllGlobals();
  });

  it('draws one tree with no setting seeded: the bar, the list panel and the stage, no header (HIVE-213)', () => {
    const { container } = renderShell();

    expect(container.querySelector('header')).toBeNull();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Places' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /rail/i })).not.toBeInTheDocument();
  });

  /**
   * The `min-*: 0` overrides are the whole layout. A flex item defaults to
   * `min-*: auto` and refuses to shrink below its content, so the row would
   * push past the viewport and a long terminal line would widen the stage.
   * happy-dom does no layout, so assert the contract on the class list.
   */
  it('keeps the flex children shrinkable', () => {
    const { container } = renderShell();
    const row = container.querySelector('div > div.flex.min-h-0');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('min-h-0', 'flex-1');
    // An explicit floor, not `auto`: content cannot widen the stage, and the rails yield to it (HIVE-223).
    expect(screen.getByRole('main').style.minWidth).toBe(`${String(STAGE_MIN)}px`);
  });

  it('mounts the session panel for a session on stage (HIVE-201)', () => {
    seedDemoFleet();
    act(() => useUiStore.getState().openTab('hero-refresh', 'sessions'));
    renderShell();
    expect(screen.getByRole('complementary', { name: 'Session panel' })).toBeInTheDocument();
  });
});

describe('AppShell — the narrow window (HIVE-211)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useAppearanceStore.getState().reset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tells ui-store the window is narrow', () => {
    stubWindowWidth(true);

    render(
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>,
    );

    expect(useUiStore.getState().narrow).toBe(true);
  });
});
