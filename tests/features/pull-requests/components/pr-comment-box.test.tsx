import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrCommentBox } from '@features/pull-requests/components/pr-comment-box';
import { useHiveStore } from '@stores/hive-store';
import { fixturePr } from '@tests/support/hatchery';

const commentOnPr = vi.fn();
beforeEach(() => {
  commentOnPr.mockReset();
  useHiveStore.setState({ commentOnPr });
});

describe('PrCommentBox', () => {
  it('says where the comment goes and who sees it', () => {
    render(<PrCommentBox pr={fixturePr()} />);
    expect(screen.getByRole('textbox', { name: 'Comment on #1182' })).toHaveAttribute('placeholder', 'Comment on #1182…');
    expect(screen.getByText('Comment on GitHub')).toBeInTheDocument();
    expect(screen.getByText('everyone on the PR sees it')).toBeInTheDocument();
  });

  it('posts the trimmed text and clears on success', async () => {
    commentOnPr.mockResolvedValue({ ok: true, value: true });
    render(<PrCommentBox pr={fixturePr()} />);
    await userEvent.type(screen.getByRole('textbox'), '  Looks right.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(commentOnPr).toHaveBeenCalledWith('acme', 'incorpx-server', 1182, 'Looks right.');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('keeps the text and shows the reason on failure', async () => {
    commentOnPr.mockResolvedValue({
      ok: false,
      error: { kind: 'no-repos', message: 'acme/incorpx-server is not a configured project’s repository.' },
    });
    render(<PrCommentBox pr={fixturePr()} />);
    await userEvent.type(screen.getByRole('textbox'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.getByRole('textbox')).toHaveValue('Hello');
    expect(screen.getByText(/is not a configured project/)).toHaveClass('text-amber-text');
  });

  it('keeps focus on the action while its call runs, and announces the result (HIVE-225)', async () => {
    const user = userEvent.setup();
    let settle: (value: unknown) => void = () => {};
    commentOnPr.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    render(<PrCommentBox pr={fixturePr()} />);
    await user.type(screen.getByRole('textbox'), 'Hello');
    const button = screen.getByRole('button', { name: 'Comment' });
    await user.click(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      settle({ ok: false, error: { kind: 'no-repos', message: 'acme/incorpx-server is not a configured project’s repository.' } });
    });
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(/is not a configured project/);
  });

  it('cannot post an empty comment', () => {
    render(<PrCommentBox pr={fixturePr()} />);
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('keeps the disabled Comment label legible: on-brand text, dimmed by opacity', () => {
    render(<PrCommentBox pr={fixturePr()} />);
    const button = screen.getByRole('button', { name: 'Comment' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('text-on-brand', 'disabled:opacity-60');
    expect(button.className).not.toMatch(/disabled:text-subtle|\btext-ink\b/);
  });

  it('shows focus on the comment box with the brand border (HIVE-223)', () => {
    render(<PrCommentBox pr={fixturePr()} />);
    expect(screen.getByRole('textbox').parentElement).toHaveClass('focus-within:border-brand');
  });
});
