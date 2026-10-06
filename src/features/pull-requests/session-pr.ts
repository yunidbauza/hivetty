import { formatDuration } from '@/lib/format-duration';
import type { HatcheryRow, SessionPr } from '@/types/pull-request';

import type { PrCheck, PrThread } from '@shared/github-contract';

/**
 * What the session panel's PR tab (HIVE-209) says, as pure functions: the
 * checks' count and times, a thread's place, the shipper's words, the strip's
 * tooltip. The wording itself is HIVE-215's (`hatchStatus().github`).
 */

/** Finished of total: running and queued are the unfinished ones. */
export function checkCount(checks: readonly PrCheck[]): { done: number; total: number } {
  const done = checks.filter((check) => check.status !== 'running' && check.status !== 'queued').length;
  return { done, total: checks.length };
}

/** `41s` finished, `running 2m` (one unit) while it runs, `queued`, else nothing. */
export function checkTime(check: PrCheck, now: number): string {
  if (check.status === 'queued') return 'queued';
  if (check.status === 'running') {
    if (check.startedAt === null) return 'running';
    return `running ${formatDuration(now - Date.parse(check.startedAt)).split(' ')[0] ?? ''}`;
  }
  if (check.startedAt === null || check.completedAt === null) return '';
  return formatDuration(Date.parse(check.completedAt) - Date.parse(check.startedAt));
}

/** Where the thread sits now, else where it was left; `undefined` when GitHub gave neither. */
export function threadLine(thread: Pick<PrThread, 'line' | 'originalLine'>): number | undefined {
  return thread.line ?? thread.originalLine ?? undefined;
}

export function threadPlace(thread: Pick<PrThread, 'path' | 'line' | 'originalLine'>): string {
  const line = threadLine(thread);
  return line === undefined ? thread.path : `${thread.path}:${String(line)}`;
}

export function firstLine(body: string): string {
  return body.trim().split('\n')[0]?.trim() ?? '';
}

/** "took it", then the hatch reason when it adds something the name does not already say. */
export function shipperWords(github: string): string {
  const at = github.indexOf(' · ');
  const reason = at === -1 ? '' : github.slice(at + 3);
  return reason === '' || reason.startsWith('the shipper') ? 'took it' : `took it · ${reason}`;
}

/** The strip's tooltip and the PR tab's accessible fact. */
export function prFact(pr: SessionPr, row: HatcheryRow | null): string {
  return `#${String(pr.n)} · ${row === null ? 'last seen' : row.hatch.github}`;
}
