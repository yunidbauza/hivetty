import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Push } from '@/lib/checks-graph';
import { RunBar } from '@features/pull-requests/components/run-bar';

const push = (sha: string, number: number, state: Push['state'], ageMs = 4 * 60_000): Push => ({ sha, number, state, runs: [], startedAt: new Date(Date.now() - ageMs).toISOString() });
const pushes = [push('1111111aaa', 2200, 'passed'), push('2222222bbb', 2203, 'failed'), push('9f3c2ab000', 2207, 'running')];

describe('RunBar', () => {
  it('names the shown run, its commit and its age', () => {
    render(<RunBar pushes={pushes} shown={pushes[2]!} files={['ci.yml', 'preview.yml']} onShow={() => {}} />);
    expect(screen.getByText('Run #2207')).toBeInTheDocument();
    expect(screen.getByText(/on 9f3c2ab · started 4m ago/)).toBeInTheDocument();
    expect(screen.getByText('ci.yml')).toBeInTheDocument();
    expect(screen.getByText('preview.yml')).toBeInTheDocument();
    expect(screen.getByText('last 8 runs')).toBeInTheDocument();
  });

  it('says a run that started under a minute ago started just now', () => {
    const fresh = push('9f3c2ab000', 2207, 'running', 5_000);
    render(<RunBar pushes={[fresh]} shown={fresh} files={[]} onShow={() => {}} />);
    expect(screen.getByText('on 9f3c2ab · started just now')).toBeInTheDocument();
  });

  it('draws one square per push, oldest left, the shown one pressed', () => {
    render(<RunBar pushes={pushes} shown={pushes[2]!} files={[]} onShow={() => {}} />);
    const squares = screen.getAllByRole('button');
    expect(squares.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Run #2200, passed, 1111111', 'Run #2203, failed, 2222222', 'Run #2207, running, 9f3c2ab',
    ]);
    expect(squares.map((s) => s.getAttribute('data-state'))).toEqual(['passed', 'failed', 'running']);
    expect(squares[2]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the push a square names', () => {
    const onShow = vi.fn();
    render(<RunBar pushes={pushes} shown={pushes[2]!} files={[]} onShow={onShow} />);
    fireEvent.click(screen.getByRole('button', { name: /Run #2203/ }));
    expect(onShow).toHaveBeenCalledWith('2222222bbb');
  });

  it('wraps on a narrow column, and truncates its run text (HIVE-225)', () => {
    render(<RunBar pushes={pushes} shown={pushes[2]!} files={['ci.yml', 'preview.yml']} onShow={() => {}} />);
    const text = screen.getByText(/^on 9f3c2ab · started/);
    expect(text).toHaveClass('min-w-0', 'truncate');
    expect(text.parentElement).toHaveClass('flex-wrap', 'gap-y-1', 'min-w-0');
  });
});
