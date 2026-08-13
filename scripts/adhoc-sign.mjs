import { execFileSync } from 'node:child_process';

/**
 * Give the packaged bundle a real ad-hoc signature (electron-builder `afterPack`).
 *
 * ## What is wrong without it
 *
 * `mac.identity: null` tells electron-builder not to look for a Developer ID,
 * and it then does not sign at all. What is left is the signature Electron's own
 * executable already carried — and reading it back is instructive:
 *
 *     Identifier=Electron
 *     Signature=adhoc, linker-signed
 *     Sealed Resources=none
 *
 * Three problems in three lines. The bundle identifies itself as *Electron*
 * rather than as this app. `linker-signed` is the minimal signature the linker
 * emits so Apple Silicon will consent to execute the file at all — it covers the
 * Mach-O, nothing else. And `Sealed Resources=none` means the `.app` around it
 * is not covered by any signature, so the bundle has no integrity at all: the
 * Info.plist, the framework, the asar and the unpacked `node-pty` are all
 * outside it.
 *
 * That is not a signed app; it is an unsigned app containing one signed file.
 * Gatekeeper treats it as such, TCC has no stable identity to attach a
 * permission grant to, and `codesign --verify` fails on the bundle.
 *
 * ## What this does and does not buy
 *
 * `codesign --force --deep --sign -` produces a genuine ad-hoc *bundle*
 * signature: sealed resources, the identifier from `CFBundleIdentifier`, and a
 * bundle that verifies. That is worth having on its own.
 *
 * It does **not** make the app self-updating, and it is important not to imply
 * otherwise. Squirrel.Mac verifies an update against the running app's
 * *designated requirement*, and for an ad-hoc signature the designated
 * requirement is its `cdhash` — a hash of that exact build. Version 0.1.1 has a
 * different cdhash from 0.1.0 by construction, so it cannot satisfy 0.1.0's
 * requirement, and no amount of correct ad-hoc signing changes that. Only a
 * certificate-based identity produces a requirement that survives a rebuild.
 *
 * The app knows this and routes around it: `electron/main/updates/capability.ts`
 * probes the signature, attempts the swap anyway when it might work, and
 * degrades to the download page the moment macOS refuses. See
 * `docs/packaging-and-updates.md`.
 */
export default async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;

  /**
   * `--deep` is deprecated for distribution signing and correct here.
   *
   * Apple's objection to it is that it applies *one* set of options to nested
   * code that often needs different entitlements per component. With an ad-hoc
   * identity and no entitlements there is nothing to get wrong, and the
   * alternative — walking the framework, the three helper apps and the
   * unpacked native module by hand — would be a list that goes stale the next
   * time Electron changes its bundle layout.
   */
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit',
  });

  // Verified immediately, because a signature that did not take is invisible
  // until something else refuses the app for a reason that names neither.
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], {
    stdio: 'inherit',
  });

  console.log(`  • ad-hoc signed and verified  ${app}`);
}
