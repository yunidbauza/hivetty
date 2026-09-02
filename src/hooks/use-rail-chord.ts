import { useEffect } from 'react';

import { isMacPlatform } from '@lib/platform';
import { isRailChord, TERMINAL_CHORD_EVENT, type TerminalChordDetail } from '@lib/terminal/keymap';
import { useToggleRailCollapsed } from '@stores/appearance-store';

/**
 * The two rail-collapse chords, from wherever focus happens to be.
 *
 * ## Why two entry points
 *
 * xterm consumes keys before `window` sees them, so a chord pressed in a
 * focused terminal never reaches a window listener — it arrives as a
 * {@link TERMINAL_CHORD_EVENT} that `terminal-surface` dispatched on the way
 * past. Everywhere else — the rails, the editor, the picker — the ordinary
 * `keydown` is the only signal there is. Neither covers the other, so this
 * listens for both and de-duplicates between them.
 *
 * ## Why this is not a binding registry
 *
 * `header.tsx` defers `Cmd+,` to story 060's registry and should keep
 * deferring. This is one chord pair with two entry points, scoped that way on
 * purpose: a third chord wanting the same treatment is when the registry earns
 * itself, and not before.
 */
export function useRailChord(): void {
  const toggleRailCollapsed = useToggleRailCollapsed();

  useEffect(() => {
    const isMac = isMacPlatform();

    const onKeyDown = (event: KeyboardEvent) => {
      /*
        A terminal already dispatched a chord event for this keystroke.
        Handling both would toggle twice and land back where it started — a
        shortcut that visibly does nothing, which is the hardest kind to
        diagnose.
      */
      if (event.target instanceof Element && event.target.closest('[data-terminal-id]')) {
        return;
      }

      const side = isRailChord(event, isMac);
      if (!side) return;

      event.preventDefault();
      toggleRailCollapsed(side);
    };

    const onChord = (event: Event) => {
      const { detail } = event as CustomEvent<TerminalChordDetail>;
      if (detail?.chord === 'rail-left') toggleRailCollapsed('left');
      else if (detail?.chord === 'rail-right') toggleRailCollapsed('right');
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(TERMINAL_CHORD_EVENT, onChord);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(TERMINAL_CHORD_EVENT, onChord);
    };
  }, [toggleRailCollapsed]);
}
