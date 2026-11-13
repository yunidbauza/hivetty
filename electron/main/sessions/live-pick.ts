import type { SessionMetrics } from '@shared/metrics-contract';
import { SESSION_EFFORTS, SESSION_MODELS, type SessionEffort, type SessionModel } from '@shared/session-contract';

/** Claude models `claude --effort` does nothing for; a resume on one launches without the flag. */
const NO_EFFORT: readonly SessionModel[] = ['haiku'];

export const takesEffort = (model: SessionModel): boolean => !NO_EFFORT.includes(model);

/**
 * The model and effort a session runs now, as its status line reports them, in the words a resume launches with.
 *
 * A `/model` or `/effort` inside the session changes what it runs without HiveTTY choosing it, so a resume that
 * replayed the spawn's pick would come back on the wrong model. The status line reports a display name
 * (`Opus 5.5`), mapped here to its alias. Anything outside the closed lists is dropped: these become unquoted
 * shell words in the launch command.
 */
export function livePick(
  metrics: Pick<SessionMetrics, 'model' | 'effort'>,
): { model?: SessionModel; effort?: SessionEffort } {
  const pick: { model?: SessionModel; effort?: SessionEffort } = {};
  const words = metrics.model?.toLowerCase().split(/\W+/) ?? [];
  const model = SESSION_MODELS.find((alias) => words.includes(alias));
  if (model !== undefined) pick.model = model;
  const effort = SESSION_EFFORTS.find((level) => level === metrics.effort);
  if (effort !== undefined && (model === undefined || takesEffort(model))) pick.effort = effort;
  return pick;
}
