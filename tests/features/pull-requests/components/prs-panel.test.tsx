import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clockTime } from '@lib/format-clock';
import { PrsPanel } from '@features/pull-requests/components/prs-panel';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { prRecord } from '@tests/support/prs';

/* Counts the flap's renders: a row that bails out of its memo never renders its flap. */
const flapRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@features/pull-requests/components/flap', async (original) => {
  const real = await original<typeof import('@features/pull-requests/components/flap')>();
  return {
    ...real,
    Flap: (props: Parameters<typeof real.Flap>[0]) => {
      flapRenders.count += 1;
      return real.Flap(props);
    },
  };
});

const sweep = [
  prRecord({ number: 10, title: 'Running', checks: 'running', findings: 0, updatedAt: '2026-10-03T09:00:00Z' }),
  prRecord({ number: 11, title: 'Needs me', checks: 'failing', mine: true, updatedAt: '2026-10-03T08:00:00Z' }),
  prRecord({ number: 12, title: 'A draft', state: 'draft', findings: 0, updatedAt: '2026-10-03T07:00:00Z' }),
  prRecord({ number: 13, title: 'Landed', state: 'merged', mergedAt: '2026-10-03T06:00:00Z', findings: 0 }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  /*
    `refreshPrs` is stubbed: `usePrRefresh` fires the sweep on mount, and the
    real action settles on `unconfigured` with no bridge, clearing the seeded
    PRs before an assertion runs.
  */
  useHiveStore.setState({
    prs: sweep,
    prSource: { kind: 'live', stale: false, repos: 1 },
    refreshPrs: () => Promise.resolve(),
  });
});

const rowNames = () =>
  screen.getAllByRole('button', { name: /^#\d+ / }).map((b) => b.getAttribute('aria-label')?.split(',')[0]);

describe('PrsPanel (the Hatchery)', () => {
  it('says how many are open and how many need you', () => {
    render(<PrsPanel />);
    expect(screen.getByRole('heading', { name: 'Pull requests' })).toBeInTheDocument();
    expect(screen.getByText('3 open', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('1 need you')).toHaveClass('text-amber-text');
  });

  it('leaves the need-you part out at zero', () => {
    useHiveStore.setState({ prs: [sweep[0]!] });
    render(<PrsPanel />);
    expect(screen.queryByText(/need you/)).toBeNull();
  });

  it('orders the open rows as useHatchery() does: SUMMONS first', () => {
    render(<PrsPanel />);
    expect(rowNames()).toEqual(['#11 Needs me', '#10 Running', '#12 A draft']);
  });

  it('folds the merged ones under HATCHED, folded by default', async () => {
    render(<PrsPanel />);
    const fold = screen.getByRole('button', { name: /hatched · 1 · last 24h/i });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Landed')).toBeNull();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Landed')).toBeInTheDocument();
  });

  it('draws no HATCHED line with nothing merged', () => {
    useHiveStore.setState({ prs: sweep.slice(0, 3) });
    render(<PrsPanel />);
    expect(screen.queryByRole('button', { name: /hatched/i })).toBeNull();
  });

  it('opens the PR page on a row click, never GitHub (HIVE-213)', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PrsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^#10 / }));
    expect(useUiStore.getState().prPage).toMatchObject({ owner: 'acme', repo: 'nova-web', n: 10 });
    expect(useUiStore.getState().place).toBe('prs');
    expect(open).not.toHaveBeenCalled();
  });

  it('shows the search icon only while the sweep is live (R3)', () => {
    useHiveStore.setState({ prs: [], prSource: { kind: 'unconfigured', message: 'Pull requests need the desktop app.', reason: null } });
    render(<PrsPanel />);
    expect(screen.queryByRole('button', { name: 'Search pull requests' })).toBeNull();
    expect(within(screen.getByText(/need the desktop app/)).queryByRole('button')).toBeNull();
  });

  it('keeps the first-sweep skeleton', () => {
    useHiveStore.setState({ prs: [], prSource: { kind: 'loading' } });
    render(<PrsPanel />);
    expect(screen.getByTestId('prs-skeleton')).toBeInTheDocument();
  });
});

describe('PrsPanel source states', () => {
  it('shows a skeleton and no button while the first sweep is out', () => {
    act(() => useHiveStore.setState({ prs: [], prSource: { kind: 'loading' } }));
    render(<PrsPanel />);
    expect(screen.getByLabelText('Loading pull requests')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** Main writes the sentence; the panel frames it with the spire (HIVE-93). */
  it('leads the unconfigured state with a spire, keeping main’s sentence', () => {
    act(() =>
      useHiveStore.setState({
        prs: [],
        prSource: {
          kind: 'unconfigured',
          message: 'No configured project is a GitHub repository.',
          reason: 'no-repos',
        },
      }),
    );
    render(<PrsPanel />);
    expect(document.querySelector('[data-creature]')).toHaveAttribute('data-creature', 'spire');
    expect(screen.getByText('No configured project is a GitHub repository.')).toBeInTheDocument();
  });

  it('offers a retry when the first sweep failed', () => {
    act(() => useHiveStore.setState({ prs: [], prSource: { kind: 'failed', message: 'Could not reach GitHub.' } }));
    render(<PrsPanel />);
    expect(screen.getByText('Could not reach GitHub.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  /** Staleness over emptiness: the rows stay, with a warning above them. */
  it('keeps a stale list on screen and says so', () => {
    act(() => useHiveStore.setState({ prSource: { kind: 'live', stale: true, repos: 5 } }));
    render(<PrsPanel />);
    expect(screen.getByText('Could not reach GitHub. These may be out of date.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^#10 / })).toBeInTheDocument();
  });

  it('names when GitHub failed and when the list was read (HIVE-211)', () => {
    const loaded = new Date('2026-10-03T10:31:00').getTime();
    const failed = new Date('2026-10-03T10:42:00').getTime();
    act(() =>
      useHiveStore.setState({ prSource: { kind: 'live', stale: true, repos: 5, failedAt: failed }, prsReadAt: loaded }),
    );
    render(<PrsPanel />);
    expect(
      screen.getByText(`Couldn't reach GitHub at ${clockTime(failed)}. Showing what was loaded at ${clockTime(loaded)}.`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^#10 / })).toBeInTheDocument();
  });

  it('answers an empty sweep with how many repositories it swept, at rail size', () => {
    act(() => useHiveStore.setState({ prs: [], prSource: { kind: 'live', stale: false, repos: 4 } }));
    render(<PrsPanel />);
    expect(screen.getByText('No open pull requests of yours across 4 repositories.')).toBeInTheDocument();
    const img = document.querySelector('[data-creature]');
    expect(img).toHaveAttribute('data-creature', 'spire');
    expect(img).toHaveStyle({ height: '44px' });
  });

  it('says “1 repository”, not “1 repositories”', () => {
    act(() => useHiveStore.setState({ prs: [], prSource: { kind: 'live', stale: false, repos: 1 } }));
    render(<PrsPanel />);
    expect(screen.getByText('No open pull requests of yours across 1 repository.')).toBeInTheDocument();
  });
});

describe('PrsPanel, searching and still rows', () => {
  it('opens the search row from the icon, and the search replaces the rows', async () => {
    render(<PrsPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Search pull requests' }));
    expect(screen.getByRole('searchbox', { name: 'Search pull requests' })).toHaveFocus();

    act(() => {
      useUiStore.setState({ prSearchTerm: 'fee' });
      useHiveStore.setState((state) => ({
        prSearch: { ...state.prSearch, results: [prRecord({ number: 77, title: 'Someone else', checks: 'failing', mine: false })] },
      }));
    });
    expect(await screen.findByRole('button', { name: /^#77 Someone else, BURROWED/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^#11 / })).toBeNull();
  });

  it('closing the search clears it', async () => {
    useUiStore.setState({ prSearchOpen: true, prSearchTerm: 'fee' });
    render(<PrsPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Search pull requests' }));
    expect(useUiStore.getState().prSearchTerm).toBe('');
    expect(useUiStore.getState().prSearchOpen).toBe(false);
  });

  it('does not re-render a row for a ledger append that names no PR', () => {
    render(<PrsPanel />);
    const before = flapRenders.count;
    act(() => {
      useHiveStore.setState((state) => ({
        ledger: [...state.ledger, { id: '20261003-120000-001', ts: Date.now(), from: 'builder', kind: 'post', body: 'task 3 done' }],
      }));
    });
    expect(flapRenders.count).toBe(before);
  });
});
