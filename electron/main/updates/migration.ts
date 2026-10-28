/**
 * The Hive's move to HiveTTY (HIVE-328, HIVE-329).
 *
 * HiveTTY is this app under a new name *and a new app ID*
 * (`com.behiques.hivetty`). The app ID is part of the designated requirement
 * Squirrel checks at the swap, so no in-place update can turn The Hive into
 * HiveTTY. The Hive does the move itself instead: it finds HiveTTY's release,
 * installs it beside itself, carries its app data over, moves every copy of
 * itself to the Trash and hands off.
 *
 * What carries over, and what does not:
 *
 * - `~/.hive` (config, skills, agents, the ledger) is shared by name and is
 *   never touched.
 * - From `userData`: session history, window state and `Local Storage`
 *   (appearance). Copied by the `carryOver` dep, never over HiveTTY's own.
 * - Not credentials. `safeStorage`'s Keychain item is named after the app, so
 *   HiveTTY cannot decrypt what The Hive stored, and it already reads an
 *   undecryptable credential as "not set". The old `userData` stays put.
 *
 * Inert anywhere it cannot be done safely or should not be done at all: a
 * build that is no longer The Hive (HiveTTY ships this file too until it is
 * deleted), a server (nobody to say yes; its LaunchAgent is HIVE-329's), and a
 * build with no Developer ID team to compare HiveTTY's signature against.
 *
 * Like `updater.ts`, nothing here imports Electron: every effect is a dep, so
 * the decisions are testable without a bundle, a network or `codesign`.
 */

export const HIVETTY_RELEASES_URL = 'https://github.com/yunidbauza/hivetty/releases';
export const HIVETTY_FEED_URL = `${HIVETTY_RELEASES_URL}/latest/download/latest-mac.yml`;
const HIVETTY_BUNDLE_ID = 'com.behiques.hivetty';

export interface HiveTtyRelease {
  version: string;
  /** The updater zip, as named in the feed's top-level `path`. */
  file: string;
  /** Base64 SHA-512 of that zip, as electron-builder writes it. */
  sha512: string;
}

export interface MigrationDeps {
  /** `APP_IDENTITY_NAME`. Anything but `The Hive` turns this off. */
  identity: string;
  /** A server (HIVE-147): nobody is there to answer a dialog. */
  unattended: boolean;
  /** `codesign --display --verbose=2` of the running bundle. */
  ownSignature: () => Promise<string>;
  /** The running `.app`, trashed even when Spotlight does not list it. */
  ownBundle: string;
  /** An already installed `HiveTTY.app`, or null. */
  installedApp: () => Promise<string | null>;
  /** HiveTTY's `latest-mac.yml`, or null when there is none (404). */
  fetchFeed: () => Promise<string | null>;
  /** Fetch a URL to a local file; resolves with its path. */
  download: (url: string) => Promise<string>;
  /** Base64 SHA-512 of a local file. */
  sha512: (path: string) => Promise<string>;
  /** Unpack the zip; resolves with the `.app` inside. */
  unpack: (zip: string) => Promise<string>;
  /**
   * `codesign --verify --deep --strict`, rejecting when it fails, then resolve
   * with `codesign --display --verbose=2`'s report.
   */
  verify: (app: string) => Promise<string>;
  /** Copy the app into place; resolves with where it landed. */
  install: (app: string) => Promise<string>;
  /** Copy The Hive's app data into HiveTTY's, never over what is there. */
  carryOver: () => Promise<void>;
  /** Every `com.behiques.the-hive` bundle on this machine. */
  oldBundles: () => Promise<string[]>;
  trash: (path: string) => Promise<void>;
  /** Open `target` once this process has exited (the two share `~/.hive`). */
  handOff: (target: string) => void;
  quit: () => void;
  /** No session or agent run would be cut off by quitting. */
  isIdle: () => boolean;
  confirm: (options: {
    title: string;
    message: string;
    detail: string;
    confirmLabel: string;
  }) => Promise<boolean>;
  inform: (options: { message: string; detail: string }) => void;
  openExternal: (url: string) => void;
  log: (message: string) => void;
}

export interface Migration {
  /**
   * Look for HiveTTY and, when there is one, ask. Resolves true when it asked,
   * so the normal update check stands down; false lets that check run. Never
   * rejects.
   */
  check(origin: 'auto' | 'menu'): Promise<boolean>;
}

/** The top-level `version`, `path` and `sha512` of an electron-builder feed. */
export function parseFeed(text: string): HiveTtyRelease | null {
  const field = (name: string): string | undefined =>
    new RegExp(`^${name}:\\s*['"]?([^'"\\s]+)`, 'm').exec(text)?.[1];
  const version = field('version');
  const file = field('path');
  const sha512 = field('sha512');
  if (version === undefined || file === undefined || sha512 === undefined) return null;
  return { version, file, sha512 };
}

const teamOf = (signature: string): string | undefined =>
  /^TeamIdentifier=(\w+)$/m.exec(signature)?.[1];

/** Throws unless `signature` is HiveTTY's, signed by `team` with a Developer ID. */
function assertHiveTty(signature: string, team: string): void {
  if (!new RegExp(`^Identifier=${HIVETTY_BUNDLE_ID.replaceAll('.', '\\.')}$`, 'm').test(signature)) {
    throw new Error(`the app is not ${HIVETTY_BUNDLE_ID}`);
  }
  if (!/^Authority=Developer ID Application/m.test(signature)) {
    throw new Error('the app is not signed with a Developer ID');
  }
  if (teamOf(signature) !== team) {
    throw new Error(`the app is signed by team ${teamOf(signature) ?? 'none'}, not ${team}`);
  }
}

export function createMigration(deps: MigrationDeps): Migration {
  const { confirm, inform, log } = deps;
  /** A background "Later" holds until the next launch. */
  let asked = false;

  const releasePage = (version: string): string => `${HIVETTY_RELEASES_URL}/tag/v${version}`;

  const switchTo = async (target: string): Promise<void> => {
    const yes = await confirm({
      title: 'Switch to HiveTTY',
      message: 'HiveTTY is installed.',
      detail: `The Hive will quit, move itself to the Trash and open HiveTTY. Your projects, skills, agents, session history and appearance come with you; saved Jira, Slack and pairing credentials need entering once more.${
        deps.isIdle() ? '' : ' Sessions and agent runs that are still going will be stopped.'
      }`,
      confirmLabel: 'Switch now',
    });
    if (!yes) return;

    try {
      await deps.carryOver();
    } catch (cause) {
      // The old userData is kept, so nothing is lost; HiveTTY just starts fresh.
      log(`[hive] carrying app data over to HiveTTY failed: ${String(cause)}`);
    }
    deps.handOff(target);
    const bundles = new Set([deps.ownBundle, ...(await deps.oldBundles().catch(() => []))]);
    for (const bundle of bundles) {
      try {
        await deps.trash(bundle);
      } catch (cause) {
        log(`[hive] could not move ${bundle} to the Trash: ${String(cause)}`);
      }
    }
    deps.quit();
  };

  const installAndSwitch = async (release: HiveTtyRelease, team: string): Promise<void> => {
    try {
      const zip = await deps.download(
        `${HIVETTY_RELEASES_URL}/download/v${release.version}/${release.file}`,
      );
      if ((await deps.sha512(zip)) !== release.sha512) {
        throw new Error('the download does not match the checksum the release published');
      }
      const app = await deps.unpack(zip);
      assertHiveTty(await deps.verify(app), team);
      await switchTo(await deps.install(app));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      log(`[hive] HiveTTY ${release.version} was not installed: ${message}`);
      inform({ message: 'HiveTTY could not be installed.', detail: `${message}. The download page has it.` });
      deps.openExternal(releasePage(release.version));
    }
  };

  const check = async (origin: 'auto' | 'menu'): Promise<boolean> => {
    if (deps.identity !== 'The Hive' || deps.unattended) return false;
    if (origin === 'auto' && asked) return false;

    try {
      const team = teamOf(await deps.ownSignature().catch(() => ''));
      if (team === undefined) return false;

      const installed = await deps.installedApp();
      if (installed !== null) {
        assertHiveTty(await deps.verify(installed), team);
        asked = true;
        await switchTo(installed);
        return true;
      }

      const feed = await deps.fetchFeed();
      const release = feed === null ? null : parseFeed(feed);
      if (release === null || !release.file.startsWith('HiveTTY-')) return false;

      asked = true;
      const yes = await confirm({
        title: 'The Hive is now HiveTTY',
        message: `HiveTTY ${release.version} is available.`,
        detail:
          'The Hive has a new name and a new app. HiveTTY downloads in the background and installs beside The Hive; you choose when to switch.',
        confirmLabel: 'Install HiveTTY',
      });
      // Started, not awaited: the download is large, and the check lock must not wait on it.
      if (yes) void installAndSwitch(release, team);
      return true;
    } catch (cause) {
      log(`[hive] the HiveTTY check failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      return false;
    }
  };

  return { check };
}
