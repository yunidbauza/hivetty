import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrsStage } from '@features/pull-requests/components/prs-stage';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { prRecord } from '@tests/support/prs';

beforeEach(() => {
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({
    loadPrDetail: () => Promise.resolve(),
    prSource: { kind: 'live', stale: false, repos: 1 },
    prs: [
      prRecord({ number: 10, title: 'Quiet one', checks: 'passing', findings: 0 }),
      prRecord({ number: 11, title: 'Needs me', checks: 'failing', mine: true }),
    ],
  });
});

const shown = () => screen.getByRole('region', { name: /^Pull request #/ }).getAttribute('aria-label');

describe('PrsStage', () => {
  it('opens on the first PR that needs you', () => {
    render(<PrsStage />);
    expect(shown()).toBe('Pull request #11');
  });

  it('opens on the PR last open while it is still listed, and falls back when it leaves', () => {
    useUiStore.setState({ prPage: { owner: 'acme', repo: 'nova-web', n: 10 } });
    render(<PrsStage />);
    expect(shown()).toBe('Pull request #10');
    act(() => useHiveStore.setState((state) => ({ prs: state.prs.filter((pr) => pr.number !== 10) })));
    expect(shown()).toBe('Pull request #11');
  });

  it('shows the empty Hatchery for a live, empty sweep', () => {
    useHiveStore.setState({ prs: [] });
    render(<PrsStage />);
    expect(screen.getByRole('heading', { name: 'The Hatchery is quiet' })).toBeInTheDocument();
  });

  it('shows the empty Hatchery when only hatched (merged) PRs are left', () => {
    useHiveStore.setState({ prs: [prRecord({ number: 12, state: 'merged', mergedAt: '2026-10-05T08:00:00Z' })] });
    render(<PrsStage />);
    expect(screen.getByRole('heading', { name: 'The Hatchery is quiet' })).toBeInTheDocument();
  });

  it('asks for a pick while the sweep is loading', () => {
    useHiveStore.setState({ prs: [], prSource: { kind: 'loading' } });
    render(<PrsStage />);
    expect(screen.getByText('Pick a pull request')).toBeInTheDocument();
  });

  it('says why gh gave nothing (HIVE-211)', () => {
    useHiveStore.setState({ prs: [], prSource: { kind: 'unconfigured', message: 'Pull requests need the desktop app.', reason: null } });
    render(<PrsStage />);
    expect(screen.getByRole('heading', { name: "Pull requests aren't available here" })).toBeInTheDocument();
    expect(screen.queryByText('Pick a pull request')).toBeNull();
  });
});
