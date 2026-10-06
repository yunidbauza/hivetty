import { Plus } from '@phosphor-icons/react';

import { Button } from '@components/ui/button';
import { SegmentedControl } from '@components/ui/segmented-control';
import { TerminalMenu } from '@features/orchestrator/components/terminal-menu';
import { useProjectAccess } from '@hooks/use-project-config';
import { useAgentsWorkingIn, useOvermindHeadCounts, useProjects, useSpawnSession } from '@stores/hive-store';
import {
  type TableFilter,
  useNewSessionDefaults,
  usePickerActions,
  useSessionsFilter,
  useSessionsProject,
  useSetSessionsFilter,
  useSetSessionsProject,
} from '@stores/ui-store';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'ended', label: 'Ended' },
] as const satisfies readonly { value: TableFilter; label: string }[];

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * The Overmind's page head (HIVE-197): what the table holds, its filter, and New
 * session. Round two only; the stage mounts it above the table pane.
 *
 * Unfiltered it counts the fleet and "+ New session" opens the picker; filtered
 * to a project it breadcrumbs back to the fleet, names the agents working there,
 * and starts a session in that project directly (spec, Decisions). Either way
 * the button's chevron opens a terminal in any project.
 */
export function OvermindHead() {
  const project = useSessionsProject();
  const setProject = useSetSessionsProject();
  const filter = useSessionsFilter();
  const setFilter = useSetSessionsFilter();
  const counts = useOvermindHeadCounts(project);
  const agents = useAgentsWorkingIn(project);
  const name = useProjects().find((row) => row.id === project)?.name ?? project;
  const { openPicker } = usePickerActions();

  const working =
    agents.length > 0 ? ` · ${agents.join(', ')} ${agents.length === 1 ? 'is' : 'are'} working here` : '';
  const line =
    project === null
      ? `${String(counts.live)} live across ${plural(counts.projects, 'project')} · ${String(counts.needs)} needs you · ${String(counts.ended)} ended`
      : `${String(counts.live)} live · ${String(counts.ended)} ended${working}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-soft px-7 pt-4 pb-3">
      <h1 className="flex items-baseline gap-1.5 text-[18px] font-semibold text-ink">
        {project === null ? (
          'Overmind'
        ) : (
          <>
            <button
              type="button"
              onClick={() => setProject(null)}
              className="text-ui-lg font-normal text-muted hover:text-ink"
            >
              Overmind
            </button>
            <span aria-hidden="true" className="text-ui-lg font-normal text-muted">
              ›
            </span>
            {name}
          </>
        )}
      </h1>
      <span className="min-w-0 truncate text-control text-muted">{line}</span>
      <span className="flex-1" />
      <SegmentedControl label="Show" options={FILTERS} value={filter} onChange={setFilter} />
      {/* One pill, two controls: New session as it was, and the chevron's terminal in any project. */}
      <div className="flex shrink-0 items-stretch">
        {project === null ? (
          <Button variant="primary" onClick={() => openPicker()} className="flex items-center gap-1.5 rounded-r-none">
            <Plus size={13} weight="bold" aria-hidden="true" />
            New session
          </Button>
        ) : (
          <NewSessionHere projectId={project} projectName={name ?? project} />
        )}
        <TerminalMenu />
      </div>
    </div>
  );
}

/** Starts one directly in the filtered project, as `NewSessionLink` does (spec, Decisions). */
function NewSessionHere({ projectId, projectName }: { projectId: string; projectName: string }) {
  const spawnSession = useSpawnSession();
  const { newModel, newEffort } = useNewSessionDefaults();
  const access = useProjectAccess(projectId);

  return (
    <Button
      variant="primary"
      onClick={() => spawnSession(projectId, '', newModel, newEffort)}
      disabled={!access.spawnable}
      title={access.reason ?? `Starts on ${newModel} · ${newEffort}`}
      className="flex items-center gap-1.5 rounded-r-none"
    >
      <Plus size={13} weight="bold" aria-hidden="true" />
      New session in {projectName}
    </Button>
  );
}
