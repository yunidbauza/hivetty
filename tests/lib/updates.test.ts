import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkForUpdates, readUpdateStatus } from '@/lib/updates';

/**
 * The renderer's door onto the updater, and the three states it has to keep
 * apart.
 *
 * "There is no bridge" is the browser target, where the pane says updates are
 * unavailable. "The bridge threw" is a desktop app whose main process refused,
 * where the honest answer is the same *shape* — `null` — but must not take the
 * render down on the way. Only the third case has a status to show.
 */

const bridge = (
  overrides: Partial<{
    status: () => Promise<unknown>;
    check: () => Promise<void>;
  }> = {},
): void => {
  (window as { hive?: unknown }).hive = {
    updates: {
      status: overrides.status ?? vi.fn().mockResolvedValue({ state: 'idle' }),
      check: overrides.check ?? vi.fn().mockResolvedValue(undefined),
    },
  };
};

afterEach(() => {
  delete (window as { hive?: unknown }).hive;
});

describe('readUpdateStatus', () => {
  it('answers null with no bridge, without throwing', async () => {
    await expect(readUpdateStatus()).resolves.toBeNull();
  });

  it('passes the status through when main answers', async () => {
    bridge({ status: vi.fn().mockResolvedValue({ state: 'available' }) });
    await expect(readUpdateStatus()).resolves.toEqual({ state: 'available' });
  });

  it('answers null rather than rejecting into a render when main throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bridge({ status: vi.fn().mockRejectedValue(new Error('channel gone')) });

    await expect(readUpdateStatus()).resolves.toBeNull();
    expect(error).toHaveBeenCalled();
  });
});

describe('checkForUpdates', () => {
  it('does nothing at all with no bridge', async () => {
    await expect(checkForUpdates()).resolves.toBeUndefined();
  });

  it('asks main to look', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    bridge({ check });

    await checkForUpdates();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed check — main already reported it in its own dialog', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    bridge({ check: vi.fn().mockRejectedValue(new Error('nope')) });

    await expect(checkForUpdates()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
