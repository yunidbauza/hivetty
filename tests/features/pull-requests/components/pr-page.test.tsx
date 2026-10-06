import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrPage } from '@features/pull-requests/components/pr-page';
import { prKey, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { prDetail } from '@tests/support/pr-detail';

const key = prKey('acme', 'incorpx-server', 1182);
const load = vi.fn(() => Promise.resolve());
const row = hatchRow({}, { flap: 'MUTATING', tone: 'green' });

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({
    loadPrDetail: load,
    prDetails: { [key]: { key, state: 'ok', detail: prDetail(), readAt: Date.now() } },
    ledger: [
      {
        id: '20261003-085000-001',
        ts: Date.parse('2026-10-03T08:50:00Z'),
        from: 'builder',
        to: 'shipper',
        kind: 'ask',
        body: 'Ship it',
        meta: { pr: 1182, repo: 'acme/incorpx-server', stage: 'intake' },
      },
    ],
  });
  useHiveStore.setState((state) => ({ entities: { ...state.entities, builder: { kind: 'agent', id: 'builder' } as never } }));
});

describe('PrPage', () => {
  it('reads the detail on open', () => {
    render(<PrPage row={row} />);
    expect(load).toHaveBeenCalledWith('acme', 'incorpx-server', 1182);
  });

  it('heads with the number, title, flap and the one-line facts', () => {
    render(<PrPage row={row} />);
    expect(screen.getByText('#1182')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fee rule validator for Delaware filings' })).toBeInTheDocument();
    const facts = screen.getByTestId('pr-facts');
    expect(facts).toHaveTextContent(
      'incorpx-server · feat/incorp-598-fee-rule → main · +214 −38 · 9 files · opened by builder for you',
    );
    expect(screen.getByText('+214')).toHaveClass('text-green');
    expect(screen.getByText('−38')).toHaveClass('text-red');
  });

  it('has the Conversation tab, the GitHub button and the ship track', () => {
    render(<PrPage row={row} />);
    expect(screen.getByRole('radio', { name: 'Conversation' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/acme/incorpx-server/pull/1182',
    );
    expect(screen.getByRole('group', { name: 'Ship track' })).toBeInTheDocument();
  });

  it('falls back to Conversation for a tab this PR does not have', () => {
    useUiStore.setState({ prTab: 'insights' as never });
    render(<PrPage row={row} />);
    expect(screen.getByRole('radio', { name: 'Conversation' })).toBeChecked();
  });

  it('is read-only once merged: no comment box, actions only GitHub', () => {
    render(
      <PrPage
        row={hatchRow({ state: 'merged', mergedAt: '2026-10-03T11:32:00Z' }, { flap: 'HATCHED', at: '11:32', tone: 'brand' })}
      />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Merge/ })).toBeNull();
  });

  it('shows a skeleton before the first read, and the problem in its place on failure', () => {
    useHiveStore.setState({ prDetails: { [key]: { key, state: 'loading' } } });
    const { rerender } = render(<PrPage row={row} />);
    expect(screen.getByRole('status', { name: 'Loading pull request' })).toBeInTheDocument();
    useHiveStore.setState({ prDetails: { [key]: { key, state: 'failed', problem: 'GitHub said no.' } } });
    rerender(<PrPage row={row} />);
    expect(screen.getByText('GitHub said no.')).toBeInTheDocument();
  });

  it('has a Files tab labelled with the changed-file count, and shows the tree on it (HIVE-207)', async () => {
    useHiveStore.setState({ loadPrDiff: vi.fn(() => Promise.resolve()) });
    render(<PrPage row={row} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Files 9' }));
    expect(screen.getByRole('complementary', { name: 'Changed files' })).toBeInTheDocument();
  });
});

describe('the Checks tab (HIVE-206)', () => {
  const loadPrChecks = vi.fn(() => Promise.resolve());
  beforeEach(() => {
    vi.useFakeTimers();
    useHiveStore.setState({ loadPrChecks });
  });
  afterEach(() => vi.useRealTimers());

  // Async acts: the poller skips a tick while the last read's promise is unsettled, so microtasks must flush between steps.
  it('reads nothing while hidden, once on showing, once a minute while shown, and nothing once hidden again', async () => {
    render(<PrPage row={row} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(loadPrChecks).not.toHaveBeenCalled();

    await act(async () => { useUiStore.getState().setPrTab('checks'); await Promise.resolve(); });
    expect(loadPrChecks).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadPrChecks).toHaveBeenCalledTimes(2);

    await act(async () => { useUiStore.getState().setPrTab('conversation'); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(loadPrChecks).toHaveBeenCalledTimes(2);
  });

  it('reads the clicked push once, without stacking on the read still out, then keeps the minute (HIVE-206)', async () => {
    let release: (() => void) | undefined;
    loadPrChecks.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<PrPage row={row} />);
    await act(async () => { useUiStore.getState().setPrTab('checks'); await Promise.resolve(); });
    expect(loadPrChecks).toHaveBeenCalledTimes(1);

    await act(async () => { useUiStore.getState().showPrRun('older'); await Promise.resolve(); });
    expect(loadPrChecks).toHaveBeenCalledTimes(1);
    await act(async () => { release?.(); await Promise.resolve(); await Promise.resolve(); });
    expect(loadPrChecks).toHaveBeenCalledTimes(2);
    expect(loadPrChecks).toHaveBeenLastCalledWith('acme', 'incorpx-server', 1182, 'feat/incorp-598-fee-rule', 'older');

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadPrChecks).toHaveBeenCalledTimes(3);
  });

  it('carries a red dot while a check fails', () => {
    render(<PrPage row={hatchRow({ checks: 'failing' }, { flap: 'MUTATING', tone: 'green' })} />);
    expect(screen.getByRole('radio', { name: 'Checks, failing' })).toBeInTheDocument();
  });
});

describe('the Timeline tab (HIVE-208)', () => {
  it('is the last tab, and choosing it shows the Timeline instead of the Conversation', async () => {
    useHiveStore.setState({ loadPrTimeline: vi.fn(() => Promise.resolve()) });
    render(<PrPage row={row} />);
    const tabs = within(screen.getByRole('radiogroup', { name: 'Tab' })).getAllByRole('radio');
    expect(tabs.at(-1)?.textContent).toBe('Timeline');
    await userEvent.click(screen.getByRole('radio', { name: 'Timeline' }));
    expect(screen.getByRole('region', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Conversation' })).toBeNull();
  });
});

describe('PrPage on a narrow stage (HIVE-223)', () => {
  it('is a size container whose sidebar shows inline only from 760px', () => {
    render(<PrPage row={row} />);
    expect(screen.getByRole('region', { name: 'Pull request #1182' })).toHaveClass('@container');
    expect(screen.getByRole('complementary', { name: 'Pull request properties' })).toHaveClass(
      'hidden',
      '@min-[760px]:block',
    );
    expect(screen.getByRole('button', { name: 'Details' })).toHaveClass('@min-[760px]:hidden');
  });

  it('measures the Files and Checks thresholds against the tab column, not the page the sidebar shares', async () => {
    useHiveStore.setState({ loadPrDiff: vi.fn(() => Promise.resolve()) });
    render(<PrPage row={row} />);
    const page = screen.getByRole('region', { name: 'Pull request #1182' });
    const sidebar = screen.getByRole('complementary', { name: 'Pull request properties' });
    const column = (el: HTMLElement): HTMLElement | null => {
      for (let up = el.parentElement; up !== null && up !== page; up = up.parentElement) {
        if (up.classList.contains('@container')) return up;
      }
      return null;
    };
    expect(column(screen.getByRole('list', { name: 'Conversation' }))).not.toBeNull();
    expect(column(screen.getByRole('list', { name: 'Conversation' }))).not.toContainElement(sidebar);
    await userEvent.click(screen.getByRole('radio', { name: 'Files 9' }));
    const tree = screen.getByRole('complementary', { name: 'Changed files' });
    expect(column(tree)).not.toBeNull();
    expect(column(tree)).not.toContainElement(sidebar);
  });

  it('opens the properties as an overlay from Details, and Escape closes it and returns focus', async () => {
    render(<PrPage row={row} />);
    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(details);
    const dialog = screen.getByRole('dialog', { name: 'Pull request details' });
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveClass('@min-[760px]:hidden');
    expect(dialog).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Pull request details' })).not.toBeInTheDocument();
    expect(details).toHaveFocus();
  });

  it('closes from a click outside it, or from Details again', async () => {
    render(<PrPage row={row} />);
    const details = screen.getByRole('button', { name: 'Details' });
    await userEvent.click(details);
    await userEvent.click(screen.getByTestId('pr-details-veil'));
    expect(screen.queryByRole('dialog', { name: 'Pull request details' })).not.toBeInTheDocument();

    await userEvent.click(details);
    expect(screen.getByRole('dialog', { name: 'Pull request details' })).toBeInTheDocument();
    await userEvent.click(details);
    expect(screen.queryByRole('dialog', { name: 'Pull request details' })).not.toBeInTheDocument();
    expect(details).toHaveFocus();
  });
});
