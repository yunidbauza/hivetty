import { CaretDown } from '@phosphor-icons/react';

import type { ProjectRow } from '@/types/entity';

import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Icon } from '@components/ui/icon';
import { useProjectAccess, useProjectContainerised } from '@hooks/use-project-config';
import { useProjects, useSpawnTerminal } from '@stores/hive-store';

/**
 * The chevron half of the Overmind's New session button: a terminal in any
 * project, with no screen in between, because a terminal takes exactly one
 * input and a menu of projects is that input. Every project, in config order;
 * a long config scrolls inside the menu. (The Classic header had it, HIVE-213
 * took it with the header, and it comes back here.)
 *
 * The trigger's name is `Terminal in a project`: it does not begin with "new"
 * and is not an exact `New session`, so a locator that finds the button by name
 * keeps finding exactly one.
 */
export function TerminalMenu() {
  const projects = useProjects();
  const spawnTerminal = useSpawnTerminal();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The right half of the pill: its own seam on the left, the button's corners on the right. */}
        <Button
          variant="primary"
          aria-label="Terminal in a project"
          className="flex items-center self-stretch rounded-l-none border-l-brand-fill-strong pr-3 pl-2.5"
        >
          <CaretDown size={13} weight="bold" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60vh] min-w-52 overflow-y-auto">
        <DropdownMenuLabel className="text-ui-sm font-semibold tracking-[0.06em] text-subtle uppercase">
          New terminal in…
        </DropdownMenuLabel>
        {projects.map((project) => (
          <TerminalMenuItem key={project.id} project={project} onSelect={spawnTerminal} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Its own component because `useProjectAccess` is a hook and cannot run inside a `.map()` body. */
function TerminalMenuItem({ project, onSelect }: { project: ProjectRow; onSelect: (projectId: string) => void }) {
  const access = useProjectAccess(project.id);
  const containerised = useProjectContainerised(project.id);

  return (
    <DropdownMenuItem disabled={!access.spawnable} onSelect={() => onSelect(project.id)}>
      <Icon name={project.icon} size={13} className="text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{containerised ? `${project.name} · host` : project.name}</span>
        {/* Visible text, not a `title`: a disabled item has pointer-events off, so a tooltip would never show. */}
        {access.reason && <span className="block text-micro text-subtle">{access.reason}</span>}
      </span>
      <span className="text-micro text-subtle">{project.key}</span>
    </DropdownMenuItem>
  );
}
