import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShipTrack } from '@features/pull-requests/components/ship-track';
import type { LedgerEntry } from '@shared/ledger-contract';
import { useHiveStore } from '@stores/hive-store';
import { fixturePr } from '@tests/support/hatchery';

const T0 = Date.parse('2026-10-03T10:00:00Z');
const slug = 'acme/incorpx-server';
let seq = 0;
const entry = (over: Partial<LedgerEntry>): LedgerEntry => {
  seq += 1;
  return {
    id: `20261003-1000${String(seq).padStart(2, '0')}-${String(seq).padStart(3, '0')}`,
    ts: T0,
    from: 'shipper',
    kind: 'post',
    body: '',
    ...over,
  };
};
const stage = (name: string, ts: number) => entry({ ts, meta: { pr: 1182, repo: slug, stage: name } });

beforeEach(() => {
  seq = 0;
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 90 * 60_000);
  useHiveStore.getState().reset();
});
afterEach(() => vi.useRealTimers());

describe('ShipTrack', () => {
  it('glows the held stop with its time, and says who is on it now', () => {
    useHiveStore.setState({
      ledger: [
        entry({ kind: 'claim', meta: { task: `${slug}#1182` } }),
        stage('self-review', T0 + 60_000),
        stage('findings', T0 + 10 * 60_000),
        entry({ kind: 'ask', to: 'fixer', ts: T0 + 11 * 60_000, body: `Fix ${slug}#1182: finding 1` }),
        entry({ from: 'fixer', ts: T0 + 20 * 60_000, body: 'On it: adding the registered-agent check', meta: { pr: 1182, repo: slug } }),
      ],
    });
    render(<ShipTrack pr={fixturePr()} />);
    const band = screen.getByRole('group', { name: 'Ship track' });
    const now = within(band).getByText('Findings').closest('li')!;
    expect(now).toHaveAttribute('data-state', 'now');
    expect(now).toHaveTextContent('1h 20m');
    expect(within(band).getByText('Self review').closest('li')).toHaveAttribute('data-state', 'done');
    expect(within(band).getByText('Approval').closest('li')).toHaveAttribute('data-state', 'next');
    const note = within(band).getByText(/fixer · 1h 20m · On it: adding the registered-agent check/);
    // It truncates on a narrow stage, so its whole line is on hover.
    expect(note).toHaveAttribute('title', note.textContent);
    // Its own line under the stops, however wide the stage.
    expect(note.closest('[data-note]')).toHaveClass('basis-full');
  });

  it('draws the short track for a PR nobody holds, with no now line', () => {
    render(<ShipTrack pr={fixturePr({ state: 'draft' })} />);
    const band = screen.getByRole('group', { name: 'Ship track' });
    expect(within(band).getByText('Draft').closest('li')).toHaveAttribute('data-state', 'now');
    expect(within(band).queryByText(/·/)).toBeNull();
  });

  it('sits a merged PR at Merge, every stop ticked', () => {
    render(<ShipTrack pr={fixturePr({ state: 'merged', mergedAt: '2026-10-03T11:00:00Z' })} />);
    const stops = within(screen.getByRole('group', { name: 'Ship track' }))
      .getAllByRole('listitem')
      .filter((li) => li.hasAttribute('data-state'));
    expect(stops.every((li) => li.getAttribute('data-state') === 'done')).toBe(true);
  });

  it('is a size container whose stops other than the current one keep only their dot below 760px (HIVE-225)', () => {
    useHiveStore.setState({
      ledger: [entry({ kind: 'claim', meta: { task: `${slug}#1182` } }), stage('findings', T0 + 10 * 60_000)],
    });
    render(<ShipTrack pr={fixturePr()} />);
    const band = screen.getByRole('group', { name: 'Ship track' });
    expect(band).toHaveClass('@container');
    expect(within(band).getByRole('list')).toHaveClass('min-w-0');
    expect(within(band).getByText('Findings')).not.toHaveClass('@max-[760px]:sr-only');
    expect(within(band).getByText('Approval')).toHaveClass('@max-[760px]:sr-only');
  });
});
