import { DotsThreeVertical } from '@phosphor-icons/react';
import { useRef } from 'react';

import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';

interface ProjectRowMenuProps {
  /** Named in the trigger's accessible name — every row has one of these. */
  projectName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: () => void;
  onChangeKey: () => void;
  onRepoint: () => void;
  onRemove: () => void;
  /**
   * Whether the shipper agent may merge this project's PRs without a card
   * (HIVE-166). Shown as a checked item; toggling writes the config.
   */
  autoMerge: boolean;
  onToggleAutoMerge: () => void;
}

/**
 * Every action on a project row, in one menu (story 103).
 *
 * ## Why a menu
 *
 * The alternative considered was three hover-revealed icon buttons. This list
 * is read far more often than it is edited, and the row already carries a
 * `no git` tag on its right edge — four controls plus a tag in the same ~120px
 * buys one click and costs the resting state, which is the state the row is in
 * almost always.
 *
 * (The `demo` tag the row once carried went with story 103: the settings list
 * only ever holds config projects, so that branch was unreachable here.)
 *
 * ## Why Move up / Move down live here
 *
 * They are the keyboard path for reordering. The alternative was a lift mode on
 * the drag grip (Space to lift, arrows to move) — the convention a DnD library
 * would have supplied. Two reasons this won: nothing about a grip announces
 * that Space lifts it, and menu items are ordinary clicks, so the reorder logic
 * is provable in unit tests. A lift mode would have made drag the only path to
 * that code, which is the fragile one.
 *
 * ## The primitive owns the look
 *
 * `dropdown-menu.tsx` draws the one menu surface (`MENU_SURFACE`) and the one
 * item recipe from `--cc-*` tokens (HIVE-225), so this menu passes layout only:
 * its `min-w`, and `variant="destructive"` for Remove.
 */
export function ProjectRowMenu({
  projectName,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onChangeKey,
  onRepoint,
  onRemove,
  autoMerge,
  onToggleAutoMerge,
}: ProjectRowMenuProps) {
  /**
   * Whether the chosen item replaces the row with something that focuses itself.
   *
   * Radix returns focus to the trigger when the menu closes, which is right for
   * *Move up* and *Change folder…* — the row is still a row afterwards. It is
   * wrong for *Rename…* and *Remove*: both swap the row's contents for a
   * control that focuses itself on mount, and the restore lands after that,
   * stealing focus straight back. For rename that is not merely untidy — the
   * steal blurs the input, blur commits, an unchanged name cancels, and the
   * editor closes before a key is pressed.
   */
  const handsOffFocus = useRef(false);

  /** Run an action, recording whether it takes focus with it. */
  const select = (action: () => void, takesFocus = false) => {
    handsOffFocus.current = takesFocus;
    action();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${projectName}`}
        className="shrink-0 rounded-full p-1 text-subtle hover:bg-hover hover:text-ink"
      >
        <DotsThreeVertical size={13} weight="bold" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!handsOffFocus.current) return;
          handsOffFocus.current = false;
          event.preventDefault();
        }}
        className="min-w-[11rem]"
      >
        {/*
          Disabled at the ends of the list rather than removed: an item that
          vanishes on the first row makes the menu a different shape per row,
          and `disabled` still announces that the action exists.
        */}
        <DropdownMenuItem
          disabled={!canMoveUp}
          onSelect={() => select(onMoveUp)}
        >
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canMoveDown}
          onSelect={() => select(onMoveDown)}
        >
          Move down
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border-soft" />

        <DropdownMenuItem
          onSelect={() => select(onRename, true)}
        >
          Rename…
        </DropdownMenuItem>
        {/*
          Consent to an unattended merge (HIVE-166), a real checkbox item so
          the state lives in `aria-checked` and the label never moves. Above
          *Change key…* because it is the one edit that changes what an agent
          may do rather than how the project is named.
        */}
        <DropdownMenuCheckboxItem
          checked={autoMerge}
          onSelect={() => select(onToggleAutoMerge)}
        >
          Merge PRs unattended
        </DropdownMenuCheckboxItem>
        {/*
          Between *Rename…* and *Change folder…*: the three edits are ordered by
          how much they change, and renaming what a project is called sits
          nearer to renaming what it is typed as than either does to moving it
          on disk (HIVE-94).
        */}
        <DropdownMenuItem
          onSelect={() => select(onChangeKey, true)}
        >
          Change key…
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => select(onRepoint)}
        >
          Change folder…
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border-soft" />

        <DropdownMenuItem
          onSelect={() => select(onRemove, true)}
          variant="destructive"
        >
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
