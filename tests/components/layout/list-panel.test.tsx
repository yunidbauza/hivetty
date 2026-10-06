import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListPanel } from '@components/layout/list-panel';
import { PANEL_WIDTHS } from '@stores/appearance-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore, type Place } from '@stores/ui-store';
import { resetProjectConfig } from '@lib/project-config';
import { seedDemoFleet, seedDemoProjectConfig } from '@tests/support/demo-fleet';
import { prRecord } from '@tests/support/prs';

vi.mock('@features/projects/components/sessions-panel', () => ({ SessionsPanel: () => <p>sessions-panel</p> }));
vi.mock('@features/work/components/work-panel', () => ({
  WorkPanel: () => <p>work-list</p>,
}));
vi.mock('@features/agents/components/agents-panel', () => ({ AgentsPanel: () => <p>agents-panel</p> }));
vi.mock('@features/pull-requests/components/prs-panel', () => ({ PrsPanel: () => <p>prs-panel</p> }));

describe('ListPanel (HIVE-195)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
    // Every place listed (HIVE-211): a project, an agent, and Work and PRs still loading.
    seedDemoFleet();
    seedDemoProjectConfig();
  });
  afterEach(() => resetProjectConfig());

  it.each<[Place, string, string]>([
    ['sessions', 'Sessions list', 'sessions-panel'],
    ['work', 'Work list', 'work-list'],
    ['agents', 'Agents list', 'agents-panel'],
    ['prs', 'PRs list', 'prs-panel'],
  ])('mounts %s’s panel', (place, label, marker) => {
    useUiStore.setState({ place });

    render(<ListPanel rowRef={createRef()} />);

    const region = screen.getByRole('region', { name: label });
    expect(region).toHaveClass('w-[var(--cc-list-w)]', 'shrink', 'bg-panel');
    expect(screen.getByText(marker)).toBeInTheDocument();
  });

  it('may shrink to its minimum beside a crowded stage (HIVE-223)', () => {
    useUiStore.setState({ place: 'sessions' });
    render(<ListPanel rowRef={createRef()} />);
    const panel = screen.getByRole('region', { name: 'Sessions list' });
    expect(panel).not.toHaveClass('shrink-0');
    expect(panel).toHaveClass('shrink');
    expect(panel.style.minWidth).toBe(`${String(PANEL_WIDTHS.list.min)}px`);
  });

  it('draws nothing on Home', () => {
    const { container } = render(<ListPanel rowRef={createRef()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing when the panel is closed', () => {
    useUiStore.setState({ place: 'work', panelOpen: false });
    const { container } = render(<ListPanel rowRef={createRef()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ListPanel, the Hatchery (HIVE-205)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it('draws no PRs panel for a quiet Hatchery, unless a search is open (D15)', () => {
    useUiStore.setState({ place: 'prs', panelOpen: true });
    useHiveStore.setState({ prs: [], prSource: { kind: 'live', stale: false, repos: 1 } });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.queryByRole('region', { name: 'PRs list' })).toBeNull();
    act(() => useUiStore.setState({ prSearchOpen: true }));
    expect(screen.getByRole('region', { name: 'PRs list' })).toBeInTheDocument();
  });

  it('slides the Hatchery in when the first PR appears, never on mount (R4)', () => {
    useUiStore.setState({ place: 'prs', panelOpen: true, prSearchOpen: false });
    useHiveStore.setState({ prs: [], prSource: { kind: 'live', stale: false, repos: 1 } });
    render(<ListPanel rowRef={createRef()} />);
    act(() => useHiveStore.setState({ prs: [prRecord()] }));
    expect(screen.getByRole('region', { name: 'PRs list' }).className).toContain('animate-ccslidein');
  });

  it('does not slide a Hatchery that was never quiet (R4)', () => {
    useUiStore.setState({ place: 'prs', panelOpen: true });
    useHiveStore.setState({ prs: [prRecord()], prSource: { kind: 'live', stale: false, repos: 1 } });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.getByRole('region', { name: 'PRs list' }).className).not.toContain('animate-ccslidein');
  });
});

describe('ListPanel, no list without items (HIVE-211)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it('draws no Work panel when Jira is not connected', () => {
    useUiStore.setState({ place: 'work', panelOpen: true });
    useHiveStore.setState({ ticketSource: { kind: 'unconfigured' } });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.queryByRole('region', { name: 'Work list' })).toBeNull();
  });

  it('draws no Agents panel with no agent defined', () => {
    useUiStore.setState({ place: 'agents', panelOpen: true });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.queryByRole('region', { name: 'Agents list' })).toBeNull();
  });

  it('draws no Sessions panel with no project', () => {
    useUiStore.setState({ place: 'sessions', panelOpen: true });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.queryByRole('region', { name: 'Sessions list' })).toBeNull();
  });

  it('draws no PRs panel while gh is signed out', () => {
    useUiStore.setState({ place: 'prs', panelOpen: true });
    useHiveStore.setState({ prSource: { kind: 'unconfigured', message: 'm', reason: 'unauthenticated' } });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.queryByRole('region', { name: 'PRs list' })).toBeNull();
  });
});

describe('ListPanel, the narrow overlay (HIVE-211)', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it('sits beside the stage when wide', () => {
    useUiStore.setState({ place: 'work', panelOpen: true });
    render(<ListPanel rowRef={createRef()} />);
    expect(screen.getByRole('region', { name: 'Work list' })).not.toHaveClass('absolute');
    expect(screen.queryByTestId('list-veil')).toBeNull();
  });

  it('overlays the stage while narrow, and the veil or Escape closes it', async () => {
    useUiStore.setState({ place: 'work', panelOpen: true, narrow: true });
    render(<ListPanel rowRef={createRef()} />);
    const region = screen.getByRole('region', { name: 'Work list' });
    expect(region).toHaveClass('absolute', 'shadow-lg');
    await userEvent.click(screen.getByTestId('list-veil'));
    expect(useUiStore.getState().panelOpen).toBe(false);

    act(() => useUiStore.setState({ panelOpen: true }));
    await userEvent.keyboard('{Escape}');
    expect(useUiStore.getState().panelOpen).toBe(false);
  });

  it('Escape does nothing when wide', async () => {
    useUiStore.setState({ place: 'work', panelOpen: true });
    render(<ListPanel rowRef={createRef()} />);
    await userEvent.keyboard('{Escape}');
    expect(useUiStore.getState().panelOpen).toBe(true);
  });
});
