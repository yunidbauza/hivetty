import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrFileTree } from '@features/pull-requests/components/pr-file-tree';
import { useUiStore } from '@stores/ui-store';
import { prDetail, prFile, prThread } from '@tests/support/pr-detail';

const detail = prDetail({
  changedFiles: 4,
  files: [
    prFile({ path: 'src/fees/validator.ts', additions: 88, deletions: 9, viewed: 'viewed' }),
    prFile({ path: 'src/fees/table.ts', additions: 31, deletions: 0 }),
    prFile({ path: 'src/fees/delaware.rule.ts', additions: 42, deletions: 11, viewed: 'dismissed' }),
    prFile({ path: 'README.md', additions: 1, deletions: 1 }),
  ],
  threads: [prThread(), prThread({ id: 'T2', path: 'src/fees/delaware.rule.ts', isResolved: true })],
});

beforeEach(() => useUiStore.getState().reset());

describe('PrFileTree', () => {
  it('sums the files, open threads and viewed, DISMISSED not counted', () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('4 files · 1 open thread · viewed 1 of 4')).toBeInTheDocument();
  });

  it('narrows to 200px on a page under 640px (HIVE-223)', () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Changed files' })).toHaveClass('w-[200px]', '@min-[640px]:w-[250px]');
  });

  it('draws folders with their compressed path and files under them with +/−', () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('src/fees')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /validator\.ts/ });
    expect(within(row).getByText('+88 −9')).toBeInTheDocument();
  });

  it('marks open threads amber, resolved-only green, and a dismissed file "changed"', () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    expect(within(screen.getByRole('button', { name: /validator\.ts/ })).getByLabelText('open thread')).toHaveClass('text-amber-text');
    const rule = screen.getByRole('button', { name: /delaware\.rule\.ts/ });
    expect(within(rule).getByLabelText('resolved threads')).toHaveClass('text-green');
    expect(within(rule).getByText('changed')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /validator\.ts/ })).getByLabelText('viewed')).toBeInTheDocument();
  });

  it('filters by path as you type', async () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Filter files' }), 'readme');
    expect(screen.getByRole('button', { name: /README\.md/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /validator\.ts/ })).toBeNull();
    expect(screen.queryByText('src/fees')).toBeNull();
  });

  it('selects a file on click and shows the selected one', async () => {
    const onSelect = vi.fn();
    render(<PrFileTree detail={detail} selected="README.md" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /README\.md/ })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('button', { name: /table\.ts/ }));
    expect(onSelect).toHaveBeenCalledWith('src/fees/table.ts');
  });

  it('says when GitHub sent fewer files than changed, with a link', () => {
    render(<PrFileTree detail={{ ...detail, changedFiles: 240 }} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'showing 4 · all on GitHub' })).toHaveAttribute('href', `${detail.url}/files`);
  });

  it('shows focus on the filter with the brand border (HIVE-223)', () => {
    render(<PrFileTree detail={detail} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Filter files' })).toHaveClass('focus:border-brand');
  });
});
