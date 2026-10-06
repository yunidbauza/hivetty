import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangedFiles } from '@features/explorer/components/changed-files';
import { useHiveStore } from '@stores/hive-store';

describe('ChangedFiles (HIVE-201)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useHiveStore.getState().setChangedFiles('s1', [
      { path: '.claude/worktrees/x/tests/e2e/session-history.spec.ts', mark: 'M', added: 34, removed: 6 },
      { path: '.claude/worktrees/x/tests/e2e/fixtures/scratch-home.ts', mark: 'A', added: 41, removed: 0 },
    ]);
  });

  it('heads the list with its count and draws mark, path relative to the tree, and counts', () => {
    render(<ChangedFiles changesId="s1" subRoot=".claude/worktrees/x" onOpenFile={vi.fn()} />);
    expect(screen.getByText('Changed in this session')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('tests/e2e/session-history.spec.ts')).toBeInTheDocument();
    expect(screen.getByText('+34 −6')).toBeInTheDocument();
    expect(screen.getByText('+41')).toBeInTheDocument();
  });

  it('a click opens the file by its tree path', () => {
    const onOpenFile = vi.fn();
    render(<ChangedFiles changesId="s1" subRoot=".claude/worktrees/x" onOpenFile={onOpenFile} />);
    fireEvent.click(screen.getByText('tests/e2e/fixtures/scratch-home.ts'));
    expect(onOpenFile).toHaveBeenCalledWith('.claude/worktrees/x/tests/e2e/fixtures/scratch-home.ts');
  });

  it('a file outside the sub-root keeps its whole path', () => {
    useHiveStore.getState().setChangedFiles('s2', [{ path: 'README.md', mark: 'M', added: 1, removed: 1 }]);
    render(<ChangedFiles changesId="s2" subRoot=".claude/worktrees/x" onOpenFile={vi.fn()} />);
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('draws nothing with nothing changed', () => {
    const { container } = render(<ChangedFiles changesId="nobody" subRoot="" onOpenFile={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
