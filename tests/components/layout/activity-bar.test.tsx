import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AgentSummary } from '@shared/agent-contract';

import { ActivityBar } from '@components/layout/activity-bar';
import { TooltipProvider } from '@components/ui/tooltip';
import { useAppearanceStore } from '@stores/appearance-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';
import { prRecord } from '@tests/support/prs';

const renderBar = () =>
  render(
    <TooltipProvider>
      <ActivityBar />
    </TooltipProvider>,
  );

describe('ActivityBar (HIVE-195)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useAppearanceStore.getState().reset();
  });

  it('lists the five places, Home active on launch', () => {
    renderBar();
    const bar = screen.getByRole('navigation', { name: 'Places' });

    for (const name of ['Home', 'Sessions', 'Work', 'Agents', 'PRs']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Work' })).not.toHaveAttribute('aria-current');
    expect(bar).toHaveClass('w-[var(--cc-bar-w)]');
  });

  it('a click selects the place and marks it active', async () => {
    renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Work' }));

    expect(useUiStore.getState()).toMatchObject({ place: 'work', panelOpen: true });
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Work' })).toHaveClass('text-ink', 'bg-panel-2');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveClass('text-muted');
  });

  it('Sessions returns to the session opened there, or the Overmind once it has ended', async () => {
    useHiveStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().openTab('hero-refresh', 'sessions');
    renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Work' }));
    await userEvent.click(screen.getByRole('button', { name: /^Sessions/ }));
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');

    await userEvent.click(screen.getByRole('button', { name: 'Work' }));
    act(() => useHiveStore.getState().setSessionStatus('hero-refresh', 'terminated'));
    await userEvent.click(screen.getByRole('button', { name: /^Sessions/ }));
    expect(useUiStore.getState().activeTab).toBe('orch');
  });

  it('Settings opens settings', async () => {
    renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(useUiStore.getState().settings).toBe(true);
  });

  it('names the glyph Hive TTY whatever the team is called', () => {
    useAppearanceStore.setState({ teamName: 'Platform' });
    renderBar();
    expect(screen.getByRole('img', { name: 'Hive TTY' })).toBeInTheDocument();
    expect(screen.queryByText('Platform')).not.toBeInTheDocument();
  });

  it('draws the app mark, tile-less, as the brand, from the base the app is served at', () => {
    renderBar();
    const brand = screen.getByRole('img', { name: 'Hive TTY' });
    expect(brand.tagName).toBe('IMG');
    expect(brand).toHaveAttribute('src', `${import.meta.env.BASE_URL}app-mark.png`);
  });
});

describe('the PRs count (HIVE-205)', () => {
  const live = { kind: 'live', stale: false, repos: 1 } as const;

  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it('shows how many PRs need you, in amber', () => {
    useHiveStore.setState({
      prSource: live,
      prs: [prRecord({ number: 1, checks: 'failing', mine: true }), prRecord({ number: 2, checks: 'failing', mine: true })],
    });
    renderBar();
    const item = screen.getByRole('button', { name: 'PRs, 2 need you' });
    expect(within(item).getByText('2')).toHaveClass('text-amber-text');
  });

  it('shows nothing at zero, or while the first read is out', () => {
    useHiveStore.setState({ prSource: live, prs: [prRecord({ checks: 'passing', findings: 0 })] });
    const { unmount } = renderBar();
    expect(within(screen.getByRole('button', { name: 'PRs' })).queryByText(/^\d+$/)).toBeNull();
    unmount();
    useHiveStore.setState({ prSource: { kind: 'loading' }, prs: [prRecord({ checks: 'failing', mine: true })] });
    renderBar();
    expect(within(screen.getByRole('button', { name: 'PRs' })).queryByText(/^\d+$/)).toBeNull();
  });
});

describe('the working counts (HIVE-196)', () => {
  const agent = (over: Partial<AgentSummary> = {}): AgentSummary => ({
    name: 'a',
    description: 'Watches.',
    icon: 'Robot',
    status: 'sleeping',
    wake: { on: [] },
    mcp: [],
    tools: [],
    rotateAfter: 50,
    runs: [],
    ...over,
  });

  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it('Sessions and Agents carry their working counts, in grey', () => {
    seedDemoFleet();
    useHiveStore.getState().hydrateAgents([
      agent({ name: 'a', status: 'working' }),
      agent({ name: 'b', status: 'working' }),
      agent({ name: 'c', status: 'asking' }),
    ]);
    renderBar();

    const sessions = screen.getByRole('button', { name: 'Sessions, 4 working' });
    expect(within(sessions).getByText('4')).toHaveClass('text-muted');
    const agents = screen.getByRole('button', { name: 'Agents, 2 working' });
    expect(within(agents).getByText('2')).toHaveClass('text-muted');
  });

  it('a zero draws nothing, and Home and Work never carry a count', () => {
    seedDemoFleet();
    renderBar();
    expect(within(screen.getByRole('button', { name: 'Agents' })).queryByText(/^\d+$/)).toBeNull();
    expect(within(screen.getByRole('button', { name: 'Home' })).queryByText(/^\d+$/)).toBeNull();
    expect(within(screen.getByRole('button', { name: 'Work' })).queryByText(/^\d+$/)).toBeNull();
  });
});

describe('the connection item (HIVE-196)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
  });

  it('sits at the foot, above Settings', () => {
    renderBar();
    const item = screen.getByTestId('connection-item');
    const settings = screen.getByRole('button', { name: 'Settings' });
    // The browser target under test: no bridge, so the item reads Demo.
    expect(item).toHaveAccessibleName('Connection: Demo');
    expect(item.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the theme toggle (HIVE-213)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useAppearanceStore.getState().reset();
  });

  it('is named for the theme it switches to', () => {
    useAppearanceStore.setState({ theme: 'dark' });
    const { unmount } = renderBar();
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
      'title',
      'Switch to light theme',
    );
    unmount();

    useAppearanceStore.setState({ theme: 'light' });
    renderBar();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('a click flips dark to light and back', async () => {
    useAppearanceStore.setState({ theme: 'dark' });
    renderBar();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(useAppearanceStore.getState().theme).toBe('light');

    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(useAppearanceStore.getState().theme).toBe('dark');
  });

  it('from system, lands on the opposite of what the OS shows', async () => {
    useAppearanceStore.setState({ theme: 'system', systemDark: true });
    const { unmount } = renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(useAppearanceStore.getState().theme).toBe('light');
    unmount();

    useAppearanceStore.setState({ theme: 'system', systemDark: false });
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(useAppearanceStore.getState().theme).toBe('dark');
  });

  it('sits between the connection item and Settings', () => {
    renderBar();
    const item = screen.getByTestId('connection-item');
    const toggle = screen.getByRole('button', { name: /^Switch to (light|dark) theme$/ });
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(item.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
