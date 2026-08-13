import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { app } from 'electron';

import type { UpdateCapability } from '@shared/update-contract';

/**
 * Can this bundle replace itself?
 *
 * The answer decides whether the Inbox row installs an update or sends the user
 * to a download page, so it is worth getting from evidence rather than from an
 * assumption compiled in at build time.
 *
 * ## What is actually being asked
 *
 * Electron's macOS `autoUpdater` is Squirrel.Mac, and Squirrel.Mac will not swap
 * a bundle it cannot verify. The check it performs is a code-signature check,
 * and it fails *late* — after the download, at the moment of the swap — with an
 * error that reads like a network fault. An app that cannot tell the difference
 * would burn a hundred megabytes and then tell the user to check their
 * connection.
 *
 * So the signature is read up front, with `codesign`, and three outcomes are
 * distinguished where a boolean would flatten them into one:
 *
 * | What `codesign` says | Verdict | Why |
 * | --- | --- | --- |
 * | `Authority=Developer ID Application: …` | self-install, verified | The case Squirrel was designed for. |
 * | `Signature=adhoc` | self-install, **unverified** | Might work. Attempted, and demoted on failure. |
 * | not signed / command failed | manual | Squirrel has nothing to check. Do not waste the download. |
 *
 * ## Why ad-hoc gets attempted rather than refused
 *
 * This build is ad-hoc signed and will be for as long as there is no Apple
 * Developer ID to sign it with — arm64 macOS refuses to *launch* an unsigned
 * binary at all, so `-` is the floor, not a choice. Whether Squirrel accepts
 * that floor is genuinely disputed, and the only instrument that settles it is
 * an actual update on an actual machine.
 *
 * Refusing pre-emptively would mean the app never finds out, and would keep
 * sending users to a web page on some future day when the signature *is* good.
 * Attempting-and-demoting costs one failed swap, once, and then behaves
 * correctly for the rest of the session — and it records the reason, so the
 * Settings pane can say what happened instead of leaving a mystery.
 */

const run = promisify(execFile);

/** Everything the probe touches, injected so a test needs no bundle. */
export interface CapabilityProbeDeps {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** The `.app` bundle, or whatever `codesign` should be pointed at. */
  bundlePath: string;
  /** Answers with `codesign`'s combined output, or throws if it failed. */
  codesign: (bundlePath: string) => Promise<string>;
}

/**
 * `codesign` writes its report to **stderr**, not stdout.
 *
 * A detail worth pinning down in code rather than rediscovering: reading
 * `stdout` here returns the empty string for a perfectly well-signed bundle,
 * and the probe would conclude "unsigned" about every app it was ever pointed
 * at. Both streams are concatenated so the parse cannot care.
 */
async function readSignature(bundlePath: string): Promise<string> {
  const { stdout, stderr } = await run('codesign', [
    '--display',
    '--verbose=2',
    bundlePath,
  ]);
  return `${stdout}\n${stderr}`;
}

export function defaultProbeDeps(): CapabilityProbeDeps {
  return {
    packaged: app.isPackaged,
    platform: process.platform,
    /**
     * Up three levels from the executable.
     *
     * `app.getPath('exe')` inside a packaged mac app is
     * `…/The Hive.app/Contents/MacOS/The Hive`, and `codesign` must be handed
     * the `.app`, not the Mach-O inside it — pointed at the executable it
     * reports on that file's own signature, which is not the thing Squirrel
     * validates.
     */
    bundlePath: path.resolve(app.getPath('exe'), '..', '..', '..'),
    codesign: readSignature,
  };
}

export async function probeUpdateCapability(
  deps: CapabilityProbeDeps = defaultProbeDeps(),
): Promise<UpdateCapability> {
  if (!deps.packaged) {
    return {
      canCheck: false,
      mode: 'manual',
      unverified: false,
      reason:
        'This is a development run. Only an installed copy of the app can update itself.',
    };
  }

  if (deps.platform !== 'darwin') {
    return {
      canCheck: true,
      mode: 'self-install',
      unverified: false,
      reason: 'Updates install themselves and the app restarts.',
    };
  }

  let signature: string;
  try {
    signature = await deps.codesign(deps.bundlePath);
  } catch (cause) {
    /**
     * A failed `codesign` is not an app error, and must not be raised as one.
     *
     * The command is absent on a machine without the Command Line Tools, and it
     * exits non-zero for an unsigned bundle. Both mean the same thing for this
     * decision — nothing here can be verified — and neither is worth an error
     * dialog. The manual path still works perfectly.
     */
    return {
      canCheck: true,
      mode: 'manual',
      unverified: false,
      reason: `This copy has no readable code signature, so macOS will not let it replace itself. Updates open the download page instead (${String(cause)
        .split('\n')[0]
        .trim()}).`,
    };
  }

  if (/Authority=Developer ID Application/.test(signature)) {
    return {
      canCheck: true,
      mode: 'self-install',
      unverified: false,
      reason: 'Signed with a Developer ID. Updates install themselves.',
    };
  }

  if (/Signature=adhoc/.test(signature)) {
    return {
      canCheck: true,
      mode: 'self-install',
      unverified: true,
      reason:
        'This copy is ad-hoc signed rather than signed with an Apple Developer ID. Installing an update in place is attempted, and falls back to the download page if macOS refuses it.',
    };
  }

  return {
    canCheck: true,
    mode: 'manual',
    unverified: false,
    reason:
      'This copy is not code signed, so macOS will not let it replace itself. Updates open the download page instead.',
  };
}

/**
 * The demotion, applied after an attempt proved the probe optimistic.
 *
 * Kept here rather than inline in the updater so that "what an ad-hoc signature
 * turned out to be worth" is decided in exactly one file. The resulting
 * capability is `manual` and no longer `unverified` — the uncertainty is gone,
 * it has been resolved to a no.
 */
export function demoteToManual(
  capability: UpdateCapability,
  cause: string,
): UpdateCapability {
  return {
    canCheck: capability.canCheck,
    mode: 'manual',
    unverified: false,
    reason: `macOS refused to install the update in place, so updates now open the download page (${cause}).`,
  };
}
