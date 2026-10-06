import { useEffect } from 'react';

import { useOnStage } from '@/hooks/use-on-stage';

import { useReattachEpoch } from '@stores/hive-store';

/**
 * Tell main which session's terminal is on the centre stage (HIVE-81).
 *
 * The renderer half of the foreground gate. Main owns window focus and owns the
 * notification hub, but has no idea what the window is *showing* — `activeTab`
 * and `resolveView` are renderer state, and there was no channel carrying them.
 * Without this, the app raises a toast, a dock bounce and an unread badge about
 * the session whose terminal the user is watching answer the question.
 *
 * What is on stage is `useOnStage` (HIVE-214): this publishes it, and the
 * Inbox (HIVE-198) reads the same answer.
 *
 * Mounted once at the composition root, like `useSessionStatus` and
 * `useNotificationStream`. The payload is a property of the stage, not of any
 * component, and there is exactly one stage.
 */
export function useForegroundSession(): void {
  const terminalId = useOnStage();

  /*
    Re-announced on every reattach (HIVE-150).

    This record is per *surface* on the machine that answers it, and a
    reconnect is a new surface: ids are minted from a `WeakMap` on the socket
    object, so the server gives the returning client a fresh one and released
    the old one's foreground entry when its socket went away. Nothing here
    would ever say it again — `terminalId` has not changed, and the renderer
    never unmounted — so notification suppression would silently target a
    session nobody is watching, and toast for the one on screen.
  */
  const reattachEpoch = useReattachEpoch();

  useEffect(() => {
    // No bridge is the browser demo, where there is no main process to tell.
    window.hive?.ui.reportForeground(terminalId);
  }, [terminalId, reattachEpoch]);
}
