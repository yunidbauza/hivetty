import { Terminal as TerminalGlyph } from '@phosphor-icons/react';

import { useProjectAccess, useProjectContainerised } from '@hooks/use-project-config';
import { useSpawnTerminal } from '@stores/hive-store';

interface NewTerminalLinkProps {
  /** What the spawn keys on. Never shown. */
  projectId: string;
  /** What the accessible name says. */
  projectName: string;
}

/**
 * Open a terminal in this project, from the tree (terminals).
 *
 * A terminal takes exactly one input, the project, and the row above already
 * names it — so there is nothing to ask and no picker.
 *
 * ## The accessible name does not begin with "new"
 *
 * Playwright matches names as a case-insensitive substring, and the header's
 * `New session` button already needs `exact: true` to be told from the tree's
 * session links. A second control whose name also began "new " would make
 * every existing locator worse before it made anything better. `Terminal in
 * <project>` contains the visible text, which is what Label in Name asks.
 *
 * ## `terminal · host` for a container project
 *
 * A container project's sessions run through `docker exec`, and everything
 * container-shaped hangs off `claudeCommand`; there is no shell command to run
 * in the container yet. So the terminal is host-only and says so — the trap is
 * adjacency, where an unlabelled terminal beside containerised sessions reads
 * as the container and lands on the Mac.
 */
export function NewTerminalLink({
  projectId,
  projectName,
}: NewTerminalLinkProps) {
  const access = useProjectAccess(projectId);
  const containerised = useProjectContainerised(projectId);
  const spawnTerminal = useSpawnTerminal();

  const title =
    access.reason ??
    (containerised
      ? 'Opens a shell on this Mac — this project’s sessions run in a container, and a container shell is not configured yet'
      : 'Opens a login shell at the project root');

  return (
    <button
      type="button"
      onClick={() => spawnTerminal(projectId)}
      /*
        The same gate the session link uses, and for the same reason: a project
        whose entry does not resolve has no directory to start a shell in. One
        path in, closed by `disabled` — a second check here would be a branch
        nothing can reach.
      */
      disabled={!access.spawnable}
      title={title}
      aria-label={`Terminal in ${projectName}`}
      className="flex items-center gap-1.5 rounded-lg py-[3px] pr-2.5 pl-2 text-left font-mono text-[11.5px] text-subtle hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-subtle"
    >
      <TerminalGlyph size={10} weight="bold" aria-hidden="true" className="shrink-0" />
      {containerised ? 'terminal · host' : 'terminal'}
    </button>
  );
}
