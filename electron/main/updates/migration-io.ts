import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, constants, cp, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import { HIVETTY_FEED_URL, type MigrationDeps } from './migration';

/**
 * The effects `migration.ts` decides on, done for real.
 *
 * Every command is an argv, never a shell string: the only shell is the
 * hand-off, and it takes its two values as positional parameters.
 */

const run = promisify(execFile);

const APP_NAME = 'HiveTTY.app';

/**
 * What HiveTTY inherits from The Hive's `userData`. Everything else there is
 * either regenerated at launch (`hive/`, the caches) or cannot be read by
 * another app (`*-credential.bin`, bound to The Hive's Keychain item).
 */
export const CARRIED_OVER = ['sessions.json', 'window-state.json', 'Local Storage'] as const;

const exists = (target: string): Promise<boolean> =>
  access(target).then(
    () => true,
    () => false,
  );

/** Copy `CARRIED_OVER` from `from` to `to`, leaving anything already at `to` alone. */
export async function carryOver(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const name of CARRIED_OVER) {
    const source = path.join(from, name);
    const target = path.join(to, name);
    if (!(await exists(source)) || (await exists(target))) continue;
    await cp(source, target, { recursive: true });
  }
}

/** The first of `dirs` holding a `HiveTTY.app`, or null. */
export async function findInstalled(dirs: readonly string[]): Promise<string | null> {
  for (const dir of dirs) {
    const candidate = path.join(dir, APP_NAME);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

type MigrationIo = Pick<
  MigrationDeps,
  | 'installedApp'
  | 'fetchFeed'
  | 'download'
  | 'sha512'
  | 'unpack'
  | 'verify'
  | 'install'
  | 'carryOver'
  | 'oldBundles'
  | 'handOff'
>;

export function createMigrationIo({
  userData,
  readSignature,
}: {
  /** The Hive's `app.getPath('userData')`. */
  userData: string;
  /** `codesign --display --verbose=2`, as `capability.ts` reads it. */
  readSignature: (bundle: string) => Promise<string>;
}): MigrationIo {
  const home = os.homedir();
  const appDirs = ['/Applications', path.join(home, 'Applications')];

  return {
    installedApp: () => findInstalled(appDirs),

    async fetchFeed() {
      const response = await fetch(HIVETTY_FEED_URL);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${HIVETTY_FEED_URL} answered ${response.status}`);
      return response.text();
    },

    async download(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
      }
      const dir = await mkdtemp(path.join(os.tmpdir(), 'hivetty-'));
      const file = path.join(dir, path.basename(new URL(url).pathname));
      // ponytail: buffered in memory (~150 MB); stream it if the app ever gets much bigger.
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      return file;
    },

    async sha512(file) {
      const hash = createHash('sha512');
      await pipeline(createReadStream(file), hash);
      return hash.digest('base64');
    },

    async unpack(zip) {
      const out = path.join(path.dirname(zip), 'out');
      await run('ditto', ['-x', '-k', zip, out]);
      const app = (await readdir(out)).find((name) => name.endsWith('.app'));
      if (app === undefined) throw new Error('the download holds no app');
      return path.join(out, app);
    },

    async verify(app) {
      await run('codesign', ['--verify', '--deep', '--strict', app]);
      return readSignature(app);
    },

    async install(app) {
      // `/Applications` when this user may write there, else their own.
      const dir = await access(appDirs[0], constants.W_OK).then(
        () => appDirs[0],
        async () => {
          await mkdir(appDirs[1], { recursive: true });
          return appDirs[1];
        },
      );
      const target = path.join(dir, APP_NAME);
      await run('ditto', [app, target]);
      return target;
    },

    carryOver: () =>
      carryOver(userData, path.join(home, 'Library', 'Application Support', 'HiveTTY')),

    async oldBundles() {
      const { stdout } = await run('mdfind', ["kMDItemCFBundleIdentifier == 'com.behiques.the-hive'"]);
      return stdout.split('\n').filter((line) => line.endsWith('.app'));
    },

    handOff(target) {
      /*
        The two apps share `~/.hive` and its lock, so HiveTTY may only start
        once this process is gone: the shell outlives the quit and waits for it.
      */
      spawn(
        '/bin/sh',
        ['-c', 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec open "$2"', 'hand-off', String(process.pid), target],
        { detached: true, stdio: 'ignore' },
      ).unref();
    },
  };
}
