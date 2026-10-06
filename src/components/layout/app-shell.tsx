import { useEffect, useRef, type CSSProperties } from 'react';

import { ActivityBar } from '@components/layout/activity-bar';
import { CenterStage } from '@components/layout/center-stage';
import { ListPanel } from '@components/layout/list-panel';
import { SessionPanel } from '@components/layout/session-panel';
import { TitleBar } from '@components/layout/title-bar';
import { useProjectWatcher } from '@features/explorer/hooks/use-project-watcher';
import { useSessionStatus } from '@features/sessions/hooks/use-session-status';
import { useNotificationActivate } from '@features/settings/hooks/use-notification-activate';
import { useAgentsSync } from '@features/shared/hooks/use-agents-sync';
import { useLedgerSync } from '@features/shared/hooks/use-ledger-sync';
import { WhatsNew } from '@features/whats-new/components/whats-new';
import { useAppChords } from '@hooks/use-app-chords';
import { useAwayTracker } from '@hooks/use-away-since';
import { useDockBadge } from '@hooks/use-dock-badge';
import { useForegroundSession } from '@hooks/use-foreground-session';
import { useNarrowWindow } from '@hooks/use-narrow-window';
import { useNotificationStream } from '@hooks/use-notification-stream';
import { useRemoteLinkStream } from '@hooks/use-remote-link';
import { useSessionNames } from '@hooks/use-session-names';
import { useListPanelWidth, useSessionPanelWidth, watchSystemTheme } from '@stores/appearance-store';
import { useSetNarrow } from '@stores/ui-store';

/**
 * The command-center frame (HIVE-195): the activity bar, one list panel, the
 * stage and the session panel, in a single row under the macOS drag strip.
 * Nothing here scrolls; each region owns its scrollbar.
 *
 * Two `min-*: 0` overrides carry the whole layout:
 *
 * - `min-h-0` on the row, because a flex item's default `min-height: auto`
 *   refuses to shrink below its content and would push the panels past the
 *   viewport instead of scrolling them.
 * - `min-w-0` on the center stage, for the same reason on the inline axis. Skip
 *   it and a long unbroken terminal line widens the column, which xterm's fit
 *   addon then measures and grows into — the classic flexbox overflow trap the
 *   story calls out.
 */
export function AppShell() {
  /**
   * One subscription for every real session's status (story 096).
   *
   * Here rather than per session: `session:status` is a single broadcast
   * channel, so a per-session hook would mean thirteen listeners racing to
   * ignore twelve messages each.
   */
  useSessionStatus();

  /**
   * Keep the renderer's ledger mirror current (HIVE-111).
   *
   * Here for the same reason as the status subscription above: `ledger:changed`
   * is a single broadcast channel, and a per-consumer subscription would mean
   * one listener per card for one channel.
   */
  useLedgerSync();

  /**
   * Keep the fleet's agents in step with `~/.hive/agents` (HIVE-114).
   *
   * One broadcast channel again, and here rather than in the Settings pane
   * because the list panel lists agents whether or not Settings has ever been
   * opened — the same argument `useNotificationStream` makes below.
   */
  useAgentsSync();

  /**
   * Open the session a clicked OS notification was about (story 106).
   *
   * Here for the same reason as above — one broadcast channel, one listener —
   * and at the composition root because the tab it opens can be any of them.
   */
  useNotificationActivate();
  /*
    The inbox's feed (HIVE-75). Mounted here rather than in the panel: the
    pill's count has to be right whether or not the drawer has ever been
    opened, and a subscription that only exists while the panel is mounted
    would leave the count at zero until someone looked.
  */
  useNotificationStream();
  /*
    This machine's dock badge, from the rows the stream above fills (HIVE-159).
    Only heard while attached; in local mode the hub badges from its own buffer.
  */
  useDockBadge();

  /*
    What this window's attachment is doing (HIVE-150). Mounted here for the
    reason above it: the connection item and the attach pane both read it, and
    a subscription that only lived while Settings was open would leave the item
    claiming an attachment for as long as nobody went looking.
  */
  useRemoteLinkStream();

  /*
    Which terminal is on the stage (HIVE-81). Here for the same reason as the
    three above — one fact about the whole shell, one publisher — and here
    rather than in `center-stage` because the stage re-renders for reasons that
    have nothing to do with which tab is open, and this should not.
  */
  useForegroundSession();

  /*
    What each session is called (HIVE-110). The mirror of the report above, for
    the same reason: main presents the desktop toasts and the name it used to
    read — the raw terminal title — was never the one in the list. Mounted
    beside it because both are facts about the fleet rather than about any
    component.
  */
  useSessionNames();

  /**
   * Watch the visible project's files.
   *
   * Here, not in the explorer panel, because the panel is not the only
   * consumer: an open editor buffer reconciles against the same events and
   * outlives the session panel's Files tab. Same reasoning as the two
   * subscriptions above — one broadcast channel, one listener, at the
   * composition root.
   */
  useProjectWatcher();

  /**
   * The panel chords (this story).
   *
   * At the composition root for the same reason as the four above: one fact
   * about the whole shell, one listener. Per-panel would mean two listeners
   * racing to ignore each other's chord.
   */
  useAppChords();
  // Home's "since" (HIVE-200).
  useAwayTracker();

  // Under 1,200px the list panel overlays the stage (HIVE-211); the row-pick actions read this.
  const narrow = useNarrowWindow();
  const setNarrow = useSetNarrow();
  useEffect(() => setNarrow(narrow), [narrow, setNarrow]);

  /**
   * Follow the OS while the app is open (story 105).
   *
   * The store already read `prefers-color-scheme` once, synchronously, when it
   * was constructed — that is what paints the right theme on the first frame.
   * This subscribes to *changes*, which is a different thing and needs a
   * lifetime to be torn down with. One listener for the app, alongside the one
   * session-status subscription, for the same reason.
   */
  useEffect(() => watchSystemTheme(), []);

  // The rails' dragged widths, as the tokens they already size by; the row is what their seams measure against.
  const rowRef = useRef<HTMLDivElement>(null);
  const listWidth = useListPanelWidth();
  const sessionWidth = useSessionPanelWidth();
  const widths = {
    '--cc-list-w': `${String(listWidth)}px`,
    '--cc-session-panel-w': `${String(sessionWidth)}px`,
  } as CSSProperties;

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      {/* The window-controls row; renders nothing off macOS and in the browser. */}
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        <ActivityBar />
        {/* Not `relative`: the narrow list overlay still positions against the row above. */}
        <div ref={rowRef} className="flex min-w-0 flex-1" style={widths}>
          <ListPanel rowRef={rowRef} />
          <CenterStage />
          <SessionPanel rowRef={rowRef} />
        </div>
      </div>
      {/* Portalled; draws nothing until a release's card is due or Settings asks for it (1.0). */}
      <WhatsNew />
    </div>
  );
}
