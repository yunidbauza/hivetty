import { useLastOrchLine } from '@stores/hive-store';
import { useConsoleShown, useToggleConsole } from '@stores/ui-store';

/**
 * The dock's top line (HIVE-197). Folded, the console's last line stands in for
 * the transcript; shown, only the control remains. No age: `TermLine` carries no
 * timestamp (spec, Decisions).
 */
export function ConsolePeek() {
  const shown = useConsoleShown();
  const toggle = useToggleConsole();
  const last = useLastOrchLine();

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-border-soft bg-term-input px-[18px] py-1.5 font-mono text-ui-sm">
      {shown ? null : <span className="min-w-0 flex-1 truncate text-subtle">{last}</span>}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        className="ml-auto shrink-0 text-brand hover:underline"
      >
        {shown ? 'Hide the console ⌄' : 'Show the console ⌃'}
      </button>
    </div>
  );
}
