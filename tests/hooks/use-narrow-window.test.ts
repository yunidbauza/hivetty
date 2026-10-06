import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNarrowWindow } from '@/hooks/use-narrow-window';

describe('useNarrowWindow (HIVE-201)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follows the (max-width: 1199px) query', () => {
    let listener: (() => void) | undefined;
    const mql = {
      matches: false,
      addEventListener: (_: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(),
    };
    const matchMedia = vi.fn(() => mql as unknown as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);

    const { result, unmount } = renderHook(() => useNarrowWindow());

    expect(matchMedia).toHaveBeenCalledWith('(max-width: 1199px)');
    expect(result.current).toBe(false);

    mql.matches = true;
    act(() => listener?.());
    expect(result.current).toBe(true);

    unmount();
    expect(mql.removeEventListener).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reads as wide where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useNarrowWindow());
    expect(result.current).toBe(false);
    vi.unstubAllGlobals();
  });
});
