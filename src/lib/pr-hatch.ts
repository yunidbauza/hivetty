import type { Flap, FlapTone, HatchFacts, HatcheryRow, HatchStatus, Pr } from '@/types/pull-request';

/**
 * The PR hatch status (HIVE-215): one rule for every surface that names a
 * PR's flap — the Hatchery (HIVE-205), Home's counts (HIVE-200) and the
 * session panel's PR tab (HIVE-209). In `lib` rather than `features/shared`
 * because the store composes it, and a store may not import a feature.
 */

/** The Hatchery's order. Open flaps by urgency; HATCHED after every open PR. */
export const FLAP_RANK: Record<Flap, number> = {
  SUMMONS: 0,
  HATCHING: 1,
  MUTATING: 2,
  INCUBATING: 3,
  COCOONING: 4,
  BURROWED: 5,
  LARVA: 6,
  HATCHED: 7,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * HATCHED's words: `Merged 11:32` today, `Merged yesterday 18:10`, else
 * `Merged 12 Aug` (a search reaches old merges). Local time, 24-hour; days are
 * local calendar days against `now`.
 */
export function mergedWords(mergedAt: string | null, now: number): { at?: string; words: string } {
  const ms = mergedAt === null ? NaN : Date.parse(mergedAt);
  if (Number.isNaN(ms)) return { words: 'Merged' };

  const merged = new Date(ms);
  const at = `${pad(merged.getHours())}:${pad(merged.getMinutes())}`;
  const today = dayOf(new Date(now));
  const day = dayOf(merged);
  if (day === today) return { at, words: `Merged ${at}` };
  // Midday before today is always the previous calendar day, DST nights included.
  if (day === dayOf(new Date(today - 43_200_000))) return { at, words: `Merged yesterday ${at}` };
  return { at, words: `Merged ${merged.getDate()} ${MONTHS[merged.getMonth()]}` };
}

const newestFirst = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

/** Open by rank, then most recently updated; merged after, newest merge first. A copy. */
export function sortHatchery(rows: readonly HatcheryRow[]): HatcheryRow[] {
  return [...rows].sort((a, b) => {
    const landed = Number(a.pr.state === 'merged') - Number(b.pr.state === 'merged');
    if (landed !== 0) return landed;
    if (a.pr.state === 'merged') return newestFirst(a.pr.mergedAt, b.pr.mergedAt);
    return a.hatch.rank - b.hatch.rank || newestFirst(a.pr.updatedAt, b.pr.updatedAt);
  });
}

const TONE: Record<Flap, FlapTone> = {
  SUMMONS: 'amber',
  HATCHING: 'green',
  MUTATING: 'green',
  INCUBATING: 'green',
  COCOONING: 'muted',
  BURROWED: 'muted',
  LARVA: 'muted',
  HATCHED: 'brand',
};

/** A flap's tone, from the one table: Home's counts and the Hatchery never disagree (HIVE-200). */
export const flapTone = (flap: Flap): FlapTone => TONE[flap];

const STATE_WORD = { open: 'Open', approved: 'Approved', draft: 'Draft', merged: 'Merged' } as const;
const findingsWords = (n: number) => `${n} open finding${n === 1 ? '' : 's'}`;
const COCOON_WORDS: Record<string, string> = {
  intake: 'the shipper took it',
  'self-review': 'self review by acr',
  'fix-self': 'fixing the self review',
};

const status = (flap: Flap, github: string, at?: string): HatchStatus => ({
  flap,
  ...(at === undefined ? {} : { at }),
  tone: TONE[flap],
  github,
  rank: FLAP_RANK[flap],
  needsYou: flap === 'SUMMONS',
});

/**
 * A PR's flap, by the ticket's table: first match wins (HIVE-215).
 *
 * "Held" is `facts.stage !== null`. SUMMONS is only ever yours. A draft is
 * never green: held at any stage it is COCOONING, unheld it is LARVA. A held
 * stage the table does not name falls through to the unheld rules.
 */
export function hatchStatus(
  pr: Pick<Pr, 'state' | 'findings' | 'checks' | 'mine' | 'mergedAt'>,
  facts: HatchFacts,
  now: number,
): HatchStatus {
  const { stage } = facts;
  const s = STATE_WORD[pr.state];
  const failing = pr.checks === 'failing';

  if (pr.state === 'merged') {
    const merged = mergedWords(pr.mergedAt, now);
    return status('HATCHED', merged.words, merged.at);
  }
  if (pr.mine && facts.mergeWaiting) return status('SUMMONS', 'Approved · waiting for your merge');
  if (pr.mine && facts.askedMe) {
    return status('SUMMONS', `${s} · ${stage === 'approval' ? 'the shipper asks about the review' : 'the shipper asks you'}`);
  }
  if (stage !== null) {
    const cocoon = COCOON_WORDS[stage];
    if (cocoon !== undefined) return status('COCOONING', `${s} · ${cocoon}`);
    if (pr.state === 'draft') return status('COCOONING', `Draft · held at ${stage}`);
    if ((stage === 'ready' || stage === 'ci') && !failing) {
      const why = pr.checks === 'running' ? 'checks running' : stage === 'ready' ? 'being marked ready' : 'checks passing';
      return status('INCUBATING', `${s} · ${why}`);
    }
    if (stage === 'findings') {
      return status('MUTATING', `${s} · ${pr.findings > 0 ? `${findingsWords(pr.findings)}, fixer on it` : 'fixer on it'}`);
    }
    if (stage === 'ci') return status('MUTATING', `${s} · checks failing, fixer on it`);
    if (stage === 'approval') return status('BURROWED', `${s} · waiting on review`);
    if (stage === 'merge') return status('HATCHING', `${s} · the shipper is merging it`);
  }
  if (pr.state === 'draft') return status('LARVA', 'Draft · nobody is driving it');
  if (pr.mine && (failing || pr.findings > 0)) {
    const why = [failing ? 'checks failing' : null, pr.findings > 0 ? findingsWords(pr.findings) : null];
    return status('SUMMONS', `${s} · ${why.filter((w) => w !== null).join(', ')}`);
  }
  if (pr.mine && pr.state === 'approved') return status('SUMMONS', 'Approved · waiting for your merge');
  if (pr.checks === 'running') return status('INCUBATING', `${s} · checks running`);
  return status('BURROWED', `${s} · ${pr.mine ? 'waiting on review' : 'waits on its author'}`);
}
