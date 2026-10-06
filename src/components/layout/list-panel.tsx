import { useEffect, useRef, type ComponentType, type RefObject } from 'react';

import { cn } from '@/lib/utils';

import { RailHandle } from '@components/layout/rail-handle';
import { AgentsPanel } from '@features/agents/components/agents-panel';
import { SessionsPanel } from '@features/projects/components/sessions-panel';
import { PrsPanel } from '@features/pull-requests/components/prs-panel';
import { WorkPanel } from '@features/work/components/work-panel';
import { PANEL_WIDTHS, useListPanelWidth, useSetListPanelWidth } from '@stores/appearance-store';
import {
  useAgentsListed,
  usePrsListed,
  usePrsQuiet,
  useSessionsListed,
  useWorkListed,
} from '@stores/hive-store';
import {
  useNarrow,
  usePanelOpen,
  usePlace,
  usePrSearchOpen,
  useTogglePanel,
  type Place,
} from '@stores/ui-store';

/**
 * Each place's panel (HIVE-195). Home has none. Sessions has its own since
 * HIVE-197, Work its grouped rows since HIVE-203, Agents since HIVE-204, and
 * PRs is the Hatchery since HIVE-205.
 */
const PANELS: Record<Place, ComponentType | null> = {
  home: null,
  sessions: SessionsPanel,
  work: WorkPanel,
  agents: AgentsPanel,
  prs: PrsPanel,
};

const LABELS: Record<Place, string> = {
  home: 'Home',
  sessions: 'Sessions',
  work: 'Work',
  agents: 'Agents',
  prs: 'PRs',
};

/**
 * Round two's one list panel: `--cc-list-w` wide, beside the stage, never
 * instead of it. Its seam drags the width; no collapsed strip — closing is
 * `panelOpen`.
 *
 * No list without items (HIVE-211): a place with nothing to list draws no
 * panel, and its stage says why — Jira not connected, gh signed out, no agent,
 * no project. Loading keeps the panel, for its skeleton.
 *
 * Under 1,200px (HIVE-211) it overlays the stage instead of taking a column:
 * at the bar's edge, over a veil, and a click on the veil or Escape closes it.
 */
export function ListPanel({ rowRef }: { rowRef: RefObject<HTMLElement | null> }) {
  const place = usePlace();
  const panelOpen = usePanelOpen();
  const Panel = PANELS[place];
  const prsQuiet = usePrsQuiet();
  const searchOpen = usePrSearchOpen();
  /* Every hook runs on every render, so all four are read rather than one indexed by place. */
  const listed: Record<Place, boolean> = {
    home: false,
    sessions: useSessionsListed(),
    work: useWorkListed(),
    agents: useAgentsListed(),
    prs: usePrsListed(),
  };

  /* Was the Hatchery quiet on the last render? Only that change slides the panel in (R4), never a mount. */
  const wasQuiet = useRef(prsQuiet);
  const arriving = place === 'prs' && wasQuiet.current && !prsQuiet;
  useEffect(() => {
    wasQuiet.current = prsQuiet;
  });

  const narrow = useNarrow();
  const togglePanel = useTogglePanel();
  const width = useListPanelWidth();
  const setWidth = useSetListPanelWidth();
  useEffect(() => {
    if (!narrow || !panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') togglePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, panelOpen, togglePanel]);

  if (!Panel || !panelOpen) return null;
  /* A quiet or unconfigured Hatchery's search still opens it (D15); the stage has the egg otherwise. */
  if (!listed[place] && !(place === 'prs' && searchOpen)) return null;

  const panel = (
    <section
      aria-label={`${LABELS[place]} list`}
      style={{ minWidth: PANEL_WIDTHS.list.min }}
      className={cn(
        'flex w-[var(--cc-list-w)] shrink flex-col border-r border-border-soft bg-panel px-2.5 pt-3.5 pb-5 font-sans',
        narrow && 'absolute inset-y-0 left-[var(--cc-bar-w)] z-30 shadow-lg',
        arriving && 'motion-safe:animate-ccslidein',
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Panel />
      </div>
    </section>
  );
  if (!narrow) {
    return (
      <>
        {panel}
        <RailHandle rowRef={rowRef} rail="list" label="Resize the list panel" width={width} onWidth={setWidth} />
      </>
    );
  }

  return (
    <>
      {/* The rest of the row, not the bar: its icons still switch place with the overlay up. */}
      <div
        data-testid="list-veil"
        aria-hidden
        onClick={togglePanel}
        className="absolute inset-y-0 right-0 left-[var(--cc-bar-w)] z-20 bg-scrim"
      />
      {panel}
    </>
  );
}
