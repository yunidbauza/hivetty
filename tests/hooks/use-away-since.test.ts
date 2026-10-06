import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAwayTracker } from '@hooks/use-away-since';
import { useUiStore } from '@stores/ui-store';

describe('useAwayTracker', () => {
  beforeEach(() => {
    useUiStore.getState().reset();
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('marks the window away when it loses focus, and stops on unmount', () => {
    const { unmount } = renderHook(() => useAwayTracker());
    window.dispatchEvent(new Event('blur'));
    expect(useUiStore.getState().awaySince).toBe(1_800_000_000_000);

    unmount();
    vi.setSystemTime(1_900_000_000_000);
    window.dispatchEvent(new Event('blur'));
    expect(useUiStore.getState().awaySince).toBe(1_800_000_000_000);
  });
});
