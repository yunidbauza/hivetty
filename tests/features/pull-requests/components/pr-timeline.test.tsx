import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrTimeline } from '@features/pull-requests/components/pr-timeline';
import type { PrTimeline as Timeline } from '@shared/github-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import { useAppearanceStore } from '@stores/appearance-store';
import { prKey, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { expectNoHexColour, inLight } from '@tests/support/light';

const MIN = 60_000;
const T0 = new Date(2026, 9, 3, 11, 0).getTime();
const at = (m: number) => new Date(T0 + m * MIN).toISOString();

const { pr } = hatchRow({}, { flap: 'MUTATING', tone: 'green' });
const key = prKey(pr.owner, pr.repo, pr.n);
const slug = `${pr.owner}/${pr.repo}`;
const named = { pr: pr.n, repo: slug };
const SHA = '7c21e0f4a9b8';
const COMMIT_URL = `https://github.com/${slug}/commit/${SHA}`;
const COMMENT_URL = `https://github.com/${slug}/pull/1182#issuecomment-1`;

const e = (id: string, m: number, over: Partial<LedgerEntry>): LedgerEntry => ({ id, ts: T0 + m * MIN, from: 'shipper', kind: 'post', body: '', ...over });
const stage = (id: string, m: number, name: string) => e(id, m, { meta: { ...named, stage: name } });
const ledger: LedgerEntry[] = [
  e('i', 4, { from: 'builder', kind: 'ask', to: 'shipper', meta: { ...named, stage: 'intake' } }),
  e('c', 4, { kind: 'claim', meta: { task: `${slug}#${String(pr.n)}` } }),
  stage('s-intake', 4, 'intake'),
  stage('s-self', 6, 'self-review'),
  e('a1', 6, { kind: 'ask', to: 'acr', body: `https://github.com/${slug}/pull/1182 --self` }),
  e('a1r', 34, { from: 'acr', kind: 'answer', thread: 'a1', to: 'shipper', body: `self review of ${slug}#1182: clean`, meta: { mode: 'self', findings: 0 } }),
  stage('s-fix', 34, 'fix-self'),
  e('f1', 34, { kind: 'ask', to: 'fixer', body: `${slug}#1182 findings` }),
  e('f1r', 60, { from: 'fixer', kind: 'answer', thread: 'f1', to: 'shipper' }),
  stage('s-ready', 60, 'ready'),
  stage('s-ci', 61, 'ci'),
  stage('s-findings', 110, 'findings'),
  e('a2r', 140, { from: 'acr', kind: 'answer', thread: 'a2', to: 'shipper', meta: { review_url: 'R1', findings: 3 } }),
];
const timeline: Timeline = {
  createdAt: at(0), mergedAt: null, isDraft: false,
  commits: [{ oid: SHA, at: at(1), url: COMMIT_URL }],
  runs: [{ id: 9, number: 2204, url: 'u', sha: SHA, workflow: 'CI', startedAt: at(61), endedAt: at(70), state: 'failed', failedJobs: ['integration'] }],
  reviews: [{ at: at(140), author: 'acr-bot', state: 'COMMENTED', url: 'R1' }],
  comments: [{ at: at(150), author: 'maria-k', url: COMMENT_URL }],
  events: [{ kind: 'ready', at: at(60), actor: null }],
};

const loadPrTimeline = vi.fn(() => Promise.resolve());
const seed = () => useHiveStore.setState({ ledger, prTimelines: { [key]: { key, state: 'ok', timeline, readAt: T0 } } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 190 * MIN);
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({ loadPrTimeline });
});
afterEach(() => vi.useRealTimers());

afterEach(() => {
  act(() => useAppearanceStore.getState().setTheme('dark'));
});

describe('PrTimeline', () => {
  it('reads on mount, once a minute while shown, and not after it unmounts', async () => {
    const { unmount } = render(<PrTimeline pr={pr} />);
    expect(loadPrTimeline).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n);
    expect(loadPrTimeline).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadPrTimeline).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(loadPrTimeline).toHaveBeenCalledTimes(2);
  });

  it('shows a skeleton before the first answer', () => {
    render(<PrTimeline pr={pr} />);
    expect(screen.getByRole('status', { name: 'Loading timeline' })).toBeInTheDocument();
  });

  it('ticks the axis at its measured width when the lanes arrive after the skeleton, and again on resize', () => {
    let width = 900;
    let resize: () => void = () => undefined;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { resize = cb; }
      observe() { /* measured through `resize` */ }
      disconnect() { /* nothing held */ }
    });
    render(<PrTimeline pr={pr} />);
    act(() => seed());
    expect(screen.getByText('12:30')).toBeInTheDocument();
    width = 400;
    act(() => resize());
    expect(screen.queryByText('12:30')).toBeNull();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders in light on tokens alone (HIVE-210)', () => {
    seed();
    inLight();
    const { container } = render(<PrTimeline pr={pr} />);
    expect(screen.getByRole('heading', { name: /where the 3h 10m went/i })).toBeInTheDocument();
    expectNoHexColour(container);
  });

  it('draws every lane and its marks', () => {
    seed();
    render(<PrTimeline pr={pr} />);
    for (const lane of ['Flap', 'Commits', 'CI', 'Reviews', 'Comments', 'Agents']) expect(screen.getAllByText(lane)[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run #2204 · failed, integration, 9m · on 7c21e0f' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Commit 7c21e0f/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Comment · Maria/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^acr · 3 findings/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^fixer held it/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^MUTATING/ })).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /where the 3h 10m went/i })).toBeInTheDocument();
  });

  it('shows the tooltip on hover and on focus', () => {
    seed();
    render(<PrTimeline pr={pr} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Run #2204/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('on 7c21e0f');
    fireEvent.mouseLeave(screen.getByRole('button', { name: /^Run #2204/ }));
    fireEvent.focus(screen.getByRole('button', { name: /^Comment · Maria/ }));
    expect(screen.getByRole('tooltip').textContent).toContain('Comment · Maria');
  });

  it('opens each mark where it lives', () => {
    seed();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PrTimeline pr={pr} />);
    fireEvent.click(screen.getByRole('button', { name: /^Run #2204/ }));
    expect(useUiStore.getState()).toMatchObject({ prTab: 'checks', prRun: SHA });

    fireEvent.click(screen.getByRole('button', { name: /^Comment · Maria/ }));
    expect(useUiStore.getState()).toMatchObject({ prTab: 'conversation', prFocus: `c-${COMMENT_URL}`, prConversation: 'comments' });

    fireEvent.click(screen.getByRole('button', { name: /^acr · self review/ }));
    expect(useUiStore.getState()).toMatchObject({ prConversation: 'everything', prFocus: 'e-a1r' });

    fireEvent.click(screen.getByRole('button', { name: /^acr · 3 findings/ }));
    expect(useUiStore.getState().prFocus).toBe('r-R1');

    // The failed run's MUTATING span opened no visit: the Conversation, unscrolled.
    act(() => useUiStore.getState().setPrTab('checks'));
    fireEvent.click(screen.getByRole('button', { name: /^MUTATING/ }));
    expect(useUiStore.getState()).toMatchObject({ prTab: 'conversation', prFocus: 'r-R1' });
    // The span the findings stage opened scrolls to that stage post.
    fireEvent.click(screen.getByRole('button', { name: /^COCOONING, 12:50/ }));
    expect(useUiStore.getState().prFocus).toBe('e-s-findings');

    fireEvent.click(screen.getAllByRole('button', { name: /^fixer held it/ })[0]!);
    expect(useUiStore.getState().prFocus).toBe('e-f1');

    fireEvent.click(screen.getByRole('button', { name: /^Commit 7c21e0f/ }));
    expect(open).toHaveBeenCalledWith(COMMIT_URL, '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('opens nothing for a commit without a URL', () => {
    useHiveStore.setState({ ledger, prTimelines: { [key]: { key, state: 'ok', timeline: { ...timeline, commits: [{ oid: SHA, at: at(1), url: '' }] } } } });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PrTimeline pr={pr} />);
    fireEvent.click(screen.getByRole('button', { name: /^Commit 7c21e0f/ }));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('a failed first read shows the problem, and Try again reads again', () => {
    useHiveStore.setState({ prTimelines: { [key]: { key, state: 'failed', problem: 'gh is not installed' } } });
    render(<PrTimeline pr={pr} />);
    expect(screen.getByText('gh is not installed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(loadPrTimeline).toHaveBeenCalledTimes(2);
  });

  it('a failed refresh keeps the lanes under the problem', () => {
    useHiveStore.setState({ ledger, prTimelines: { [key]: { key, state: 'failed', problem: 'rate limited', timeline } } });
    render(<PrTimeline pr={pr} />);
    expect(screen.getByText('rate limited')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Run #2204/ })).toBeInTheDocument();
  });
});
