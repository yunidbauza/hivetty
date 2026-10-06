import { fireEvent, render, screen, within } from '@testing-library/react';
import { act, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session, Terminal } from '@/types/entity';
import type { Ticket } from '@/types/ticket';
import { pickTab, SessionPanel } from '@components/layout/session-panel';
import type { SessionPlan } from '@shared/plan-contract';
import { PANEL_WIDTHS, useAppearanceStore } from '@stores/appearance-store';
import { fileKey, useEditorStore } from '@stores/editor-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

const { resolvePaths } = vi.hoisted(() => ({ resolvePaths: vi.fn() }));

vi.mock('@lib/explorer/fs-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/explorer/fs-client')>()),
  resolvePaths,
}));

vi.mock('@features/explorer/components/explorer-panel', () => ({
  ExplorerPanel: ({ changesId }: { changesId?: string }) => <div>explorer {changesId ?? 'none'}</div>,
}));

vi.mock('@features/work/components/ticket-tab', () => ({
  TicketTab: ({ ticketKey }: { ticketKey: string }) => <div>ticket {ticketKey}</div>,
}));

vi.mock('@features/pull-requests/components/session-pr-tab', () => ({
  SessionPrTab: ({ sessionPr }: { sessionPr: { pr: { n: number } } }) => <div>pr tab {sessionPr.pr.n}</div>,
}));

/** Point the seeded `hero-refresh` session at a ticket, or at none. */
const workOn = (ticket: string | undefined) => {
  act(() => {
    useHiveStore.setState((state) => {
      const { ticket: _old, ...rest } = state.entities['hero-refresh'] as Session;
      const next: Session = ticket === undefined ? rest : { ...rest, ticket };
      return { entities: { ...state.entities, 'hero-refresh': next } };
    });
  });
};

const plan = (entityId: string): SessionPlan => ({
  entityId,
  source: 'task-tools',
  allDone: false,
  tasks: [
    { id: '1', title: 'Alpha', status: 'completed' },
    { id: '2', title: 'Beta', status: 'in_progress' },
  ],
});

const changed = [
  { path: 'a.ts', mark: 'M' as const, added: 1, removed: 0 },
  { path: 'b.ts', mark: 'A' as const, added: 2, removed: 0 },
];

let narrow = false;

beforeEach(() => {
  narrow = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: narrow,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  useHiveStore.getState().reset();
  seedDemoFleet();
  // The seed puts PR 482 on hero-refresh; only the PR tab's tests want it.
  useHiveStore.setState({ prs: [] });
  useUiStore.getState().reset();
  useAppearanceStore.getState().reset();
  useUiStore.getState().openTab('hero-refresh', 'sessions');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const tabRow = () => screen.getByRole('tablist');

describe('pickTab', () => {
  it('keeps the persisted tab where it exists, else Plan, else Files', () => {
    expect(pickTab(['plan', 'files'], 'files')).toBe('files');
    expect(pickTab(['plan', 'files'], 'ticket')).toBe('plan');
    expect(pickTab(['files'], 'plan')).toBe('files');
  });
});

describe('SessionPanel (HIVE-201)', () => {
  beforeEach(() => {
    // The seeded session works on a ticket; these are about Plan and Files alone.
    workOn(undefined);
    useHiveStore.getState().setPlan('hero-refresh', plan('hero-refresh'));
    useHiveStore.getState().setChangedFiles('hero-refresh', changed);
  });

  it('open on a session with a plan: Plan and Files 2, and the Plan body', () => {
    render(<SessionPanel rowRef={createRef()} />);
    const tabs = within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Plan', 'Files 2']);
    expect(
      screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.startsWith('1 of 2 tasks') === true),
    ).toBeInTheDocument();
  });

  it('is a WAI-ARIA tablist: only tabs inside, roving tabIndex, arrows and Home, linked panel (HIVE-225)', () => {
    render(<SessionPanel rowRef={createRef()} />);
    const list = tabRow();
    expect(within(list).queryAllByRole('button')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Close the session panel' })).toBeInTheDocument();

    const plan = screen.getByRole('tab', { name: 'Plan' });
    expect(plan).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Files 2' })).toHaveAttribute('tabindex', '-1');

    act(() => plan.focus());
    fireEvent.keyDown(plan, { key: 'ArrowRight' });
    expect(useAppearanceStore.getState().sessionPanelTab).toBe('files');
    expect(screen.getByRole('tab', { name: 'Files 2' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Files 2' }), { key: 'Home' });
    expect(useAppearanceStore.getState().sessionPanelTab).toBe('plan');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Plan' }).id);
    expect(screen.getByRole('tab', { name: 'Files 2' })).toHaveAttribute('aria-controls', panel.id);
  });

  it('may shrink to its minimum beside a crowded stage (HIVE-223)', () => {
    render(<SessionPanel rowRef={createRef()} />);
    const panel = screen.getByRole('complementary', { name: 'Session panel' });
    expect(panel).not.toHaveClass('shrink-0');
    expect(panel.style.minWidth).toBe(`${String(PANEL_WIDTHS.session.min)}px`);
  });

  it('a tab click picks it, and Files shows the explorer for main’s id', () => {
    render(<SessionPanel rowRef={createRef()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Files 2' }));
    expect(useAppearanceStore.getState().sessionPanelTab).toBe('files');
    expect(screen.getByText('explorer hero-refresh')).toBeInTheDocument();
  });

  it('the chevron closes it to the strip, and a strip icon opens that tab', () => {
    render(<SessionPanel rowRef={createRef()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close the session panel' }));
    expect(useAppearanceStore.getState().sessionPanelOpen).toBe(false);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Plan, 1 of 2 done' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2 files changed' }));
    expect(useAppearanceStore.getState()).toMatchObject({ sessionPanelOpen: true, sessionPanelTab: 'files' });
  });

  it('with no plan, the persisted Plan tab falls back to Files', () => {
    useHiveStore.getState().setPlan('hero-refresh', null);
    render(<SessionPanel rowRef={createRef()} />);
    expect(within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Files 2']);
    expect(screen.getByText('explorer hero-refresh')).toBeInTheDocument();
  });

  it('a narrow window keeps the strip even when open', () => {
    narrow = true;
    render(<SessionPanel rowRef={createRef()} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Session panel' })).toBeInTheDocument();
  });

  it('draws nothing at home, or on the overmind', () => {
    act(() => {
      useUiStore.getState().selectPlace('home');
    });
    const { container, unmount } = render(<SessionPanel rowRef={createRef()} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    act(() => {
      useUiStore.getState().openTab('orch');
    });
    expect(render(<SessionPanel rowRef={createRef()} />).container).toBeEmptyDOMElement();
  });

  it('after /clear, reads the plan and files main published under the terminal id (R2)', () => {
    const base = useHiveStore.getState().entities['hero-refresh'] as Session;
    const successor: Session = { ...base, id: 'hero-2', terminalId: 'hero-refresh' };
    act(() => {
      useHiveStore.setState((state) => ({ entities: { ...state.entities, 'hero-2': successor } }));
      useUiStore.getState().openTab('hero-2', 'sessions');
    });
    render(<SessionPanel rowRef={createRef()} />);
    expect(within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Plan', 'Files 2']);
  });
});

describe('SessionPanel: the Ticket tab (HIVE-202)', () => {
  const listed: Ticket = {
    key: 'HIVE-193',
    status: 'In Progress',
    statusCategory: 'in-progress',
    title: 'Fix it',
    priority: null,
    assignee: null,
  };

  beforeEach(() => {
    workOn('HIVE-193');
    useHiveStore.getState().setPlan('hero-refresh', plan('hero-refresh'));
    useHiveStore.getState().setChangedFiles('hero-refresh', changed);
    useHiveStore.setState({ tickets: [listed] });
  });

  it('sits between Plan and Files, and shows the tab for the session’s key', () => {
    render(<SessionPanel rowRef={createRef()} />);
    expect(within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Plan', 'Ticket', 'Files 2']);

    fireEvent.click(screen.getByRole('tab', { name: 'Ticket' }));

    expect(useAppearanceStore.getState().sessionPanelTab).toBe('ticket');
    expect(screen.getByText('ticket HIVE-193')).toBeInTheDocument();
  });

  it('closed, the strip says the key and status, and opens the panel on Ticket', () => {
    act(() => {
      useAppearanceStore.getState().setSessionPanelOpen(false);
    });
    render(<SessionPanel rowRef={createRef()} />);
    const fact = screen.getByRole('button', { name: 'HIVE-193 · In Progress' });
    expect(fact).toHaveAttribute('title', 'HIVE-193 · In Progress');

    fireEvent.click(fact);

    expect(useAppearanceStore.getState()).toMatchObject({ sessionPanelOpen: true, sessionPanelTab: 'ticket' });
    expect(screen.getByText('ticket HIVE-193')).toBeInTheDocument();
  });

  it('closed, the strip says the key alone before the ticket is read', () => {
    useHiveStore.setState({ tickets: [] });
    act(() => {
      useAppearanceStore.getState().setSessionPanelOpen(false);
    });
    render(<SessionPanel rowRef={createRef()} />);

    expect(screen.getByRole('button', { name: 'HIVE-193' })).toHaveAttribute('title', 'HIVE-193');
  });

  it('a session on no ticket has no Ticket tab', () => {
    workOn(undefined);
    render(<SessionPanel rowRef={createRef()} />);

    expect(within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Plan', 'Files 2']);
  });
});

describe('SessionPanel: a terminal (HIVE-201)', () => {
  beforeEach(() => {
    const terminal: Terminal = {
      kind: 'terminal',
      id: 't1',
      project: 'nova-web',
      cwd: '/repos/nova-web',
      status: 'prompt',
      createdAt: 1,
      lines: [],
    };
    act(() => {
      useHiveStore.setState((state) => ({ entities: { ...state.entities, t1: terminal } }));
      useUiStore.getState().openTab('t1', 'sessions');
    });
  });

  it('gets Files only, open and closed', () => {
    render(<SessionPanel rowRef={createRef()} />);
    expect(within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Files']);
    expect(screen.getByText('explorer none')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close the session panel' }));
    expect(screen.queryByRole('button', { name: /^Plan/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Files' })).toBeInTheDocument();
  });
});

describe('SessionPanel: the plan file (HIVE-201)', () => {
  beforeEach(() => {
    resolvePaths.mockReset();
    useEditorStore.getState().reset();
    useHiveStore.getState().setPlan('hero-refresh', {
      ...plan('hero-refresh'),
      file: '/abs/.hive/plans/x.md',
      fileAt: 1,
    });
  });

  it('resolves it under the session and opens it in the editor', async () => {
    resolvePaths.mockResolvedValue([{ relPath: '.hive/plans/x.md', rootKey: '' }]);
    render(<SessionPanel rowRef={createRef()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /x\.md/ }));
      await Promise.resolve();
    });
    expect(resolvePaths).toHaveBeenCalledWith('nova-web', 'hero-refresh', ['/abs/.hive/plans/x.md']);
    expect(useEditorStore.getState().activeKey).toBe(fileKey('nova-web', '.hive/plans/x.md', ''));
  });

  it('opens nothing when main will not serve it', async () => {
    resolvePaths.mockResolvedValue([null]);
    render(<SessionPanel rowRef={createRef()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /x\.md/ }));
      await Promise.resolve();
    });
    expect(useEditorStore.getState().activeKey).toBeNull();
  });
});

describe('the PR tab (HIVE-209)', () => {
  const withPr = () => {
    act(() => {
      useHiveStore.getState().reset();
      seedDemoFleet();
    });
  };
  const selected = () =>
    within(tabRow())
      .getAllByRole('tab')
      .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent;

  it('exists only with a session PR, between Ticket and Files, with its dot', () => {
    render(<SessionPanel rowRef={createRef()} />);
    expect(screen.queryByRole('tab', { name: /^PR/ })).toBeNull();
    withPr();
    const labels = within(tabRow()).getAllByRole('tab').map((tab) => tab.textContent);
    expect(labels).toContain('PR');
    expect(labels.indexOf('PR')).toBe(labels.length - 2);
    expect(within(screen.getByRole('tab', { name: /^PR/ })).getByTestId('pr-dot')).toHaveClass(/^bg-/);
  });

  it('appearing does not switch the tab; choosing it draws the PR tab', () => {
    render(<SessionPanel rowRef={createRef()} />);
    const before = selected();
    withPr();
    expect(selected()).toBe(before);
    fireEvent.click(screen.getByRole('tab', { name: /^PR/ }));
    expect(screen.getByText('pr tab 482')).toBeInTheDocument();
  });

  it('closed: the strip carries the PR icon with its fact and dot', () => {
    act(() => {
      useAppearanceStore.getState().setSessionPanelOpen(false);
    });
    withPr();
    render(<SessionPanel rowRef={createRef()} />);
    const icon = screen.getByRole('button', { name: /^#482 · / });
    expect(within(icon).getByTestId('pr-dot')).toBeInTheDocument();
  });
});
