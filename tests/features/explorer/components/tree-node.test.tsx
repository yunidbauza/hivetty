import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TreeNode } from '@features/explorer/components/tree-node';
import { useHiveStore } from '@stores/hive-store';

const row = (entry: { name: string; kind: 'file' | 'dir' }) => (
  <TreeNode
    projectId="p1"
    entry={{ ...entry, size: 0 }}
    parentPath="src"
    depth={1}
    refreshToken={0}
    rootKey=""
    changesId="s1"
    onOpenFile={vi.fn()}
  />
);

describe('TreeNode: the changed-file mark (HIVE-201)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useHiveStore.getState().setChangedFiles('s1', [
      { path: 'src/a.ts', mark: 'A', added: 1, removed: 0 },
      { path: 'src/b.ts', mark: 'M', added: 1, removed: 1 },
      { path: 'src/lib', mark: 'M', added: 1, removed: 0 },
    ]);
  });

  it('draws A in green and M in brand on a changed file', () => {
    const { unmount } = render(row({ name: 'a.ts', kind: 'file' }));
    expect(screen.getByLabelText('added this session')).toHaveClass('text-green');
    expect(screen.getByText('A')).toBeInTheDocument();
    unmount();
    render(row({ name: 'b.ts', kind: 'file' }));
    expect(screen.getByLabelText('modified this session')).toHaveClass('text-brand');
  });

  it('draws nothing on an unchanged file or a directory', () => {
    const { unmount } = render(row({ name: 'c.ts', kind: 'file' }));
    expect(screen.queryByLabelText(/this session/)).toBeNull();
    unmount();
    render(row({ name: 'lib', kind: 'dir' }));
    expect(screen.queryByLabelText(/this session/)).toBeNull();
  });
});
