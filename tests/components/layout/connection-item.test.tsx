import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RemoteLinkStatus } from '@shared/ipc-contract';

import { ConnectionItem } from '@components/layout/connection-item';
import { useHiveStore } from '@stores/hive-store';
import { useUiStore } from '@stores/ui-store';

const src = vi.hoisted(() => ({
  desktop: true,
  exposed: null as string | null,
  serving: null as string | null,
  devices: 0,
}));

vi.mock('@config/runtime', () => ({ isDesktop: () => src.desktop }));
vi.mock('@hooks/use-project-config', () => ({
  useReceiverExposure: () => src.exposed,
  useServerExposure: () => src.serving,
  useServingDeviceCount: () => src.devices,
}));

const link = (over: Partial<RemoteLinkStatus> = {}): RemoteLinkStatus => ({
  state: 'attached',
  serverName: 'mac-mini',
  attempt: 0,
  nextAttemptAt: null,
  reason: null,
  epoch: 0,
  lost: 0,
  ...over,
});

/** Installs a pushed link status, or `null` for none, in the real store. */
const setLink = (status: RemoteLinkStatus | null): void => {
  act(() => useHiveStore.getState().setRemoteLink(status));
};

const item = () => screen.getByTestId('connection-item');
const open = async () => {
  await userEvent.click(item());
  return screen.getByRole('dialog');
};

describe('ConnectionItem (HIVE-196)', () => {
  beforeEach(() => {
    Object.assign(src, { desktop: true, exposed: null, serving: null, devices: 0 });
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });

  it.each([
    ['local', {}, 'Local', 'text-muted', 'bg-green'],
    ['serving', { serving: '0.0.0.0:7420', devices: 2 }, 'Serving', 'text-muted', 'bg-brand'],
    ['attached', { link: link() }, 'mac-mini', 'text-muted', 'bg-brand'],
    ['reconnecting', { link: link({ state: 'reconnecting' }) }, 'mac-mini', 'text-amber-text', 'border-amber'],
    ['disconnected', { link: link({ state: 'disconnected' }) }, 'mac-mini', 'text-muted', 'bg-red'],
    ['exposed', { exposed: '0.0.0.0' }, 'Exposed', 'text-amber-text', 'bg-amber'],
    ['demo', { desktop: false }, 'Demo', 'text-amber-text', 'bg-amber'],
  ] as const)('%s: label, tone and dot', (_state, over, label, tone, dot) => {
    const { link: status = null, ...rest } = over as { link?: RemoteLinkStatus };
    Object.assign(src, rest);
    setLink(status);
    render(<ConnectionItem />);
    expect(item()).toHaveTextContent(label);
    expect(item()).toHaveAccessibleName(`Connection: ${label}`);
    expect(item()).toHaveClass(tone);
    expect(item().querySelector('[data-dot]')).toHaveClass(dot);
  });

  it('pulses the reconnecting ring', () => {
    setLink(link({ state: 'reconnecting' }));
    render(<ConnectionItem />);
    expect(item().querySelector('[data-dot]')).toHaveClass('animate-ccpulse');
  });

  it('labels by precedence and lists every state that holds', async () => {
    src.exposed = '0.0.0.0';
    setLink(link());
    render(<ConnectionItem />);
    expect(item()).toHaveTextContent('Exposed');

    const dialog = await open();
    const titles = within(dialog).getAllByRole('heading').map((h) => h.textContent);
    expect(titles).toEqual(['Exposed on 0.0.0.0', 'Attached to mac-mini']);
  });

  it('local says nothing is served or exposed', async () => {
    render(<ConnectionItem />);
    expect(await open()).toHaveTextContent('This Hive runs here. Nothing is served or exposed.');
  });

  it('serving names the devices and the address, and links to Server mode', async () => {
    Object.assign(src, { serving: '0.0.0.0:7420', devices: 1 });
    render(<ConnectionItem />);
    const dialog = await open();
    expect(dialog).toHaveTextContent('Serving its sessions to 1 paired device on 0.0.0.0:7420.');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Settings › Advanced › Server mode' }));

    expect(useUiStore.getState()).toMatchObject({ settings: true, settingsSection: 'advanced' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposed names the address and links to Containers', async () => {
    src.exposed = '0.0.0.0';
    render(<ConnectionItem />);
    const dialog = await open();
    expect(dialog).toHaveTextContent('The receiver accepts connections on 0.0.0.0, not only loopback.');
    expect(within(dialog).getByRole('button', { name: 'Settings › Advanced › Containers' })).toBeInTheDocument();
  });

  it('attached, disconnected and demo carry their sentences', async () => {
    setLink(link());
    const { unmount } = render(<ConnectionItem />);
    expect(await open()).toHaveTextContent('its sessions are what you are driving right now');
    unmount();

    setLink(link({ state: 'disconnected', reason: 'token revoked' }));
    const second = render(<ConnectionItem />);
    expect(await open()).toHaveTextContent('The connection ended and is not being retried: token revoked');
    second.unmount();

    setLink(null);
    src.desktop = false;
    render(<ConnectionItem />);
    expect(await open()).toHaveTextContent('Real sessions need the desktop app.');
  });

  it('never renders a header', () => {
    render(<ConnectionItem />);
    expect(screen.queryByRole('banner')).toBeNull();
  });
});

describe('ConnectionItem — the link row (HIVE-196)', () => {
  beforeEach(() => {
    Object.assign(src, { desktop: true, exposed: null, serving: null, devices: 0 });
    useUiStore.getState().reset();
    useHiveStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names what the dropped link swallowed, and Clear acknowledges it', async () => {
    setLink(link({ state: 'reconnecting', lost: 3 }));
    render(<ConnectionItem />);
    const dialog = await open();
    expect(dialog).toHaveTextContent('3 actions (clicks or keystrokes) did not reach mac-mini; redo them once it is back.');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear' }));

    expect(dialog).not.toHaveTextContent('did not reach');
  });

  it('says it once, without "once it is back", while attached', async () => {
    setLink(link({ lost: 1 }));
    render(<ConnectionItem />);
    expect(await open()).toHaveTextContent('1 action (clicks or keystrokes) did not reach mac-mini; redo it.');
  });

  it('a new loss after Clear shows only the new one, and going local resets the count', async () => {
    setLink(link({ lost: 2 }));
    const { rerender } = render(<ConnectionItem />);
    await userEvent.click(within(await open()).getByRole('button', { name: 'Clear' }));

    setLink(link({ lost: 3 }));
    rerender(<ConnectionItem />);
    expect(screen.getByRole('dialog')).toHaveTextContent('1 action (clicks or keystrokes)');

    await userEvent.keyboard('{Escape}');
    setLink(null);
    rerender(<ConnectionItem />);
    setLink(link({ lost: 2 }));
    rerender(<ConnectionItem />);
    expect(await open()).toHaveTextContent('2 actions (clicks or keystrokes)');
  });

  /*
    HIVE-211: Clear writes the store's acknowledgement, which the Classic chip
    and the stage line read too, so one Clear clears all three.
  */
  it('Clear acknowledges into the store, and a store acknowledgement hides the note', async () => {
    setLink(link({ state: 'reconnecting', lost: 3 }));
    render(<ConnectionItem />);
    await userEvent.click(within(await open()).getByRole('button', { name: 'Clear' }));
    expect(useHiveStore.getState().remoteLostAcked).toBe(3);

    act(() => useHiveStore.setState({ remoteLostAcked: 0 }));
    expect(screen.getByRole('dialog')).toHaveTextContent('3 actions');
    act(() => useHiveStore.setState({ remoteLostAcked: 3 }));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('did not reach');
  });

  it('counts down to the next try while open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(0);
    setLink(link({ state: 'reconnecting', nextAttemptAt: 8_000 }));
    render(<ConnectionItem />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(item());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Next try in 8s.');

    act(() => vi.advanceTimersByTime(1_000));

    expect(dialog).toHaveTextContent('Next try in 7s.');
  });

  it('drops the countdown when no try is scheduled', async () => {
    setLink(link({ state: 'reconnecting', nextAttemptAt: null }));
    render(<ConnectionItem />);
    expect(await open()).not.toHaveTextContent('Next try');
  });
});
