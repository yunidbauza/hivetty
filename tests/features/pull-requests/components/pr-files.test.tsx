import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrFiles } from '@features/pull-requests/components/pr-files';
import { useAppearanceStore } from '@stores/appearance-store';
import { prKey, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { prDetail, prFile, prThread } from '@tests/support/pr-detail';
import { expectNoHexColour, inLight } from '@tests/support/light';

const loadPrDiff = vi.fn(() => Promise.resolve());
const setPrFileViewed = vi.fn(() => Promise.resolve({ ok: true as const, value: true as const }));
const { pr } = hatchRow();
const key = prKey(pr.owner, pr.repo, pr.n);
const TEXT = [
  'diff --git a/README.md b/README.md', '--- a/README.md', '+++ b/README.md', '@@ -1 +1 @@', '-a', '+b',
  'diff --git a/src/fees/validator.ts b/src/fees/validator.ts', '--- a/src/fees/validator.ts', '+++ b/src/fees/validator.ts',
  '@@ -117,2 +117,2 @@', ' keep', '-old', '+new',
].join('\n');
const detail = prDetail({
  headSha: 'abc',
  files: [prFile({ path: 'README.md' }), prFile({ path: 'src/fees/validator.ts' })],
  threads: [prThread()],
});

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useHiveStore.setState({ loadPrDiff, setPrFileViewed, prDiffs: { [key]: { key, sha: 'abc', state: 'ok', text: TEXT } } });
});

afterEach(() => {
  act(() => useAppearanceStore.getState().setTheme('dark'));
});

describe('PrFiles', () => {
  it('reads the diff at the head sha, and again when the head moves', () => {
    const { rerender } = render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(loadPrDiff).toHaveBeenLastCalledWith(pr.owner, pr.repo, pr.n, 'abc');
    rerender(<PrFiles pr={pr} detail={{ ...detail, headSha: 'def' }} fixerOnIt={false} />);
    expect(loadPrDiff).toHaveBeenLastCalledWith(pr.owner, pr.repo, pr.n, 'def');
    expect(loadPrDiff).toHaveBeenCalledTimes(2);
  });

  it('renders in light on tokens alone (HIVE-210)', () => {
    inLight();
    const { container } = render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(screen.getByRole('heading', { name: 'src/fees/validator.ts' })).toBeInTheDocument();
    expectNoHexColour(container);
  });

  it('opens on the first file with an open thread', () => {
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(screen.getByRole('heading', { name: 'src/fees/validator.ts' })).toBeInTheDocument();
  });

  it('says "No file matches." when the filter matches nothing (#24)', async () => {
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter files' }), 'zzzz');
    expect(screen.getByText('No file matches.')).toBeInTheDocument();
  });

  it('reads the diff again at the same head when Retry is pressed after a failed read (#24)', async () => {
    useHiveStore.setState({ prDiffs: { [key]: { key, sha: 'abc', state: 'failed', problem: 'GitHub said no.' } } });
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(loadPrDiff).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(loadPrDiff).toHaveBeenCalledTimes(2);
    expect(loadPrDiff).toHaveBeenLastCalledWith(pr.owner, pr.repo, pr.n, 'abc');
  });

  it('shows the file you pick', async () => {
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    await userEvent.click(screen.getByRole('button', { name: /README\.md/ }));
    expect(screen.getByRole('heading', { name: 'README.md' })).toBeInTheDocument();
  });

  it('marks viewed through the store', async () => {
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed' }));
    expect(setPrFileViewed).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 'src/fees/validator.ts', true);
  });

  it('opens the editor through the page’s helper (session or project root is the page’s)', async () => {
    const onOpenFile = vi.fn();
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} onOpenFile={onOpenFile} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in the editor' }));
    expect(onOpenFile).toHaveBeenCalledWith('src/fees/validator.ts', 118);
  });

  it('reads "No diff to show" while the diff failed and nothing was read', () => {
    useHiveStore.setState({ prDiffs: { [key]: { key, sha: 'abc', state: 'failed', problem: 'diff too large' } } });
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(screen.getByText('No diff to show')).toBeInTheDocument();
    expect(screen.getByText('diff too large')).toBeInTheDocument();
  });

  it('has no thread writes and Viewed disabled on a merged PR', () => {
    const merged = hatchRow({ state: 'merged' }).pr;
    render(<PrFiles pr={merged} detail={detail} fixerOnIt={false} />);
    expect(screen.getByRole('checkbox', { name: 'Viewed' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('reads as loading, not "No diff to show", when the entry is missing (carry-over from #22)', () => {
    useHiveStore.setState({ prDiffs: {} });
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(screen.getByRole('status', { name: 'Loading diff' })).toBeInTheDocument();
    expect(screen.queryByText('No diff to show')).toBeNull();
    expect(loadPrDiff).toHaveBeenCalledWith(pr.owner, pr.repo, pr.n, 'abc');
  });

  it('keeps an older text on a failed read, with the problem over it (carry-over from #22)', () => {
    useHiveStore.setState({ prDiffs: { [key]: { key, sha: 'old', state: 'failed', text: TEXT, problem: 'rate limited' } } });
    render(<PrFiles pr={pr} detail={detail} fixerOnIt={false} />);
    expect(screen.getByText('rate limited')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.queryByText('No diff to show')).toBeNull();
  });
});
