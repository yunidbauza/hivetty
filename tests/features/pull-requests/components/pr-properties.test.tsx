import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '@/types/entity';

import { PrProperties } from '@features/pull-requests/components/pr-properties';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { prDetail } from '@tests/support/pr-detail';

const checks = [
  { name: 'lint', status: 'success' as const, startedAt: '2026-10-03T10:00:00Z', completedAt: '2026-10-03T10:00:41Z', url: 'https://ci/lint', app: 'github-actions', jobId: null },
  { name: 'integration', status: 'failure' as const, startedAt: '2026-10-03T10:00:00Z', completedAt: '2026-10-03T10:03:10Z', url: 'https://ci/int', app: 'github-actions', jobId: null },
  { name: 'e2e', status: 'running' as const, startedAt: '2026-10-03T10:00:00Z', completedAt: null, url: 'https://ci/e2e', app: 'github-actions', jobId: null },
  { name: 'build', status: 'queued' as const, startedAt: null, completedAt: null, url: 'https://ci/build', app: 'github-actions', jobId: null },
];
const row = hatchRow({ session: 'fee-rule' }, { flap: 'MUTATING', tone: 'green', github: 'Open · 2 open findings, fixer on it' });

beforeEach(() => {
  useHiveStore.getState().reset();
  useHiveStore.setState((state) => ({
    entities: {
      ...state.entities,
      'fee-rule': { kind: 'session', id: 'fee-rule', project: 'incorpx-server', ticket: 'INCORP-598', status: 'working' } as Session,
    },
  }));
});

const section = (name: string) => screen.getByRole('heading', { name }).parentElement!;

describe('PrProperties', () => {
  it('reads a running check by how long it has run and a queued one as queued', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-03T10:02:10Z') });
    render(<PrProperties row={row} detail={prDetail({ checks })} />);
    expect(screen.getByRole('button', { name: /e2e/ })).toHaveTextContent('running 2m');
    expect(screen.getByRole('button', { name: /build/ })).toHaveTextContent('queued');
    vi.useRealTimers();
  });

  it("shows the flap and GitHub's words", () => {
    render(<PrProperties row={row} detail={prDetail()} />);
    expect(within(section('Status')).getByText('MUTATING')).toBeInTheDocument();
    expect(within(section('Status')).getByText('Open · 2 open findings, fixer on it')).toBeInTheDocument();
  });

  it('says HATCHED alone for a merged PR, with no "Merged" line under it', () => {
    const hatched = hatchRow({ state: 'merged' }, { flap: 'HATCHED', at: '00:21', tone: 'brand', github: 'Merged 00:21' });
    render(<PrProperties row={hatched} detail={prDetail()} />);
    expect(within(section('Status')).getByText('HATCHED 00:21')).toBeInTheDocument();
    expect(within(section('Status')).queryByText(/Merged/)).toBeNull();
  });

  it('keeps the merge line when the flap shows only the time but the merge was yesterday', () => {
    const hatched = hatchRow({ state: 'merged' }, { flap: 'HATCHED', at: '18:10', tone: 'brand', github: 'Merged yesterday 18:10' });
    render(<PrProperties row={hatched} detail={prDetail()} />);
    expect(within(section('Status')).getByText('Merged yesterday 18:10')).toBeInTheDocument();
  });

  it('keeps the merge line for an older merge', () => {
    const hatched = hatchRow({ state: 'merged' }, { flap: 'HATCHED', at: '09:05', tone: 'brand', github: 'Merged 12 Aug' });
    render(<PrProperties row={hatched} detail={prDetail()} />);
    expect(within(section('Status')).getByText('Merged 12 Aug')).toBeInTheDocument();
  });

  it('keeps the merge line when mergedAt is null, so HATCHED is not bare', () => {
    const hatched = hatchRow({ state: 'merged' }, { flap: 'HATCHED', tone: 'brand', github: 'Merged' });
    render(<PrProperties row={hatched} detail={prDetail()} />);
    expect(within(section('Status')).getByText('Merged')).toBeInTheDocument();
  });

  it('lists every check with its state and the failing count in red', () => {
    render(<PrProperties row={row} detail={prDetail({ checks })} />);
    expect(screen.getByText('1 failing')).toHaveClass('text-red');
    expect(screen.getByRole('button', { name: /integration/ })).toHaveTextContent('3m 10s');
    expect(screen.getByRole('button', { name: /e2e/ }).querySelector('[data-check="running"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /build/ }).querySelector('[data-check="queued"]')).not.toBeNull();
  });

  it('opens the Checks tab on the check’s job when a check is clicked (HIVE-206)', () => {
    useUiStore.getState().reset();
    render(<PrProperties row={row} detail={prDetail({ checks: [
      { name: 'integration', status: 'failure', startedAt: null, completedAt: null, url: 'https://x', app: 'github-actions', jobId: 77 },
    ] })} />);
    fireEvent.click(screen.getByRole('button', { name: /integration/ }));
    expect(useUiStore.getState()).toMatchObject({ prTab: 'checks', prJob: 77 });
  });

  it('opens a check with no page on GitHub in the Checks tab too', () => {
    render(<PrProperties row={row} detail={prDetail({ checks: [{ ...checks[0]!, url: null }] })} />);
    expect(screen.queryByRole('link', { name: /lint/ })).toBeNull();
    expect(screen.getByRole('button', { name: /lint/ })).toBeInTheDocument();
    expect(within(section('Checks')).getByText('lint')).toBeInTheDocument();
  });

  it('lists reviewers by their latest verdict, and requested ones', () => {
    render(
      <PrProperties
        row={row}
        detail={prDetail({
          reviews: [
            { author: 'maria', state: 'COMMENTED', body: 'q', submittedAt: '2026-10-03T10:00:00Z', url: 'r1' },
            { author: 'maria', state: 'APPROVED', body: '', submittedAt: '2026-10-03T11:00:00Z', url: 'r2' },
          ],
          reviewRequests: ['dana'],
        })}
      />,
    );
    expect(within(section('Reviewers')).getByText('approved')).toBeInTheDocument();
    expect(within(section('Reviewers')).getByText('requested')).toBeInTheDocument();
  });

  it("links the session's ticket and its state", () => {
    render(<PrProperties row={row} detail={prDetail()} />);
    expect(within(section('Linked')).getByText('INCORP-598')).toBeInTheDocument();
  });

  it('draws no Linked section without a live session', () => {
    render(<PrProperties row={hatchRow()} detail={prDetail()} />);
    expect(screen.queryByRole('heading', { name: 'Linked' })).toBeNull();
  });
});
