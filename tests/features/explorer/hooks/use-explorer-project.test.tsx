import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Terminal } from '@/types/entity';
import { resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { emptySnapshot } from '@shared/config-contract';
import { useExplorerProject } from '@features/explorer/hooks/use-explorer-project';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { testProjectKey } from '@tests/support/project-key';

describe('useExplorerProject: a terminal on stage (HIVE-201)', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    setProjectConfigForTest({
      ...emptySnapshot('/tmp/hive/config.json'),
      projects: [
        {
          id: 'p1',
          name: 'p1',
          path: '/repo',
          icon: 'ph-folder',
          origin: 'local' as const,
          status: 'ok' as const,
          key: testProjectKey('p1'),
          isRepo: true,
        },
      ],
    });
    const terminal: Terminal = {
      kind: 'terminal',
      id: 't1',
      project: 'p1',
      cwd: '/repo/packages/web',
      status: 'prompt',
      createdAt: 1,
      lines: [],
    };
    useHiveStore.setState({ entities: { t1: terminal } });
    useUiStore.getState().openTab('t1', 'sessions');
  });

  afterEach(() => {
    resetProjectConfig();
    useUiStore.getState().openTab('orch');
  });

  it("answers with the terminal's project and cwd, and no session to act for", () => {
    const { result } = renderHook(() => useExplorerProject());

    expect(result.current.project?.id).toBe('p1');
    expect(result.current.root).toBe('packages/web');
    expect(result.current).not.toHaveProperty('sessionId');
    expect(result.current).not.toHaveProperty('branch');
  });
});
