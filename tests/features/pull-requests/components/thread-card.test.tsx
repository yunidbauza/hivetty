import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ThreadCard, hunkTail, type ThreadWrites } from '@features/pull-requests/components/thread-card';
import { prThread } from '@tests/support/pr-detail';

describe('hunkTail', () => {
  it("numbers the new side's lines from the hunk header and leaves removed lines unnumbered", () => {
    expect(hunkTail(prThread().comments[0]!.diffHunk, 3)).toEqual([
      { n: null, text: "-  if (filing.total < 400) return reject('underpaid');" },
      { n: 116, text: "   if (filing.entity === 'llc') return ok();" },
      { n: 117, text: '   return checkFranchiseTax(filing);' },
    ]);
  });
});

describe('ThreadCard', () => {
  it('heads with path:line and the open state, then the hunk and the comment', () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} />);
    expect(screen.getByText('src/fees/validator.ts')).toBeInTheDocument();
    expect(screen.getByText(':118')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('An LLC without a registered agent passes validation.')).toBeInTheDocument();
    expect(screen.getByText('117')).toBeInTheDocument();
  });

  it('says the fixer is on an open thread, and resolved over everything', () => {
    const { rerender } = render(<ThreadCard thread={prThread()} fixerOnIt />);
    expect(screen.getByText('fixer on it')).toHaveClass('text-amber-text');
    rerender(<ThreadCard thread={prThread({ isResolved: true })} fixerOnIt />);
    expect(screen.getByText('resolved')).toHaveClass('text-green');
  });

  it('shows the replies', () => {
    const [first] = prThread().comments;
    render(
      <ThreadCard
        thread={prThread({ comments: [first!, { ...first!, url: 'r2', author: 'yunid', body: 'Agreed.' }] })}
        fixerOnIt={false}
      />,
    );
    expect(screen.getByText('yunid')).toBeInTheDocument();
    expect(screen.getByText('Agreed.')).toBeInTheDocument();
  });

  it('opens the file at the line, and has no Reply or Resolve (HIVE-207)', async () => {
    const onOpenFile = vi.fn();
    render(<ThreadCard thread={prThread()} fixerOnIt={false} onOpenFile={onOpenFile} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the file' }));
    expect(onOpenFile).toHaveBeenCalledWith('src/fees/validator.ts', 118);
    expect(screen.queryByRole('button', { name: /reply|resolve/i })).toBeNull();
  });

  it('hides Open the file with nowhere to open it', () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} />);
    expect(screen.queryByRole('button', { name: 'Open the file' })).toBeNull();
  });
});

describe('ThreadCard writes (HIVE-207)', () => {
  const ok = { ok: true as const, value: true as const };
  const no = (message: string) => ({ ok: false as const, error: { kind: 'unknown' as const, message } });
  const writes = (over: Partial<ThreadWrites> = {}): ThreadWrites => ({
    reply: vi.fn().mockResolvedValue(ok),
    setResolved: vi.fn().mockResolvedValue(ok),
    ...over,
  });

  it('has no Reply or Resolve without writes', () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} />);
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('replies from a box under the thread, and closes it on success', async () => {
    const w = writes();
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={w} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply to src/fees/validator.ts:118' }), 'On it');
    await userEvent.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(w.reply).toHaveBeenCalledWith('PRRT_1', 'On it');
    expect(screen.queryByRole('textbox', { name: /Reply to/ })).toBeNull();
  });

  it('keeps the disabled reply label legible: on-brand text, dimmed by opacity', async () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={writes()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const button = screen.getByRole('button', { name: 'Post reply' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('text-on-brand', 'disabled:opacity-60');
    expect(button.className).not.toMatch(/disabled:text-subtle|\btext-ink\b/);
  });

  it('keeps the text and shows the reason when the reply fails', async () => {
    const w = writes({ reply: vi.fn().mockResolvedValue(no('rate limited')) });
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={w} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Reply to/ }), 'On it');
    await userEvent.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(screen.getByRole('textbox', { name: /Reply to/ })).toHaveValue('On it');
    expect(screen.getByText('rate limited')).toBeInTheDocument();
  });

  it('resolves an open thread and unresolves a resolved one', async () => {
    const w = writes();
    const { rerender } = render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={w} />);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(w.setResolved).toHaveBeenCalledWith('PRRT_1', true);
    rerender(<ThreadCard thread={prThread({ isResolved: true })} fixerOnIt={false} writes={w} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unresolve' }));
    expect(w.setResolved).toHaveBeenCalledWith('PRRT_1', false);
  });

  it('shows the reason when resolving fails', async () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={writes({ setResolved: vi.fn().mockResolvedValue(no('not on this PR')) })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('not on this PR')).toBeInTheDocument();
  });

  it('cancels a reply without posting', async () => {
    const w = writes();
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={w} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: /Reply to/ })).toBeNull();
    expect(w.reply).not.toHaveBeenCalled();
  });

  it('shows focus on the reply box with the brand border (HIVE-223)', async () => {
    render(<ThreadCard thread={prThread()} fixerOnIt={false} writes={writes()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByRole('textbox', { name: /^Reply to / }).parentElement).toHaveClass('focus-within:border-brand');
  });
});
