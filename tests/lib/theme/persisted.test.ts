import { afterEach, describe, expect, it } from 'vitest';

import { THEME_STYLE_ID } from '@lib/theme/apply';
import { BUILT_IN_THEME } from '@lib/theme/built-in';
import { BUILT_IN_THEMES } from '@lib/theme/built-in-themes';
import {
  APPEARANCE_STORAGE_KEY,
  applyPersistedAppearance,
  readPersistedAppearance,
} from '@lib/theme/persisted';

const store = (state: unknown) => ({
  getItem: (key: string) => (key === APPEARANCE_STORAGE_KEY ? JSON.stringify({ state, version: 4 }) : null),
});
const someBuiltIn = Object.entries(BUILT_IN_THEMES)[0]!;
const imported = { ...structuredClone(BUILT_IN_THEME), name: 'Nord' };

describe('readPersistedAppearance', () => {
  it('reads the mode the person chose', () => {
    expect(readPersistedAppearance(store({ theme: 'light' }), true).mode).toBe('light');
    expect(readPersistedAppearance(store({ theme: 'dark' }), false).mode).toBe('dark');
  });

  it('resolves system from the OS', () => {
    expect(readPersistedAppearance(store({ theme: 'system' }), true).mode).toBe('dark');
    expect(readPersistedAppearance(store({ theme: 'system' }), false).mode).toBe('light');
  });

  it('picks a built-in theme by id, and an imported one from the library', () => {
    expect(readPersistedAppearance(store({ activeThemeId: someBuiltIn[0] }), true).theme).toBe(someBuiltIn[1]);
    expect(readPersistedAppearance(store({ activeThemeId: 'nord', themes: { nord: imported } }), true).theme).toEqual(imported);
  });

  it('falls back to the built-in dark theme on anything it cannot trust', () => {
    const fallback = { mode: 'dark', theme: BUILT_IN_THEME };
    expect(readPersistedAppearance({ getItem: () => null }, false)).toEqual(fallback);
    expect(readPersistedAppearance({ getItem: () => '{not json' }, false)).toEqual(fallback);
    expect(readPersistedAppearance({ getItem: () => { throw new Error('denied'); } }, false)).toEqual(fallback);
    expect(readPersistedAppearance(store({ activeThemeId: 'evil', themes: { evil: { name: 1 } } }), false).theme).toBe(BUILT_IN_THEME);
  });
});

describe('applyPersistedAppearance', () => {
  afterEach(() => {
    delete document.body.dataset.theme;
    document.getElementById(THEME_STYLE_ID)?.remove();
  });

  it('marks light mode on <body> and writes the theme’s colours', () => {
    applyPersistedAppearance(store({ theme: 'light' }), true);
    expect(document.body.dataset.theme).toBe('light');
    expect(document.getElementById(THEME_STYLE_ID)?.textContent).toContain('body[data-theme');
  });

  it('leaves dark unmarked', () => {
    applyPersistedAppearance(store({ theme: 'dark' }), true);
    expect(document.body.dataset.theme).toBeUndefined();
  });
});
