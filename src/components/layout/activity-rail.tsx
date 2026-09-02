import { Files, GitPullRequest, Tray } from '@phosphor-icons/react';
import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';

import { TabBar, tabId, type Tab } from '@components/ui/tab-bar';
import { ExplorerPanel } from '@features/explorer/components/explorer-panel';
import { InboxPanel } from '@features/inbox/components/inbox-panel';
import { PrsPanel } from '@features/pull-requests/components/prs-panel';
import {
  useRailWidthState,
  useSetRailCollapsed,
  useToggleRailCollapsed,
} from '@stores/appearance-store';
import { useUnreadCount } from '@stores/hive-store';
import { useRailState, useSetRailTab, type RailTab } from '@stores/ui-store';

/**
 * Activity rail — the attention queue: what agents need, what is shippable,
 * and what the orchestrator has been doing.
 *
 * Its width is `--cc-rail-w-right` (story 105) and it is the only region the
 * shell can *unmount* — `showActivityRail` in the ui-store. Both rails can now
 * **collapse** to a 44px icon strip, which is a different thing: a collapsed
 * rail is still mounted and still shows its tabs. See `lib/rail-width.ts`.
 *
 * This file is part of `components/layout/`, the composition root — the one
 * place chrome may import feature slices (AGENTS.md → Import zones). The three
 * panels are mounted directly rather than threaded in as slots from `app.tsx`,
 * which would move the whole app's wiring into one untestable module.
 *
 * **Scroll position resets on tab switch**, which story 050 asks us to choose
 * explicitly. Preserving it per panel means either keeping all three mounted or
 * mirroring `scrollTop` into the ui-store; for three short lists neither earns
 * the complexity, and a stale offset on a list the simulation just prepended to
 * is worse than starting at the top.
 */
const PANELS: Record<RailTab, ComponentType> = {
  inbox: InboxPanel,
  prs: PrsPanel,
  explorer: ExplorerPanel,
};

export function ActivityRail() {
  const { railTab } = useRailState();
  const setRailTab = useSetRailTab();
  const unread = useUnreadCount();
  const { railCollapsedRight } = useRailWidthState();
  const setRailCollapsed = useSetRailCollapsed();
  const toggleRailCollapsed = useToggleRailCollapsed();

  const tabs: Tab<RailTab>[] = [
    {
      id: 'inbox',
      label: 'Inbox',
      /**
       * `Tray`, not `Bell`: the header already has a bell for this same
       * destination, and two glyphs for one place is worse than one glyph in
       * two places.
       */
      icon: Tray,
      badgeCount: unread,
      badgeLabel: 'unread notifications',
      /**
       * Red, not the left rail's neutral chip. The work count is an inventory;
       * this one means the user is the thing an agent is blocked on.
       */
      badgeTone: 'danger',
    },
    { id: 'prs', label: 'PRs', icon: GitPullRequest },
    { id: 'explorer', label: 'Explorer', icon: Files },
  ];

  const Panel = PANELS[railTab];

  return (
    <aside
      aria-label="Activity"
      className={cn(
        'flex w-[var(--cc-rail-w-right)] shrink-0 flex-col gap-[var(--cc-rail-gap)] border-l border-border-soft bg-panel pt-3.5 pb-5',
        railCollapsedRight ? 'px-1.5' : 'px-3.5',
      )}
    >
      <TabBar
        tabs={tabs}
        active={railTab}
        /*
          Selecting from the strip must expand. The rail is 44px wide; a
          click that only moved the highlight would look like nothing
          happened.
        */
        onSelect={(tab) => {
          setRailTab(tab);
          if (railCollapsedRight) setRailCollapsed('right', false);
        }}
        onActiveSelect={() => toggleRailCollapsed('right')}
        orientation={railCollapsedRight ? 'strip' : 'horizontal'}
        // The right edge of the screen: a strip tooltip opens leftward, into
        // the window, rather than off the right edge.
        tooltipSide="left"
        label="Activity sections"
        className="shrink-0"
      />

      {railCollapsedRight ? null : (
        <div
          role="tabpanel"
          aria-labelledby={tabId(railTab)}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <Panel />
        </div>
      )}
    </aside>
  );
}
