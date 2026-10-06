import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsNew } from '@features/whats-new/components/whats-new';
import { useAppearanceStore } from '@stores/appearance-store';
import { useUiStore } from '@stores/ui-store';

const running = vi.hoisted(() => ({ version: null as string | null }));

vi.mock('@lib/project-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lib/project-config')>()),
  readAppInfo: () => Promise.resolve(running.version === null ? null : { version: running.version, splash: false }),
}));

/** The shell's What's new: closed until asked, and closing records it. */
beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.getState().reset();
  useUiStore.getState().reset();
  running.version = null;
});

describe('WhatsNew', () => {
  it('draws nothing until it is opened', () => {
    render(<WhatsNew />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the newest entry when asked, and closing records it seen and keeps the screen on', async () => {
    running.version = '1.0.2';
    render(<WhatsNew />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => useUiStore.getState().setWhatsNewOpen(true));
    expect(screen.getByRole('dialog', { name: 'Home is the comb' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close What\'s new' }));
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
    expect(useAppearanceStore.getState()).toMatchObject({ whatsNewSeen: '1.0', whatsNewOff: false });
  });

  it('turns future screens off when the box was ticked', async () => {
    const user = userEvent.setup();
    render(<WhatsNew />);
    act(() => useUiStore.getState().setWhatsNewOpen(true));
    await user.click(screen.getByRole('checkbox', { name: 'Don’t show What’s new again' }));
    await user.keyboard('{Escape}');
    expect(useAppearanceStore.getState().whatsNewOff).toBe(true);
  });

  it('previewed on a build older than its entry, closing does not record it seen', async () => {
    running.version = '0.9.0';
    render(<WhatsNew />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => useUiStore.getState().setWhatsNewOpen(true));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close What\'s new' }));
    expect(useUiStore.getState().whatsNewOpen).toBe(false);
    expect(useAppearanceStore.getState().whatsNewSeen).toBeNull();
  });
});
