import { beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_STYLE_ID } from '@lib/theme/apply';
import { APPEARANCE_STORAGE_KEY } from '@lib/theme/persisted';

/** What `<body>` said when the globe's palette was read: the order is the point. */
const seenAtPaletteRead: { theme?: string; styled: boolean }[] = [];

vi.mock('@/splash/stage', () => ({
  paletteFrom: vi.fn(() => {
    seenAtPaletteRead.push({
      theme: document.body.dataset.theme,
      styled: document.getElementById('hive-theme') !== null,
    });
    return {};
  }),
  startGlobe: vi.fn(),
}));
vi.mock('@/about/panel', () => ({
  platformLine: vi.fn(),
  runtimeLine: vi.fn(),
  scheduleWordmark: vi.fn(),
  updateCopy: vi.fn(),
  versionLine: vi.fn(),
}));
vi.mock('@lib/updates', () => ({ checkForUpdates: vi.fn(), readUpdateStatus: vi.fn() }));

describe('the About window', () => {
  beforeEach(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ state: { theme: 'light' }, version: 4 }));
    document.body.innerHTML = '<canvas id="globe"></canvas>';
  });

  it('paints in the saved theme before it reads the globe’s palette', async () => {
    await import('@/about/about');
    expect(document.body.dataset.theme).toBe('light');
    expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull();
    expect(seenAtPaletteRead).toEqual([{ theme: 'light', styled: true }]);
  });
});
