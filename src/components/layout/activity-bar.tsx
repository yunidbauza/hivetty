import {
  Gear,
  GitPullRequest,
  Hexagon,
  House,
  Kanban,
  Moon,
  Robot,
  Sun,
  type Icon,
} from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import { ConnectionItem } from '@components/layout/connection-item';
import { useResolvedTheme, useToggleTheme } from '@stores/appearance-store';
import { useCounts, usePrNeedsYouCount, useTabGone, useWorkingAgentCount } from '@stores/hive-store';
import {
  usePlace,
  useSelectPlace,
  useSessionsTab,
  useSettingsActions,
  type Place,
} from '@stores/ui-store';

const PLACES: readonly { id: Place; label: string; icon: Icon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'sessions', label: 'Sessions', icon: Hexagon },
  { id: 'work', label: 'Work', icon: Kanban },
  { id: 'agents', label: 'Agents', icon: Robot },
  { id: 'prs', label: 'PRs', icon: GitPullRequest },
];

const ITEM =
  'relative grid w-[52px] justify-items-center gap-[3px] rounded-lg pt-[7px] pb-[5px] text-micro font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

/**
 * Round two's activity bar (HIVE-195): the brand, the five places, Settings.
 *
 * Picking a place is the whole interaction; the ui-store's `selectPlace` owns
 * what a click on the active one means. The foot holds the connection item
 * (HIVE-196), the theme toggle (HIVE-213) and Settings; Search is left out until a story says what it
 * searches. The team name lives on Home's headline, not here.
 */
export function ActivityBar() {
  const place = usePlace();
  const selectPlace = useSelectPlace();
  const sessionGone = useTabGone(useSessionsTab());
  const { openSettings } = useSettingsActions();
  const prsNeedYou = usePrNeedsYouCount();
  const sessionsWorking = useCounts().working;
  const agentsWorking = useWorkingAgentCount();
  const resolvedTheme = useResolvedTheme();
  const toggleTheme = useToggleTheme();
  const themeLabel = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon;

  return (
    <nav
      aria-label="Places"
      className="flex w-[var(--cc-bar-w)] shrink-0 flex-col items-center gap-1 border-r border-border-soft bg-bg py-3"
    >
      {/* The dock icon's plates without its tile (`public/app-mark.png`, from the icon script); `BASE_URL` because the app is served from `./` under file://. */}
      <img
        src={`${import.meta.env.BASE_URL}app-mark.png`}
        alt="Hive TTY"
        width={28}
        height={28}
        className="mb-2.5 size-7"
      />

      {PLACES.map(({ id, label, icon: PlaceIcon }) => {
        const active = id === place;
        // Live counts in grey, needs-you in amber, never inventory (HIVE-196).
        const count = id === 'prs' ? prsNeedYou : id === 'sessions' ? sessionsWorking : id === 'agents' ? agentsWorking : 0;
        const needsYou = id === 'prs';
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={count > 0 ? `${label}, ${String(count)} ${needsYou ? 'need you' : 'working'}` : undefined}
            onClick={() => selectPlace(id, sessionGone)}
            className={cn(ITEM, active ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-hover')}
          >
            <PlaceIcon size={19} aria-hidden />
            {label}
            {/* PRs: needs you, amber count text (no token is ink on amber, R2). Sessions and Agents: working, grey (HIVE-196). */}
            {count > 0 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-0.5 right-1.5 rounded-lg bg-chip px-1 tabular-nums text-micro font-semibold',
                  needsYou ? 'text-amber-text' : 'text-muted',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}

      <span className="flex-1" />

      <ConnectionItem />

      <button
        type="button"
        aria-label={themeLabel}
        title={themeLabel}
        onClick={toggleTheme}
        className={cn(ITEM, 'text-muted hover:bg-hover')}
      >
        <ThemeIcon size={19} aria-hidden />
        Theme
      </button>

      <button
        type="button"
        onClick={() => openSettings()}
        className={cn(ITEM, 'text-muted hover:bg-hover')}
      >
        <Gear size={19} aria-hidden />
        Settings
      </button>
    </nav>
  );
}
