import { act } from '@testing-library/react';
import { expect } from 'vitest';

import { useAppearanceStore } from '@stores/appearance-store';

/** Switch to light the way the app does: the store writes `body[data-theme]`. */
export function inLight(): void {
  act(() => useAppearanceStore.getState().setTheme('light'));
  expect(document.body.getAttribute('data-theme')).toBe('light');
}

/**
 * happy-dom computes no colour, so a light test cannot assert a paint. What it can
 * prove is that nothing on the surface bypasses the tokens: no six- or eight-digit
 * hex in any class, style or SVG attribute.
 */
export function expectNoHexColour(root: HTMLElement): void {
  expect(root.innerHTML).not.toMatch(/#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/i);
}
