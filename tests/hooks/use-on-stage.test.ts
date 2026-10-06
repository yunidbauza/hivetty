import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Session } from '@/types/entity';

import { useOnStage } from '@/hooks/use-on-stage';
import { useAppearanceStore } from '@stores/appearance-store';
import { useEditorStore } from '@stores/editor-store';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

/** The full table over `resolveView`'s inputs lives in `use-foreground-session.test.ts`, which calls this. */
const session: Session = {
  kind: 'session',
  id: 'sess-03',
  terminalId: 'term-3',
  project: 'nova-web',
  status: 'idle',
  task: 'refresh the hero',
  cost: '$0.00',
  lines: [],
};

beforeEach(() => {
  useHiveStore.getState().reset();
  useUiStore.getState().reset();
  useEditorStore.getState().reset();
  useAppearanceStore.getState().reset();
  useHiveStore.setState({ entities: { 'sess-03': session } });
});

describe('useOnStage', () => {
  it('is the terminal id of the session on stage', () => {
    useUiStore.setState({ place: 'sessions', activeTab: 'sess-03' });
    expect(renderHook(() => useOnStage()).result.current).toBe('term-3');
  });

  it('is null on the orchestrator', () => {
    useUiStore.setState({ activeTab: 'orch' });
    expect(renderHook(() => useOnStage()).result.current).toBeNull();
  });

  it('reads the agents place as on stage with no agent page open (HIVE-213)', () => {
    useUiStore.setState({ place: 'agents', activeTab: 'orch' });
    expect(renderHook(() => useOnStage()).result.current).toBeNull();
  });

  it('a session tab behind the Home place is not on stage, whatever the stored layout (HIVE-213)', () => {
    useUiStore.setState({ place: 'home', activeTab: 'sess-03' });
    expect(renderHook(() => useOnStage()).result.current).toBeNull();
  });
});
