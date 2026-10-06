import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrConversation } from '@features/pull-requests/components/pr-conversation';
import { useAppearanceStore } from '@stores/appearance-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { fixturePr } from '@tests/support/hatchery';
import { prDetail, prThread } from '@tests/support/pr-detail';
import { expectNoHexColour, inLight } from '@tests/support/light';

const REVIEW_URL = 'https://github.com/acme/incorpx-server/pull/1182#pullrequestreview-9';
const detail = prDetail({
  comments: [
    { author: 'maria', body: 'Does this cover the 2026 change?', createdAt: '2026-10-03T11:31:00Z', url: 'c1' },
    { author: 'yunid', body: 'Yes.', createdAt: '2026-10-03T11:44:00Z', url: 'c2' },
  ],
  reviews: [
    { author: 'yunid', state: 'CHANGES_REQUESTED', body: 'Three findings.', submittedAt: '2026-10-03T10:50:00Z', url: REVIEW_URL },
    { author: 'maria', state: 'COMMENTED', body: '', submittedAt: '2026-10-03T10:51:00Z', url: 'r2' },
  ],
  threads: [prThread(), prThread({ id: 'PRRT_2', isResolved: true })],
});

beforeEach(() => {
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({
    ledger: [
      {
        id: '20261003-105000-001',
        ts: Date.parse('2026-10-03T10:50:00Z'),
        from: 'acr',
        kind: 'answer',
        body: 'changes requested',
        meta: { review_url: REVIEW_URL },
      },
      {
        id: '20261003-110600-002',
        ts: Date.parse('2026-10-03T11:06:00Z'),
        from: 'fixer',
        kind: 'post',
        body: 'pushed 2 commits',
        meta: { pr: 1182, repo: 'acme/incorpx-server' },
      },
    ],
  });
});

afterEach(() => {
  act(() => useAppearanceStore.getState().setTheme('dark'));
});

describe('PrConversation', () => {
  it('renders in light on tokens alone (HIVE-210)', () => {
    inLight();
    const { container } = render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    expect(screen.getByText('Validates every Delaware filing.')).toBeInTheDocument();
    expectNoHexColour(container);
  });

  it('renders the description, its test plan and the counts', () => {
    render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    expect(screen.getByText('Validates every Delaware filing.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'done' })).toBeInTheDocument();
    expect(screen.getByText('2 comments · 1 review · 1 open thread')).toBeInTheDocument();
  });

  it('shows a review acr wrote through Hive TTY as acr, with its verdict', () => {
    render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    expect(screen.getByText('via Hive TTY')).toBeInTheDocument();
    expect(screen.getByText('acr')).toBeInTheDocument();
    expect(screen.getByText('changes requested')).toHaveClass('text-amber-text');
  });

  it('lists comments, reviews and threads oldest first; a bodyless COMMENTED review is left out', () => {
    render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    const items = screen
      .getAllByRole('listitem')
      .filter((li) => li.hasAttribute('data-kind'))
      .map((li) => li.getAttribute('data-kind'));
    expect(items).toEqual(['review', 'thread', 'thread', 'comment', 'comment']);
  });

  it("adds Hive TTY's events naming the PR on Everything", async () => {
    render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    expect(screen.queryByText(/pushed 2 commits/)).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Everything' }));
    expect(screen.getByText(/pushed 2 commits/)).toBeInTheDocument();
    expect(useUiStore.getState().prConversation).toBe('everything');
  });

  it('says so when the description is empty', () => {
    render(<PrConversation pr={fixturePr()} detail={prDetail({ body: '' })} fixerOnIt={false} />);
    expect(screen.getByText('No description.')).toBeInTheDocument();
  });

  it('offers Reply on its threads, and none on a merged PR (HIVE-207)', () => {
    useHiveStore.setState({ replyToPrThread: vi.fn(), setPrThreadResolved: vi.fn() });
    const one = prDetail({ threads: [prThread()] });
    const { unmount } = render(<PrConversation pr={fixturePr()} detail={one} fixerOnIt={false} />);
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    unmount();
    render(<PrConversation pr={fixturePr({ state: 'merged' })} detail={one} fixerOnIt={false} />);
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it("scrolls to the Timeline's item once it is in the list, then clears the focus (HIVE-208)", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const one = prDetail({
      comments: [{ author: 'maria', body: 'Hi.', createdAt: '2026-10-03T11:31:00Z', url: 'https://c/1' }],
    });
    const { container } = render(<PrConversation pr={fixturePr()} detail={one} fixerOnIt={false} />);
    act(() => useUiStore.getState().focusPrEvent('c-https://c/1', false));
    const li = container.querySelector('li[data-key="c-https://c/1"]');
    expect(li).not.toBeNull();
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(scroll.mock.contexts[0]).toBe(li);
    expect(useUiStore.getState().prFocus).toBeNull();
  });

  it('keeps a focus whose item is not in the list yet (HIVE-208)', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<PrConversation pr={fixturePr()} detail={detail} fixerOnIt={false} />);
    act(() => useUiStore.getState().focusPrEvent('e-missing', true));
    expect(scroll).not.toHaveBeenCalled();
    expect(useUiStore.getState().prFocus).toBe('e-missing');
  });
});
