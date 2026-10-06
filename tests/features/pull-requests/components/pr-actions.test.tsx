import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrActions } from '@features/pull-requests/components/pr-properties';
import { useHiveStore } from '@stores/hive-store';
import { hatchRow } from '@tests/support/hatchery';

const answerAsk = vi.fn();
const post = vi.fn();
const openEntity = vi.fn();
const mergeCard = {
  id: '20261003-120000-007',
  ts: Date.now(),
  from: 'shipper',
  to: 'overmind',
  kind: 'ask' as const,
  body: 'Allow Bash?',
  meta: { kind: 'permission', tool: 'Bash', input: { command: 'gh pr merge 1182 --squash --repo acme/incorpx-server' } },
};
const original = window.hive;

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useHiveStore.setState({ answerAsk, openEntity });
  window.hive = { ledger: { post } } as unknown as typeof window.hive;
});
afterEach(() => {
  window.hive = original;
});

describe('PrActions', () => {
  it('disables Merge until the shipper asks, saying why', () => {
    render(<PrActions row={hatchRow()} />);
    expect(screen.getByRole('button', { name: /Merge · after approval/ })).toBeDisabled();
  });

  it("answers the shipper's merge card with the narrowest rung (R5)", async () => {
    answerAsk.mockResolvedValue({ ok: true, id: 'x' });
    useHiveStore.setState({ ledger: [mergeCard] });
    render(<PrActions row={hatchRow({}, { flap: 'SUMMONS', tone: 'amber' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(answerAsk).toHaveBeenCalledWith('20261003-120000-007', 'allow-once');
  });

  it("shows the ledger's refusal", async () => {
    answerAsk.mockResolvedValue({ ok: false, status: 409, reason: 'that ask is no longer open' });
    useHiveStore.setState({ ledger: [mergeCard] });
    render(<PrActions row={hatchRow()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('that ask is no longer open')).toHaveClass('text-amber-text');
  });

  it('offers Ready for review on a draft nobody holds, as a GitHub link', () => {
    render(<PrActions row={hatchRow({ state: 'draft' }, { flap: 'LARVA' })} />);
    expect(screen.getByRole('link', { name: 'Ready for review' })).toHaveAttribute(
      'href',
      'https://github.com/acme/incorpx-server/pull/1182',
    );
  });

  it('asks acr to look again through the ledger', async () => {
    post.mockResolvedValue({ ok: true, id: 'y' });
    render(<PrActions row={hatchRow()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask acr to look again' }));
    expect(post).toHaveBeenCalledWith({
      to: 'acr',
      kind: 'ask',
      body: 'Review https://github.com/acme/incorpx-server/pull/1182 again',
      meta: { pr: 1182, repo: 'acme/incorpx-server' },
    });
    expect(await screen.findByText('Asked acr')).toBeInTheDocument();
  });

  it("shows acr's refusal inline", async () => {
    post.mockResolvedValue({ ok: false, status: 404, reason: 'acr is not a party' });
    render(<PrActions row={hatchRow()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ask acr to look again' }));
    expect(await screen.findByText('acr is not a party')).toHaveClass('text-amber-text');
  });

  it('opens the session only when there is a live one', async () => {
    const { rerender } = render(<PrActions row={hatchRow()} />);
    expect(screen.queryByRole('button', { name: 'Open the session' })).toBeNull();
    rerender(<PrActions row={hatchRow({ session: 'fee-rule' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the session' }));
    expect(openEntity).toHaveBeenCalledWith('fee-rule');
  });

  it('leaves a merged PR only GitHub', () => {
    render(<PrActions row={hatchRow({ state: 'merged', session: 'fee-rule' }, { flap: 'HATCHED', tone: 'brand' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Open on GitHub' })).toBeInTheDocument();
  });

  it('answers the merge card once however often it is clicked', async () => {
    let settle: (value: unknown) => void = () => {};
    answerAsk.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    useHiveStore.setState({ ledger: [mergeCard] });
    render(<PrActions row={hatchRow()} />);
    const merge = screen.getByRole('button', { name: 'Merge' });
    await userEvent.click(merge);
    await userEvent.click(merge);
    expect(answerAsk).toHaveBeenCalledTimes(1);
    settle({ ok: true, id: 'x' });
  });

  it('shows a failed call as a refusal, not an unhandled rejection', async () => {
    answerAsk.mockRejectedValue(new Error('IPC gone'));
    post.mockRejectedValue(new Error('IPC gone'));
    useHiveStore.setState({ ledger: [mergeCard] });
    render(<PrActions row={hatchRow()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('IPC gone')).toHaveClass('text-amber-text');
    await userEvent.click(screen.getByRole('button', { name: 'Ask acr to look again' }));
    expect(post).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('IPC gone')).toHaveClass('text-amber-text');
  });
});
