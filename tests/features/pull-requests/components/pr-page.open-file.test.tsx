import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrPage } from '@features/pull-requests/components/pr-page';
import { prKey, useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { hatchRow } from '@tests/support/hatchery';
import { prDetail, prFile } from '@tests/support/pr-detail';

const openPath = vi.fn(() => Promise.resolve());
vi.mock('@/hooks/use-open-file-at', () => ({ useOpenFileAt: () => ({ openPath, openResolved: vi.fn() }) }));
vi.mock('@/hooks/use-project-config', () => ({
  useProjectConfig: () => ({ projects: [{ id: 'p-incorpx', path: '/Users/me/code/incorpx-server' }] }),
}));

const key = prKey('acme', 'incorpx-server', 1182);
const TEXT = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-x', '+y'].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useUiStore.setState({ prTab: 'files' });
  useHiveStore.setState({
    loadPrDetail: vi.fn(() => Promise.resolve()),
    loadPrDiff: vi.fn(() => Promise.resolve()),
    prDetails: { [key]: { key, state: 'ok', detail: prDetail({ headSha: 'abc', files: [prFile({ path: 'src/a.ts' })] }) } },
    prDiffs: { [key]: { key, sha: 'abc', state: 'ok', text: TEXT } },
  });
});

describe('PrPage — Open in the editor (HIVE-207)', () => {
  it('opens from the PR’s live session, at the first changed line', async () => {
    useHiveStore.setState((state) => ({
      entities: { ...state.entities, 'sess-1': { kind: 'session', id: 'sess-1', project: 'p-session' } as never },
    }));
    render(<PrPage row={hatchRow({ session: 'sess-1' })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in the editor' }));
    expect(openPath).toHaveBeenCalledWith('p-session', 'sess-1', 'src/a.ts', { line: 1 });
  });

  it('opens from the project whose folder is the repository, with no session', async () => {
    render(<PrPage row={hatchRow({ session: null })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in the editor' }));
    expect(openPath).toHaveBeenCalledWith('p-incorpx', undefined, 'src/a.ts', { line: 1 });
  });
});
