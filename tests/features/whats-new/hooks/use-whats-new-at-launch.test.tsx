import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { emptySnapshot, type ConfigSnapshot } from '@shared/config-contract';

import { useWhatsNewAtLaunch, WHATS_NEW_DELAY_MS } from '@features/whats-new/hooks/use-whats-new-at-launch';
import { resetProjectConfig, setProjectConfigForTest } from '@lib/project-config';
import { useAppearanceStore } from '@stores/appearance-store';
import { useUiStore } from '@stores/ui-store';

const appInfo = vi.fn();
vi.mock('@lib/project-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/project-config')>()),
  readAppInfo: () => appInfo(),
}));

/** When What's new opens itself at launch (1.0). */
const config = (templateWritten: boolean): ConfigSnapshot => ({ ...emptySnapshot('/tmp/hive/config.json', '/bin/zsh'), templateWritten });
const info = (version: string, splash?: boolean) => ({ version, ...(splash === undefined ? {} : { splash }) });

const launch = async () => {
  const hook = renderHook(() => useWhatsNewAtLaunch());
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
};
const open = () => useUiStore.getState().whatsNewOpen;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAppearanceStore.getState().reset();
  useUiStore.getState().reset();
  setProjectConfigForTest(config(false));
});

afterEach(() => {
  vi.useRealTimers();
  resetProjectConfig();
  appInfo.mockReset();
});

describe('useWhatsNewAtLaunch', () => {
  it('opens 1.0’s card after the window settles, for someone upgrading, and answers the version', async () => {
    appInfo.mockResolvedValue(info('1.0.0', true));
    const { result } = await launch();
    expect(result.current).toBe('1.0.0');
    expect(open()).toBe(false);
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS));
    expect(open()).toBe(true);
  });

  it('records a fresh install as seen and shows nothing: the first-run page is its tour', async () => {
    setProjectConfigForTest(config(true));
    appInfo.mockResolvedValue(info('1.0.2'));
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 2));
    expect(open()).toBe(false);
    expect(useAppearanceStore.getState().whatsNewSeen).toBe('1.0');
  });

  it('never shows after a launch without the splash, nor without app info', async () => {
    appInfo.mockResolvedValue(info('1.0.0', false));
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 2));
    expect(open()).toBe(false);

    appInfo.mockResolvedValue(null);
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 2));
    expect(open()).toBe(false);
  });

  it('shows nothing once seen, after the opt-out, or for a release without an entry', async () => {
    useAppearanceStore.getState().setWhatsNewSeen('1.0');
    appInfo.mockResolvedValue(info('1.0.1'));
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 2));
    expect(open()).toBe(false);

    appInfo.mockResolvedValue(info('0.15.7'));
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 2));
    expect(open()).toBe(false);
  });

  it('waits while the picker or Settings is up, then opens', async () => {
    useUiStore.getState().openPicker();
    appInfo.mockResolvedValue(info('1.0.0'));
    await launch();
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS * 3));
    expect(open()).toBe(false);
    act(() => useUiStore.getState().closePicker());
    act(() => vi.advanceTimersByTime(WHATS_NEW_DELAY_MS));
    expect(open()).toBe(true);
  });
});
