import { Eye } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';

import { EmptyState, EmptyStatePath } from '@components/ui/empty-state';
import { NewProjectLink } from '@features/projects/components/new-project-link';
import { SessionsProjectRow } from '@features/projects/components/sessions-project-row';
import { useProjects, useSessionsHeadCounts } from '@stores/hive-store';
import { useSessionsProject, useSetSessionsProject } from '@stores/ui-store';

/**
 * Round two's Sessions list panel (HIVE-197): always the projects, folded, with
 * "All projects" on top to widen the Overmind again.
 */
export function SessionsPanel() {
  const projects = useProjects();
  const { live, needs } = useSessionsHeadCounts();
  const filter = useSessionsProject();
  const setFilter = useSetSessionsProject();

  // No projects yet: say so, and offer the picker.
  if (projects.length === 0) {
    return (
      <div data-panel="sessions">
        <EmptyState
          phrase="empty.projects"
          creature="overlord"
          control={<NewProjectLink variant="cta" />}
          action={
            <>
              Or clone one in <EmptyStatePath>Settings → Projects</EmptyStatePath>.
            </>
          }
        />
      </div>
    );
  }

  return (
    <div data-panel="sessions" className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2.5 px-2 pt-1 pb-2">
        <h2 className="text-ui-lg font-semibold text-ink">Projects</h2>
        <span className="text-ui-sm text-muted">
          <span className="text-green">{live} live</span> ·{' '}
          <span className="text-amber-text">{needs} needs you</span>
        </span>
        <NewProjectLink />
      </div>
      <button
        type="button"
        onClick={() => setFilter(null)}
        aria-current={filter === null ? 'true' : undefined}
        className={cn(
          'mb-1.5 flex items-center gap-2 rounded-lg border-b border-border-soft px-2.5 py-[var(--cc-row-py)] text-left',
          filter === null ? 'bg-active' : 'hover:bg-hover',
        )}
      >
        <Eye size={15} aria-hidden="true" className="shrink-0 text-brand" />
        <span className="flex-1 text-ui font-medium text-ink">All projects</span>
        <span className="text-ui-sm text-muted">{live}</span>
      </button>
      {projects.map((project) => (
        <SessionsProjectRow key={project.id} project={project} />
      ))}
    </div>
  );
}
