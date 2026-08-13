/**
 * What the app knows about its own newer self.
 *
 * Types and constants only — both processes import this, and the renderer
 * imports it type-only, so nothing in `electron-updater` can reach the bundle.
 *
 * ## Why "capability" is a first-class idea here
 *
 * On every other platform this file would be smaller. A packaged Windows or
 * Linux build downloads a newer version and installs it, and the only question
 * is whether the network answered.
 *
 * macOS asks a second question first. Electron's `autoUpdater` is Squirrel.Mac,
 * and Squirrel.Mac refuses to swap a bundle whose code signature it cannot read
 * and match. A build signed with a Developer ID satisfies it; a build signed
 * **ad-hoc** — which is what this app is, because no Developer ID exists to
 * sign it with — may or may not, and the honest answer is that it is not
 * knowable from the outside. Apple does not document the requirement Squirrel
 * checks against, and reports in the wild disagree.
 *
 * So the app carries two update paths and picks between them on evidence rather
 * than on hope: it *probes* what this bundle can do, it *attempts* the good path
 * when the probe says it is possible, and it *degrades* to the manual path — open
 * the release page, download the disk image — the moment an attempt proves the
 * probe optimistic. {@link UpdateCapability} is that judgement, and
 * {@link UpdateState} records which path a given update actually took.
 *
 * The alternative designs were both worse. Always self-installing produces an
 * app whose update button silently does nothing on the one platform it ships
 * for. Always sending the user to a web page throws away a working install on
 * every machine where the signature *is* good enough — including every future
 * build, if a Developer ID ever appears.
 */

/** Where a user goes when the app cannot update itself. */
export const RELEASES_URL = 'https://github.com/yunidbauza/the-hive/releases';

/** The release page for one specific version. */
export const releaseUrlFor = (version: string): string =>
  `${RELEASES_URL}/tag/v${version.replace(/^v/, '')}`;

/**
 * Why this build can or cannot replace itself in place.
 *
 * `reason` is always populated, including on the happy path, because it is
 * rendered in the Settings pane. A user who wonders why their app sends them to
 * a web page deserves the sentence, not a disabled button.
 */
export interface UpdateCapability {
  /**
   * Whether asking the server is meaningful at all.
   *
   * False for an unpackaged run: `electron-updater` refuses outright there, and
   * there is no bundle to replace even if it did. Separate from `mode` because
   * "cannot check" and "can check but cannot install" are different sentences
   * to show a user, and collapsing them produces the worst one for both.
   */
  canCheck: boolean;
  /**
   * `self-install` — download and swap the bundle, then relaunch.
   * `manual` — open the release page and let the user do it.
   */
  mode: 'self-install' | 'manual';
  /**
   * True when `mode` is `self-install` but the evidence is circumstantial —
   * an ad-hoc signature on macOS. The path is attempted; a failure downgrades
   * the capability to `manual` for the rest of the session rather than being
   * retried into the same wall.
   */
  unverified: boolean;
  /** One sentence, shown to the user. Never a stack trace. */
  reason: string;
}

/**
 * Where the app is in the update cycle.
 *
 * `unsupported` is distinct from `error`: it means this build was never going
 * to be able to check — a development run, most often — and saying "error"
 * about it would send someone looking for a fault that is not there.
 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'unsupported';

/** Everything a consumer needs to render the update surface. */
export interface UpdateStatus {
  state: UpdateState;
  /** What is running now. `app.getVersion()`. */
  currentVersion: string;
  /** What is on the server, when something newer exists. */
  availableVersion: string | null;
  /** 0–100 while `downloading`, otherwise null. */
  percent: number | null;
  capability: UpdateCapability;
  /** The page to send someone to for `availableVersion`, or the releases index. */
  releaseUrl: string;
  /** Populated only in `error`. One line, already made human. */
  error: string | null;
}

/** The status of a build that has not looked yet. */
export function idleUpdateStatus(
  currentVersion: string,
  capability: UpdateCapability,
): UpdateStatus {
  return {
    state: capability.canCheck ? 'idle' : 'unsupported',
    currentVersion,
    availableVersion: null,
    percent: null,
    capability,
    releaseUrl: RELEASES_URL,
    error: null,
  };
}

/**
 * How often a running app looks, in milliseconds.
 *
 * Six hours. The check is one HTTPS request for a small YAML file, so the cost
 * is not the concern — the concern is that an update is not urgent, and an app
 * that notices a release within a working day has noticed it soon enough. The
 * first check runs shortly after launch, which is when most people would think
 * to ask anyway.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * How long after launch the first check waits.
 *
 * Not zero. Launch is the busiest moment this process has — window creation,
 * config read, the pty host's first fork — and a network round trip racing all
 * of that buys nothing. Thirty seconds is invisible to a user and well clear of
 * the startup burst.
 */
export const UPDATE_FIRST_CHECK_DELAY_MS = 30_000;
