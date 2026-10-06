import { statusLabel } from '@components/ui/status-dot';
import { ALL_PROJECTS, type CellState, type CombCell, SWARM } from '@lib/swarm/comb';
import type { CombEntity } from '@stores/hive-store';

/** The comb's state words: the Hive's own vocabulary for a cell. */
export const STATE_WORD: Record<CellState, string> = {
  morphing: 'Morphing', summons: 'Summons', failed: 'Failed', burrowed: 'Burrowed', terminal: 'Terminal',
};

/** What a cell is doing, in a line. */
export function cellLine(e: CombEntity): string {
  if (e.kind === 'agent') {
    if (e.state === 'summons') return e.ask ?? 'asking';
    if (e.state === 'failed') return e.reason ?? 'failed';
    if (e.state === 'morphing') return 'working';
    if (e.nextRun === 'paused') return 'paused';
    if (e.nextRun === undefined || e.nextRun === 'manual') return 'asleep';
    return `next run ${e.nextRun}`;
  }
  const label = statusLabel(e.status, e.idleDetail);
  return e.total === undefined ? label : `${label} · ${e.done ?? 0} of ${e.total}`;
}

export function waitText(askedAt: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - askedAt) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export interface CellText {
  title: string;
  word?: string;
  state?: CellState;
  context: string;
  line: string;
}

/** The tooltip's three lines, and the hidden button's label, for one cell. */
export function cellText(
  cell: CombCell, entity: CombEntity | undefined, projectName: (id: string) => string, now: number,
): CellText {
  if (cell.kind === 'rest' || entity === undefined) {
    const more = cell.more ?? 0;
    if (cell.project === ALL_PROJECTS) return { title: `${more} more projects`, context: '', line: 'click to see every session' };
    if (cell.project === SWARM) return { title: `${more} more agents`, context: '', line: 'click to open Agents' };
    return { title: `${more} more in ${projectName(cell.project)}`, context: '', line: 'click to open the project' };
  }
  // Decision D2: only an agent's ask carries a wait until HIVE-214's queue gives sessions one.
  const wait = entity.askedAt !== undefined && entity.state === 'summons' ? ` · ${waitText(entity.askedAt, now)}` : '';
  return {
    title: entity.name,
    word: STATE_WORD[entity.state],
    state: entity.state,
    context: `${entity.kind === 'agent' ? 'agent' : projectName(entity.project)}${wait}`,
    line: cellLine(entity),
  };
}

export const cellLabel = ({ title, word, context, line }: CellText): string =>
  [title, word ? `${word} · ${context}` : context, line].filter((part) => part !== '').join(', ');
