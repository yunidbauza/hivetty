// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  createMigration,
  parseFeed,
  type MigrationDeps,
} from '../../../../electron/main/updates/migration';

/**
 * The Hive → HiveTTY move, decided with no network, no bundle and no codesign.
 *
 * HiveTTY has a new app ID, so Squirrel cannot update The Hive into it in
 * place. The Hive finds HiveTTY's release itself, installs it beside itself,
 * carries its app data over, and hands off.
 */

const OWN = [
  'Identifier=com.behiques.the-hive',
  'Authority=Developer ID Application: Behiques Consulting LLC (PQ3A79Q3V2)',
  'TeamIdentifier=PQ3A79Q3V2',
].join('\n');

const HIVETTY = [
  'Identifier=com.behiques.hivetty',
  'Authority=Developer ID Application: Behiques Consulting LLC (PQ3A79Q3V2)',
  'TeamIdentifier=PQ3A79Q3V2',
].join('\n');

const FEED = `version: 1.3.0
files:
  - url: HiveTTY-1.3.0-arm64-mac.zip
    sha512: c2hh
    size: 10
  - url: HiveTTY-1.3.0-arm64.dmg
    sha512: ZG1n
    size: 12
path: HiveTTY-1.3.0-arm64-mac.zip
sha512: c2hh
releaseDate: '2026-11-01T00:00:00.000Z'
`;

const HIVE_FEED = FEED.replaceAll('HiveTTY-1.3.0', 'The-Hive-1.2.4').replace('1.3.0', '1.2.4');

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function harness(over: Partial<MigrationDeps> = {}) {
  const calls: string[] = [];
  const deps: MigrationDeps = {
    identity: 'The Hive',
    unattended: false,
    ownSignature: vi.fn(async () => OWN),
    ownBundle: '/Applications/The Hive.app',
    installedApp: vi.fn(async () => null),
    fetchFeed: vi.fn(async () => FEED),
    download: vi.fn(async (url: string) => {
      calls.push(`download ${url}`);
      return '/tmp/x/HiveTTY.zip';
    }),
    sha512: vi.fn(async () => 'c2hh'),
    unpack: vi.fn(async () => '/tmp/x/out/HiveTTY.app'),
    verify: vi.fn(async (app: string) => {
      calls.push(`verify ${app}`);
      return HIVETTY;
    }),
    install: vi.fn(async (app: string) => {
      calls.push(`install ${app}`);
      return '/Applications/HiveTTY.app';
    }),
    oldBundles: vi.fn(async () => ['/Applications/The Hive.app', '/Users/me/Applications/The Hive.app']),
    trash: vi.fn(async (path: string) => {
      calls.push(`trash ${path}`);
    }),
    handOff: vi.fn((target: string) => {
      calls.push(`handOff ${target}`);
    }),
    quit: vi.fn(() => {
      calls.push('quit');
    }),
    isIdle: () => true,
    confirm: vi.fn(async () => true),
    inform: vi.fn(),
    openExternal: vi.fn(),
    log: vi.fn(),
    ...over,
  };
  return { deps, calls, migration: createMigration(deps) };
}

describe('parseFeed', () => {
  it('reads the version, the zip and its checksum from the top level', () => {
    expect(parseFeed(FEED)).toEqual({
      version: '1.3.0',
      file: 'HiveTTY-1.3.0-arm64-mac.zip',
      sha512: 'c2hh',
    });
  });

  it('answers null for a feed missing a field', () => {
    expect(parseFeed('version: 1.3.0\n')).toBeNull();
  });
});

describe('createMigration', () => {
  it('installs a verified HiveTTY, hands off (the copy runs after exit), trashes every old bundle, then quits', async () => {
    const { migration, calls, deps } = harness();

    expect(await migration.check('auto')).toBe(true);
    await flush();

    expect(calls).toEqual([
      'download https://github.com/yunidbauza/hivetty/releases/download/v1.3.0/HiveTTY-1.3.0-arm64-mac.zip',
      'verify /tmp/x/out/HiveTTY.app',
      'install /tmp/x/out/HiveTTY.app',
      'handOff /Applications/HiveTTY.app',
      'trash /Applications/The Hive.app',
      'trash /Users/me/Applications/The Hive.app',
      'quit',
    ]);
    expect(deps.confirm).toHaveBeenCalledTimes(2);
  });

  it('is silent, and lets the normal check run, when the feed is missing or is not HiveTTY', async () => {
    for (const feed of [null, HIVE_FEED, 'garbage']) {
      const { migration, deps } = harness({ fetchFeed: vi.fn(async () => feed) });
      expect(await migration.check('auto')).toBe(false);
      expect(deps.confirm).not.toHaveBeenCalled();
    }
  });

  it('does nothing in a build that is not The Hive, on a server, or without a Developer ID team', async () => {
    for (const over of [
      { identity: 'HiveTTY' },
      { unattended: true },
      { ownSignature: vi.fn(async () => 'Signature=adhoc') },
      { ownSignature: vi.fn(async () => Promise.reject(new Error('not signed'))) },
    ]) {
      const { migration, deps } = harness(over);
      expect(await migration.check('auto')).toBe(false);
      expect(deps.fetchFeed).not.toHaveBeenCalled();
    }
  });

  it('asks once per launch in the background; the menu always asks', async () => {
    const { migration, deps } = harness({ confirm: vi.fn(async () => false) });

    expect(await migration.check('auto')).toBe(true);
    expect(await migration.check('auto')).toBe(false);
    expect(await migration.check('menu')).toBe(true);

    expect(deps.confirm).toHaveBeenCalledTimes(2);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('a check while HiveTTY is still downloading starts nothing new, and says so on the menu', async () => {
    let finish: (path: string) => void = () => undefined;
    const download = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const { migration, deps } = harness({ download });

    await migration.check('auto');
    await flush();
    expect(await migration.check('menu')).toBe(true);
    expect(await migration.check('auto')).toBe(true);

    expect(download).toHaveBeenCalledTimes(1);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.inform).toHaveBeenCalledWith(expect.objectContaining({ message: 'HiveTTY is downloading.' }));

    finish('/tmp/x/HiveTTY.zip');
    await flush();
    expect(deps.quit).toHaveBeenCalled();
  });

  it('offers the switch straight away when HiveTTY is already installed, verifying it first', async () => {
    const { migration, calls, deps } = harness({
      installedApp: vi.fn(async () => '/Applications/HiveTTY.app'),
    });

    expect(await migration.check('auto')).toBe(true);
    await flush();

    expect(deps.fetchFeed).not.toHaveBeenCalled();
    expect(calls[0]).toBe('verify /Applications/HiveTTY.app');
    expect(calls).toContain('quit');
    expect(deps.confirm).toHaveBeenCalledTimes(1);
  });

  it('warns that live work stops when the fleet is busy', async () => {
    const { migration, deps } = harness({
      installedApp: vi.fn(async () => '/Applications/HiveTTY.app'),
      isIdle: () => false,
    });

    await migration.check('auto');
    await flush();

    const detail = vi.mocked(deps.confirm).mock.calls[0]![0].detail;
    expect(detail).toMatch(/sessions and agent runs/i);
  });

  it('a Later on the switch quits nothing and trashes nothing', async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { migration, calls } = harness({ confirm });

    await migration.check('auto');
    await flush();

    expect(calls).toContain('install /tmp/x/out/HiveTTY.app');
    expect(calls.some((c) => c.startsWith('trash') || c === 'quit' || c.startsWith('handOff'))).toBe(false);
  });

  it.each([
    ['a checksum mismatch', { sha512: vi.fn(async () => 'bm9wZQ==') }],
    ['another team', { verify: vi.fn(async () => HIVETTY.replaceAll('PQ3A79Q3V2', 'EVIL000000')) }],
    ['another bundle id', { verify: vi.fn(async () => HIVETTY.replace('com.behiques.hivetty', 'com.evil.app')) }],
    ['a failed codesign', { verify: vi.fn(async () => Promise.reject(new Error('invalid signature'))) }],
  ])('refuses %s: installs nothing, tells the user and opens the release page', async (_name, over) => {
    const { migration, deps } = harness(over);

    await migration.check('auto');
    await flush();

    expect(deps.install).not.toHaveBeenCalled();
    expect(deps.quit).not.toHaveBeenCalled();
    expect(deps.inform).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'HiveTTY could not be installed.' }),
    );
    expect(deps.openExternal).toHaveBeenCalledWith(
      'https://github.com/yunidbauza/hivetty/releases/tag/v1.3.0',
    );
  });

  it('never throws out of a check: a failed fetch logs and lets the normal check run', async () => {
    const { migration, deps } = harness({ fetchFeed: vi.fn(async () => Promise.reject(new Error('offline'))) });

    expect(await migration.check('auto')).toBe(false);
    expect(deps.log).toHaveBeenCalled();
    expect(deps.inform).not.toHaveBeenCalled();
  });

  it('still trashes the rest and quits when one bundle will not go to the Trash', async () => {
    const trash = vi.fn(async (path: string) => {
      if (path === '/Applications/The Hive.app') throw new Error('busy');
    });
    const { migration, deps } = harness({ trash });

    await migration.check('auto');
    await flush();

    expect(trash).toHaveBeenCalledWith('/Users/me/Applications/The Hive.app');
    expect(deps.quit).toHaveBeenCalled();
  });

  it('trashes the running bundle even when Spotlight does not list it, and only once', async () => {
    const { migration, deps } = harness({ oldBundles: vi.fn(async () => []) });

    await migration.check('auto');
    await flush();

    expect(deps.trash).toHaveBeenCalledTimes(1);
    expect(deps.trash).toHaveBeenCalledWith('/Applications/The Hive.app');
  });
});
