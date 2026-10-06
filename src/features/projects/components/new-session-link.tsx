import { Plus } from '@phosphor-icons/react';

import { useProjectAccess } from '@hooks/use-project-config';
import { useSpawnSession } from '@stores/hive-store';
import { useNewSessionDefaults } from '@stores/ui-store';

interface NewSessionLinkProps {
  /** What the spawn keys on. Never shown. */
  projectId: string;
  /**
   * What the accessible name says (HIVE-104).
   *
   * Both used to come from the id, which meant a screen-reader user heard the
   * old word after a rename — under a row that had been fixed to show the new
   * one. Two strings because they answer different questions: one identifies
   * the project to the app, the other to the person.
   */
  projectName: string;
}

/**
 * Start a session in this project, from the tree, without the picker.
 *
 * The header's "New session" button opens the picker so the user can choose a
 * project; here the project is already named by the row above, so the picker
 * would only ask a question the click already answered. This spawns straight
 * away on the current defaults.
 *
 * ## An icon on the project's own line
 *
 * A `+` that shows on hovering the project row, beside the terminal glyph —
 * no visible text, so the `aria-label` carries the whole name and names the
 * project too, for a screen-reader user who arrives without the row.
 *
 * Playwright matches accessible names as a case-insensitive substring, so
 * `New session` finds the header button and every link here. The fix belongs
 * in the queries, and `tests/e2e/electron/` passes `exact: true` where it
 * means the header.
 *
 * ## Why the disabled state carries no extra guard
 *
 * `new-session-picker.tsx` re-checks `can.spawnSessionIn` before spawning
 * because its search box spawns on Enter, which never touches a disabled
 * button. This link has one path in, and `disabled` closes it — a second check
 * here would be a branch nothing can reach.
 */
export function NewSessionLink({
  projectId,
  projectName,
}: NewSessionLinkProps) {
  const access = useProjectAccess(projectId);
  const spawnSession = useSpawnSession();
  const { newModel, newEffort } = useNewSessionDefaults();

  return (
    <button
      type="button"
      // Empty task, exactly as the picker passes: the session opens ready and
      // the first message gives it its job (story 043).
      onClick={() => spawnSession(projectId, '', newModel, newEffort)}
      disabled={!access.spawnable}
      /*
        The refusal when there is one; otherwise what the click is about to
        commit to.

        This control spends a choice the user cannot see from here — the
        picker's steppers are the source, and the picker is not open. Naming
        the pair costs a tooltip and removes the only thing the picker offered
        that this does not: sight of the model before you start on it.
      */
      title={access.reason ?? `Starts on ${newModel} · ${newEffort}`}
      aria-label={`New session in ${projectName}`}
      className="rounded-full p-1 text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
    >
      <Plus size={13} weight="bold" aria-hidden="true" />
    </button>
  );
}
