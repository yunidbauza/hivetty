import { Plus } from '@phosphor-icons/react';

import { Button } from '@components/ui/button';
import { DirectoryPicker } from '@features/shared/components/directory-picker';
import { useAddProject } from '@hooks/use-add-project';
import { useAttachedServer } from '@hooks/use-project-config';

/** Which of the panel's two registers this control is drawn in. */
type NewProjectVariant = 'icon' | 'cta';

/**
 * One control, two registers — and nothing else differs between them.
 *
 * `icon` is the panel head's `+`: the one way to add a project while the tree
 * is on screen, so it sits where the list's title is and never scrolls away.
 * `cta` is the empty state's button, where there is no list to compete with and
 * the only thing on screen worth pressing should look pressable.
 *
 * The border is where `cta` stops. A fill would make the loudest thing in a
 * 320px rail an apology for an empty list, which is the one thing
 * `EmptyState` says a rail must not do.
 */
const CLASSES: Record<NewProjectVariant, string> = {
  icon: 'ml-auto self-center rounded border-0 p-1 leading-normal text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted',
  cta: 'inline-flex items-center gap-[7px] rounded-lg border border-border px-3 py-[5px] tabular-nums text-ui-sm leading-normal text-ink hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:hover:bg-transparent aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent',
};

/**
 * Map another repository, from the rail, without a detour through Settings.
 *
 * It opens the OS directory chooser, which *is* the question — there is no
 * app-side form to fill in, because a project is a folder.
 *
 * ## Why the head, and why the empty state
 *
 * The panel head used to carry a `+` for New session and a `new project` line
 * sat at the foot of the tree, which read as two buttons for one act. The
 * head's `+` is now this control, and the foot line is gone: a list whose only
 * affordance is at the bottom hides it the moment the fleet is longer than the
 * rail. New session stays one click away on each project's own line and in
 * the picker.
 *
 * With no tree there is no head, so the empty state renders this as
 * `EmptyState`'s `control` instead: sprite, flavour line, button, then the one
 * thing the rail cannot do.
 *
 * ## The accessible name
 *
 * `cta` shows the words `new project`; `icon` shows only the plus, so its
 * `aria-label` carries the whole name. Both say "Add a new project", which
 * contains the visible words (WCAG's Label in Name) and deliberately does not
 * contain "new session", so the substring locators that already have to
 * disambiguate that name are left alone.
 */
export function NewProjectLink({
  variant = 'icon',
}: {
  variant?: NewProjectVariant;
}) {
  const { addProject, choosing, picking, cancelPicking, onPicked } =
    useAddProject();
  const attachedServer = useAttachedServer();

  return (
    <>
      <Button
        variant="ghost"
        onClick={addProject}
        pending={choosing}
        /*
          What the click opens. It no longer carries a refusal: while attached
          this opens the server-side picker rather than a dialog that could
          only fail (HIVE-146), so the control has no disabled state left
          beyond a native dialog already being open.
        */
        title="Choose a folder to map as a project"
        aria-label="Add a new project"
        className={CLASSES[variant]}
      >
        <Plus
          size={variant === 'icon' ? 14 : 11}
          weight="bold"
          aria-hidden="true"
          className="shrink-0"
        />
        {variant === 'cta' ? 'new project' : null}
      </Button>
      <DirectoryPicker
        open={picking}
        onOpenChange={(next) => {
          if (!next) cancelPicking();
        }}
        onChoose={onPicked}
        serverName={attachedServer ?? 'the server'}
        title="Choose a project folder"
        confirmLabel="Add project"
      />
    </>
  );
}
