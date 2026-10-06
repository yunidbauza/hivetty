import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Entity, Session } from '@/types/entity';

import { useLeaveOnEnd } from '@features/sessions/hooks/use-leave-on-end';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';
import { seedDemoFleet } from '@tests/support/demo-fleet';

describe('useLeaveOnEnd', () => {
  beforeEach(() => {
    useHiveStore.getState().reset();
    useUiStore.getState().reset();
    seedDemoFleet();
    useUiStore.getState().openTab('hero-refresh', 'sessions');
  });

  const live = (): Session => ({
    ...(useHiveStore.getState().entities['hero-refresh'] as Session),
    status: 'working',
  });
  const ended = (over: Partial<Session> = {}): Session => ({ ...live(), status: 'terminated', ...over });

  const mount = (entity: Entity | null) =>
    renderHook(({ e }) => useLeaveOnEnd(e), { initialProps: { e: entity } });

  it('goes to the Overmind when the watched session exits', () => {
    const { rerender } = mount(live());
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');
    rerender({ e: ended() });
    expect(useUiStore.getState().activeTab).toBe('orch');
  });

  it('goes for /done as well', () => {
    const { rerender } = mount(live());
    rerender({ e: ended({ status: 'done', endedBy: 'finished' }) });
    expect(useUiStore.getState().activeTab).toBe('orch');
  });

  it('stays on a session that was killed or lost, so its card can say why', () => {
    const { rerender } = mount(live());
    rerender({ e: ended({ lost: 'its process was killed by signal 15' }) });
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');
  });

  it('stays for a /clear, whose terminal carries on', () => {
    const { rerender } = mount(live());
    rerender({ e: ended({ status: 'done', endedBy: 'cleared' }) });
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');
  });

  it('stays on a session that had already ended when it was opened', () => {
    const { rerender } = mount(ended());
    rerender({ e: ended() });
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');
  });

  it('stays when the session ended while off the terminal view', () => {
    const { rerender } = mount(live());
    rerender({ e: null });
    rerender({ e: ended() });
    expect(useUiStore.getState().activeTab).toBe('hero-refresh');
  });
});
