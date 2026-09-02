import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRailChord } from '@/hooks/use-rail-chord';
import { TERMINAL_CHORD_EVENT, type TerminalChordDetail } from '@lib/terminal/keymap';
import { useAppearanceStore } from '@stores/appearance-store';

/**
 * The rail-collapse chords, from everywhere the terminal is not (this story).
 *
 * `tests/lib/terminal/keymap.test.ts` proves `isRailChord`'s own platform
 * matrix; what is only provable here is that the hook actually wires a
 * `window` keydown to the store, that it does not double-fire for a keystroke
 * the terminal already announced, and that it cleans up after itself.
 */
describe('useRailChord', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset();
    // Pin the platform so the mac-chord assertions below don't depend on
    // whatever OS the suite happens to run on — `isMacPlatform` has its own
    // matrix covered in `tests/lib/platform.test.ts`.
    vi.stubGlobal('navigator', { userAgentData: { platform: 'macOS' } });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('toggles the left rail on a window keydown', () => {
    renderHook(() => useRailChord());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(true);
  });

  it('toggles the right rail on the alt variant', () => {
    renderHook(() => useRailChord());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, altKey: true, bubbles: true }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedRight).toBe(true);
  });

  it('toggles the left rail on the non-mac chord', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'Windows' } });
    renderHook(() => useRailChord());

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'b',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(true);
  });

  it('ignores a keydown originating inside a terminal', () => {
    // The terminal's own path already dispatched a chord event for this
    // keystroke. Handling both would toggle twice and land back where it
    // started — a shortcut that visibly does nothing.
    const terminal = document.createElement('div');
    terminal.setAttribute('data-terminal-id', 'sess-01');
    document.body.append(terminal);
    renderHook(() => useRailChord());

    act(() => {
      terminal.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(false);
  });

  it('toggles once on a terminal chord event', () => {
    renderHook(() => useRailChord());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_CHORD_EVENT, {
          detail: { chord: 'rail-left' } satisfies TerminalChordDetail,
        }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(true);
  });

  it('ignores a back chord', () => {
    renderHook(() => useRailChord());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_CHORD_EVENT, {
          detail: { chord: 'back' } satisfies TerminalChordDetail,
        }),
      );
    });

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(false);
  });

  it('stops listening when it unmounts', () => {
    const { unmount } = renderHook(() => useRailChord());
    unmount();

    // No act() wrapper: nothing should be listening, so nothing should update.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
    );
    window.dispatchEvent(
      new CustomEvent(TERMINAL_CHORD_EVENT, {
        detail: { chord: 'rail-left' } satisfies TerminalChordDetail,
      }),
    );

    expect(useAppearanceStore.getState().railCollapsedLeft).toBe(false);
  });
});
