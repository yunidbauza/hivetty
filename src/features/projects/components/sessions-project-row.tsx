import { cn } from '@/lib/utils';
import type { ProjectRow as ProjectRowData } from '@/types/entity';
import { isTerminal } from '@/types/entity';

import { Icon } from '@components/ui/icon';
import { ProjectKey } from '@components/ui/project-key';
import { Tag } from '@components/ui/tag';
import { NewSessionLink } from '@features/projects/components/new-session-link';
import { NewTerminalLink } from '@features/projects/components/new-terminal-link';
import { SessionRow } from '@features/projects/components/session-row';
import { TerminalRow } from '@features/projects/components/terminal-row';
import { useProjectAccess } from '@hooks/use-project-config';
import { useEntity, useProjectCounts, useProjectSessions } from '@stores/hive-store';
import {
  useProjectExpanded,
  useSessionsProject,
  useSetSessionsProject,
  useSettingsActions,
  useToggleProjectFold,
} from '@stores/ui-store';

/** One entry under the project, by kind — `ProjectRow`'s rule, one line per session. */
function Entry({ id }: { id: string }) {
  const entity = useEntity(id);
  if (!entity) return null;
  return isTerminal(entity) ? <TerminalRow id={id} /> : <SessionRow id={id} compact />;
}

/**
 * One project in round two's Sessions panel (HIVE-197): folded by default, the
 * name filters the Overmind, the caret only folds.
 */
export function SessionsProjectRow({ project }: { project: ProjectRowData }) {
  const ids = useProjectSessions(project.id);
  const { needs, other } = useProjectCounts(project.id);
  const expanded = useProjectExpanded(project.id);
  const toggleFold = useToggleProjectFold();
  const filter = useSessionsProject();
  const setFilter = useSetSessionsProject();
  const access = useProjectAccess(project.id);
  const { openSettings } = useSettingsActions();
  const selected = filter === project.id;
  // Folded, the icon carries what is inside: amber for needs-you, else green for live.
  const badge = expanded
    ? null
    : needs > 0
      ? { n: needs, fill: 'bg-amber', label: 'need you' }
      : other > 0
        ? { n: other, fill: 'bg-green', label: 'live' }
        : null;

  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          // While the actions show, the row makes room for them (two 21px buttons, 6px in), so the name ellipsizes instead of running under them.
          'group relative flex items-center gap-1 rounded-lg pr-2.5 hover:pr-14 has-[:focus-visible]:pr-14',
          selected ? 'bg-active' : 'hover:bg-hover',
        )}
      >
        <button
          type="button"
          onClick={() => toggleFold(project.id)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Fold' : 'Unfold'} ${project.name}`}
          className="shrink-0 rounded-full px-1.5 py-[var(--cc-row-py)] text-subtle hover:text-ink"
        >
          <Icon name={expanded ? 'ph-caret-down' : 'ph-caret-right'} size={11} />
        </button>
        <button
          type="button"
          onClick={() => setFilter(project.id)}
          aria-current={selected ? 'true' : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 py-[var(--cc-row-py)] text-left"
        >
          <span className="relative mr-1 shrink-0">
            <Icon name={project.icon} size={15} className="text-brand" />
            {/* Folded, the icon carries what is inside: amber for needs-you, else green for live. */}
            {badge ? <LiveBadge {...badge} /> : null}
          </span>
          {/* Hidden from the name, so the button still announces the project first. */}
          <span aria-hidden="true" className="flex shrink-0">
            <ProjectKey value={project.key} />
          </span>
          <span className="flex-1 truncate text-ui font-semibold text-brand">
            {project.name}
            {/* After the name, so the button still announces the project first. */}
            {badge ? <span className="sr-only">{`, ${String(badge.n)} ${badge.label}`}</span> : null}
          </span>
          {/* Gives way to the actions on hover or keyboard focus (focus-visible, so a mouse click does not pin them). */}
          <span className="flex shrink-0 items-center gap-2 group-has-[:focus-visible]:invisible group-hover:invisible">
            {access.reason ? (
              <Tag tone={access.invalid ? 'amber' : 'subtle'} title={access.reason} className="shrink-0">
                unmapped
              </Tag>
            ) : null}
          </span>
        </button>
        {/*
          Siblings of the name, never inside it. Opacity rather than visibility,
          so they stay focusable and in the tab order while hidden.
        */}
        <span className="absolute right-1.5 flex items-center gap-0.5 opacity-0 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100">
          <NewSessionLink projectId={project.id} projectName={project.name} />
          <NewTerminalLink projectId={project.id} projectName={project.name} />
        </span>
      </div>
      {/* The way out of "unmapped", once the row is the filter (HIVE-218); a sibling, never inside the row's buttons. */}
      {selected && access.reason ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-2.5 pb-1.5 pl-[30px] text-ui-sm text-muted">
          <span className="min-w-0 break-words">{access.reason}</span>
          <button
            type="button"
            onClick={() => openSettings('projects')}
            className="text-brand underline underline-offset-2 hover:text-ink"
          >
            {access.invalid ? 'Fix it in Settings' : 'Map it in Settings'}
          </button>
        </div>
      ) : null}
      {expanded ? ids.map((id) => <Entry key={id} id={id} />) : null}
    </div>
  );
}

/** A count over the project icon. Decoration: the name's sr-only text says it. */
function LiveBadge({ n, fill, label }: { n: number; fill: string; label: string }) {
  return (
    <span
      aria-hidden="true"
      title={`${String(n)} ${label}`}
      className={cn(
        'absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-micro leading-none font-bold text-panel ring-2 ring-panel',
        fill,
      )}
    >
      {n}
    </span>
  );
}
