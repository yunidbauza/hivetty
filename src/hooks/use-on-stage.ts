import { isEntityView, resolveView } from '@/lib/resolve-view';
import { isSession, terminalOf } from '@/types/entity';

import { useEditorLayout } from '@stores/appearance-store';
import { useActiveFileKey } from '@stores/editor-store';
import { useActiveEntity } from '@stores/hive-store';
import { useActiveTab, usePickerState, usePlace, useSettingsOpen } from '@stores/ui-store';

/**
 * What is on the centre stage: a terminal id, an agent's row id, or null
 * (HIVE-214, extracted from `useForegroundSession`, HIVE-81).
 *
 * "What is on stage" must have one answer: the foreground gate and the Inbox
 * (HIVE-198) both call this. HIVE-195's place machine is one of its inputs.
 *
 * **This mirrors `center-stage.tsx` rather than re-deriving.** Same selectors,
 * same `editorFull` derivation, same `resolveView` call. "What is on screen"
 * must have exactly one answer, and the surest way to grow a second one that
 * drifts is to compute it twice from the same inputs in two places. If the
 * stage's inputs change, this has to change with them — that is a feature.
 *
 * A `split` editor still shows the terminal, so it stays foreground; a `full`
 * one does not. That distinction is the entire reason `resolveView` takes one
 * `editorFull` boolean instead of `placement`.
 *
 * An **agent** tab counts. `isEntityView` groups `'session'` and `'agent'`,
 * and the rule the gate encodes is "you can already see it", which has nothing
 * to do with which kind of entity it is.
 *
 * That is why this keeps `isEntityView` while `center-stage.tsx` moved to
 * `isTerminalView` (HIVE-116). The two used to be one predicate; an agent view
 * is still something the user is looking at, but it is no longer a terminal,
 * and only the stage cares about the difference.
 *
 * Publishes a **terminal** id, not a row id. A notification's action carries a
 * terminal id, so main compares like with like; a row id would silently never
 * match after a `/clear` and the gate would be a no-op.
 *
 * Read off the **entity this hook is already subscribed to**, rather than
 * through `terminalIdFor(activeTab)`. That helper is a `getState()` read, which
 * `CLAUDE.md` bans from components and whose own doc comment says its callers
 * are event handlers, not render paths. It happened to be correct here only
 * because `useActiveEntity()` subscribes to the very entity it looks up — a
 * coupling with nothing at the call site to show for it, and one that would
 * break the moment either side moved. `terminalOf` is the same accessor the
 * helper uses, applied to a value React is already re-rendering us for.
 */
export function useOnStage(): string | null {
  const activeTab = useActiveTab();
  const entity = useActiveEntity();
  const { picker } = usePickerState();
  const settings = useSettingsOpen();
  const activeFileKey = useActiveFileKey();
  const { placement } = useEditorLayout();
  const place = usePlace();

  const editorFull = activeFileKey !== null && placement === 'full';
  const home = place === 'home';
  const work = place === 'work';
  const agents = place === 'agents';
  const prs = place === 'prs';
  const view = resolveView({ activeTab, picker, settings, entity, editorFull, home, work, agents, prs });
  /*
    `entity` is non-null whenever the view is an entity view — `resolveView`
    falls back to the orchestrator without one — so the null check is a type
    narrowing rather than a case. An **agent** has no terminal of its own and
    its row id is what main knows it by, which is what `terminalIdFor` answered
    for the same input.
  */
  return isEntityView(view) && entity !== null
    ? isSession(entity)
      ? terminalOf(entity)
      : entity.id
    : null;
}
