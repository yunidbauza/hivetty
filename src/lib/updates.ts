import type { UpdateStatus } from '@shared/update-contract';

/**
 * The renderer's door onto the updater.
 *
 * Same shape as `project-config.ts`: a bridge that may not exist (the browser
 * target has no main process at all), and a failure that answers `null` rather
 * than throwing into a render. The Settings pane treats `null` as "cannot ask",
 * which is a different sentence from "nothing to report" and is rendered as
 * one.
 */

export async function readUpdateStatus(): Promise<UpdateStatus | null> {
  const bridge = window.hive;
  if (!bridge) return null;

  try {
    return await bridge.updates.status();
  } catch (cause) {
    console.error('[hive] reading update status failed:', cause);
    return null;
  }
}

/**
 * Ask main to look now.
 *
 * Resolves when the check is done — including after the user has answered the
 * dialog main raised — so the caller can re-read the status and show the
 * outcome without polling.
 */
export async function checkForUpdates(): Promise<void> {
  const bridge = window.hive;
  if (!bridge) return;

  try {
    await bridge.updates.check();
  } catch (cause) {
    console.error('[hive] checking for updates failed:', cause);
  }
}
