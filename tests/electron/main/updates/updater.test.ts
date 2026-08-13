// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateCapability } from '../../../../electron/shared/update-contract';

import {
  createUpdater,
  type UpdateEngine,
  type UpdaterDeps,
} from '../../../../electron/main/updates/updater';

/**
 * The update *decisions*, with no bundle, no network and no signature.
 *
 * What is worth asserting here is everything the design turns on: that a
 * background check is silent when it finds nothing and a menu check never is,
 * that a release announces itself once rather than four times a day, and — the
 * one that justifies the whole two-path design — that an ad-hoc build which
 * gets refused stops trying and starts sending the user to the download page.
 *
 * None of that is reachable through `electron-updater`, which is exactly why
 * `updater.ts` does not import it.
 */

const SELF_INSTALL: UpdateCapability = {
  canCheck: true,
  mode: 'self-install',
  unverified: false,
  reason: 'Signed with a Developer ID. Updates install themselves.',
};

const ADHOC: UpdateCapability = {
  canCheck: true,
  mode: 'self-install',
  unverified: true,
  reason: 'This copy is ad-hoc signed…',
};

const MANUAL: UpdateCapability = {
  canCheck: true,
  mode: 'manual',
  unverified: false,
  reason: 'This copy is not code signed…',
};

const DEV: UpdateCapability = {
  canCheck: false,
  mode: 'manual',
  unverified: false,
  reason: 'This is a development run.',
};

interface Harness {
  deps: UpdaterDeps;
  engine: { [K in keyof UpdateEngine]: ReturnType<typeof vi.fn> };
  notify: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
  inform: ReturnType<typeof vi.fn>;
  timers: (() => void)[];
}

function harness(
  capability: UpdateCapability,
  found: { version: string } | null = { version: '0.2.0' },
): Harness {
  const engine = {
    check: vi.fn().mockResolvedValue(found),
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn(),
  };
  const notify = vi.fn();
  const openExternal = vi.fn();
  const confirm = vi.fn().mockResolvedValue(true);
  const inform = vi.fn();
  const timers: (() => void)[] = [];

  return {
    engine,
    notify,
    openExternal,
    confirm,
    inform,
    timers,
    deps: {
      engine: engine as unknown as UpdateEngine,
      capability,
      currentVersion: '0.1.0',
      notify,
      openExternal,
      confirm,
      inform,
      setTimer: (fn) => {
        timers.push(fn);
        return 0;
      },
      log: () => undefined,
    },
  };
}

describe('createUpdater — background checks', () => {
  it('announces a found release into the inbox, and says nothing when there is none', async () => {
    const withUpdate = harness(SELF_INSTALL);
    await createUpdater(withUpdate.deps).check('auto');
    expect(withUpdate.notify).toHaveBeenCalledTimes(1);
    expect(withUpdate.notify.mock.calls[0][0]).toMatchObject({
      kind: 'app.update_available',
      title: 'Update available — 0.2.0',
      action: { type: 'update.download' },
    });

    // The silence is the feature: nobody asked, so finding nothing is not news.
    const upToDate = harness(SELF_INSTALL, null);
    await createUpdater(upToDate.deps).check('auto');
    expect(upToDate.notify).not.toHaveBeenCalled();
    expect(upToDate.inform).not.toHaveBeenCalled();
  });

  it('keys the notification on the version, so six-hourly checks cannot spam one release', async () => {
    // The hub dedups on id. An id carrying the time of discovery would defeat
    // it and put the same news in the inbox four times a day.
    const h = harness(SELF_INSTALL);
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.check('auto');

    const ids = h.notify.mock.calls.map((call) => call[0].id as string);
    expect(ids).toEqual([
      'app.update_available:0.2.0',
      'app.update_available:0.2.0',
    ]);
  });

  it('points the row at the release page when the bundle cannot install in place', async () => {
    const h = harness(MANUAL);
    await createUpdater(h.deps).check('auto');

    expect(h.notify.mock.calls[0][0]).toMatchObject({
      action: {
        type: 'url',
        url: 'https://github.com/yunidbauza/the-hive/releases/tag/v0.2.0',
      },
    });
  });

  it('does not schedule anything at all in a build that cannot check', () => {
    const h = harness(DEV);
    createUpdater(h.deps).start();
    expect(h.timers).toHaveLength(0);
  });
});

describe('createUpdater — the menu', () => {
  it('answers "up to date" out loud, because a menu item that does nothing looks broken', async () => {
    const h = harness(SELF_INSTALL, null);
    await createUpdater(h.deps).check('menu');

    expect(h.inform).toHaveBeenCalledWith({
      message: "You're up to date.",
      detail: 'The Hive 0.1.0 is the latest version.',
    });
  });

  it('asks before downloading, and downloads only on yes', async () => {
    const yes = harness(SELF_INSTALL);
    await createUpdater(yes.deps).check('menu');
    expect(yes.confirm.mock.calls[0][0]).toMatchObject({
      message: 'The Hive 0.2.0 is available.',
      confirmLabel: 'Download',
    });
    expect(yes.engine.download).toHaveBeenCalledTimes(1);

    const no = harness(SELF_INSTALL);
    no.confirm.mockResolvedValue(false);
    await createUpdater(no.deps).check('menu');
    expect(no.engine.download).not.toHaveBeenCalled();
  });

  it('raises no inbox row for a menu check — the dialog already said it', async () => {
    const h = harness(SELF_INSTALL);
    h.confirm.mockResolvedValue(false);
    await createUpdater(h.deps).check('menu');
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('explains itself in a development run rather than failing quietly', async () => {
    const h = harness(DEV);
    await createUpdater(h.deps).check('menu');

    expect(h.inform).toHaveBeenCalledWith({
      message: 'Updates are not available in this build.',
      detail: 'This is a development run.',
    });
    expect(h.engine.check).not.toHaveBeenCalled();
  });

  it('reports a failed check to the person who asked, and stays quiet for the timer', async () => {
    const asked = harness(SELF_INSTALL);
    asked.engine.check.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await createUpdater(asked.deps).check('menu');
    expect(asked.inform.mock.calls[0][0]).toMatchObject({
      message: 'Could not check for updates.',
      detail: 'getaddrinfo ENOTFOUND',
    });

    const background = harness(SELF_INSTALL);
    background.engine.check.mockRejectedValue(new Error('offline'));
    const updater = createUpdater(background.deps);
    await updater.check('auto');
    expect(background.inform).not.toHaveBeenCalled();
    expect(updater.status().state).toBe('error');
  });
});

describe('createUpdater — download and install', () => {
  it('announces a finished download as a restart prompt', async () => {
    const h = harness(SELF_INSTALL);
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.download();

    expect(h.notify.mock.calls[1][0]).toMatchObject({
      kind: 'app.update_ready',
      title: 'Update ready — 0.2.0',
      action: { type: 'update.install' },
    });
    expect(updater.status().state).toBe('ready');
  });

  it('installs only from `ready`, and never silently no-ops', async () => {
    const h = harness(SELF_INSTALL);
    const updater = createUpdater(h.deps);

    // Nothing downloaded yet: falling through to the release page is the
    // honest answer, and doing nothing would be the dishonest one.
    updater.install();
    expect(h.engine.install).not.toHaveBeenCalled();
    expect(h.openExternal).toHaveBeenCalledTimes(1);

    await updater.check('auto');
    await updater.download();
    updater.install();
    expect(h.engine.install).toHaveBeenCalledTimes(1);
  });

  it('opens the page instead of downloading when the bundle cannot install in place', async () => {
    const h = harness(MANUAL);
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.download();

    expect(h.engine.download).not.toHaveBeenCalled();
    expect(h.openExternal).toHaveBeenCalledWith(
      'https://github.com/yunidbauza/the-hive/releases/tag/v0.2.0',
    );
  });
});

describe('createUpdater — the ad-hoc signature question', () => {
  /**
   * The behaviour the whole two-path design exists for.
   *
   * An ad-hoc bundle is *allowed to try*. When macOS refuses the swap, the
   * refusal must convert into a working manual path — and must not be retried,
   * because the answer will not change for the life of the process.
   */
  it('falls back to the download page when macOS refuses the swap', async () => {
    const h = harness(ADHOC);
    h.engine.download.mockRejectedValue(
      new Error('Could not get code signature for running application'),
    );
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.download();

    expect(h.openExternal).toHaveBeenCalledWith(
      'https://github.com/yunidbauza/the-hive/releases/tag/v0.2.0',
    );
    expect(updater.status().capability).toMatchObject({
      mode: 'manual',
      unverified: false,
    });
    expect(updater.status().capability.reason).toContain(
      'macOS refused to install the update in place',
    );
  });

  it('stops attempting the download after one refusal', async () => {
    const h = harness(ADHOC);
    h.engine.download.mockRejectedValue(new Error('refused'));
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.download();
    await updater.download();

    // Once, not twice: the second click took the manual path.
    expect(h.engine.download).toHaveBeenCalledTimes(1);
    expect(h.openExternal).toHaveBeenCalledTimes(2);
  });

  it('re-points a subsequent announcement at the page once demoted', async () => {
    const h = harness(ADHOC);
    h.engine.download.mockRejectedValue(new Error('refused'));
    const updater = createUpdater(h.deps);

    await updater.check('auto');
    await updater.download();
    await updater.check('auto');

    expect(h.notify.mock.calls.at(-1)?.[0]).toMatchObject({
      action: { type: 'url' },
    });
  });
});

describe('createUpdater — concurrency', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('refuses a second concurrent check rather than running two', async () => {
    const h = harness(SELF_INSTALL);
    let release: (value: { version: string } | null) => void = () => undefined;
    h.engine.check.mockReturnValue(
      new Promise<{ version: string } | null>((resolve) => {
        release = resolve;
      }),
    );
    const updater = createUpdater(h.deps);

    const first = updater.check('auto');
    await updater.check('menu');

    expect(h.inform.mock.calls[0][0]).toMatchObject({
      message: 'Already checking for updates.',
    });
    expect(h.engine.check).toHaveBeenCalledTimes(1);

    release(null);
    await first;
  });
});
