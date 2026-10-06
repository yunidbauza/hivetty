/**
 * The PR Timeline's pure half (HIVE-208): the time scale, the lanes and
 * "where the time went", from the timeline read, the ledger and the ship
 * track. No React and no store; every function takes its clock.
 */

import { flapTone, hatchStatus } from '@/lib/pr-hatch';
import type { Flap, FlapTone, Pr } from '@/types/pull-request';

import type { PrTimeline, PrTimelineRun } from '@shared/github-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import { CLOSING_KINDS, prEvents, prOpener, shipTrack } from '@shared/ledger-derive';
import type { ShipVisit } from '@shared/ledger-derive';

export const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10_080, 20_160, 43_200].map((m) => m * MIN);
/** The widest step; an axis too long even for monthly ticks takes it anyway. */
const LARGEST = STEPS[STEPS.length - 1] ?? DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export interface Tick { at: number; f: number; label: string }

/** The change points between `start` and `end`, deduped and sorted, as `[from, to)` pairs. */
function pairsOf(points: readonly number[], start: number, end: number): [number, number][] {
  const sorted = [...new Set(points.filter((p) => p >= start && p <= end))].sort((a, b) => a - b);
  const out: [number, number][] = [];
  let prev: number | undefined;
  for (const p of sorted) {
    if (prev !== undefined) out.push([prev, p]);
    prev = p;
  }
  return out;
}

/** Where `t` sits between `start` and `end`, 0 to 1. */
export function fraction(t: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

/** `HH:MM`, local; with the weekday once the axis spans more than a day, and a bare date once the axis spans more than a week (weekdays would repeat). */
const clock = (t: number, days: boolean, dated: boolean) => {
  const d = new Date(t);
  if (dated) return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${days ? `${DAYS[d.getDay()]} ` : ''}${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Ticks on round local times, the smallest step whose labels sit `minGapPx`
 * apart (HIVE-208). Steps of an hour or more start on the first whole local
 * hour, so a long axis still opens near its start.
 */
export function ticks(start: number, end: number, widthPx: number, minGapPx = 72): Tick[] {
  const span = Math.max(end - start, MIN);
  const step = STEPS.find((s) => (s / span) * widthPx >= minGapPx) ?? LARGEST;
  const round = Math.min(step, HOUR);
  const offset = new Date(start).getTimezoneOffset() * MIN;
  const first = Math.ceil((start - offset) / round) * round + offset;
  const days = span > DAY;
  const out: Tick[] = [];
  for (let at = first; at <= end; at += step) out.push({ at, f: fraction(at, start, end), label: clock(at, days, step >= DAY && span > WEEK) });
  return out;
}

export interface CiBar {
  id: number;
  number: number;
  sha: string;
  url: string;
  from: number;
  to: number;
  state: PrTimelineRun['state'];
  failedJobs: string[];
}

/** One bar per run, start to end; a running one ends at `now`; skipped and cancelled runs are not drawn. */
export function ciBars(runs: readonly PrTimelineRun[], now: number): CiBar[] {
  return runs
    .filter((run) => run.state !== 'other')
    .map((run) => {
      const from = Date.parse(run.startedAt);
      const to = run.endedAt === null ? now : Math.max(from, Date.parse(run.endedAt));
      return { id: run.id, number: run.number, sha: run.sha, url: run.url, from, to, state: run.state, failedJobs: run.failedJobs };
    })
    .sort((a, b) => a.from - b.from);
}

export interface Hold { who: string; from: number; to: number; firstEventId: string | null }
type Span = Omit<Hold, 'firstEventId'>;

const taskIs = (entry: LedgerEntry, wanted: string) => {
  const task = entry.meta?.['task'];
  return typeof task === 'string' && task.toLowerCase() === wanted;
};

/** The shipper's own spans, claim to release or a `closed` stage post, and its asks to acr and fixer. */
function shipperSpans(events: readonly LedgerEntry[], all: readonly LedgerEntry[], wanted: string, now: number) {
  let held: number | null = null;
  const asks: Span[] = [];
  const spans: { from: number; to: number }[] = [];
  for (const entry of events) {
    if (entry.from !== 'shipper') continue;
    const ends = (entry.kind === 'release' && taskIs(entry, wanted)) || (entry.kind === 'post' && entry.meta?.['stage'] === 'closed');
    if (entry.kind === 'claim' && taskIs(entry, wanted) && held === null) held = entry.ts;
    else if (ends) {
      if (held !== null) spans.push({ from: held, to: entry.ts });
      held = null;
    } else if (entry.kind === 'ask' && (entry.to === 'acr' || entry.to === 'fixer')) {
      asks.push({ who: entry.to, from: entry.ts, to: closedAt(entry, all) ?? now });
    }
  }
  if (held !== null) spans.push({ from: held, to: now });
  return { asks, spans };
}

/**
 * Who held the PR, when (HIVE-208): the opener until its intake ask, the
 * shipper from claim to release or `closed`, and inside that acr or fixer from
 * each shipper ask to its answer. The shipper holds the gaps.
 */
export function holdIntervals(
  events: readonly LedgerEntry[], all: readonly LedgerEntry[], slug: string, n: number,
  opener: string | null, createdAt: number, now: number,
): Hold[] {
  const raw: Span[] = [];
  const intake = events.find((entry) => entry.kind === 'ask' && entry.to === 'shipper' && entry.meta?.['stage'] === 'intake');
  if (opener !== null) raw.push({ who: opener, from: createdAt, to: intake?.ts ?? now });

  const { asks, spans } = shipperSpans(events, all, `${slug.toLowerCase()}#${n}`, now);
  for (const span of spans) {
    let cursor = span.from;
    for (const ask of asks.filter((a) => a.from >= span.from && a.from < span.to)) {
      if (ask.from > cursor) raw.push({ who: 'shipper', from: cursor, to: ask.from });
      const to = Math.min(ask.to, span.to);
      raw.push({ who: ask.who, from: Math.max(ask.from, cursor), to });
      cursor = Math.max(cursor, to);
    }
    if (cursor < span.to) raw.push({ who: 'shipper', from: cursor, to: span.to });
  }

  const merged: Span[] = [];
  for (const hold of raw.filter((h) => h.to > h.from)) {
    const last = merged.at(-1);
    if (last !== undefined && last.who === hold.who && last.to >= hold.from) last.to = Math.max(last.to, hold.to);
    else merged.push({ ...hold });
  }
  return merged.map((hold) => {
    const own = events.find((entry) => entry.from === hold.who && entry.ts >= hold.from && entry.ts < hold.to);
    const ask = events.find((entry) => entry.kind === 'ask' && entry.to === hold.who && entry.ts === hold.from);
    return { ...hold, firstEventId: own?.id ?? ask?.id ?? null };
  });
}

export interface FlapSpan { flap: Flap; tone: FlapTone; from: number; to: number; github: string }
export interface Window { from: number; to: number }

const covers = (windows: readonly Window[], p: number) => windows.some((w) => w.from <= p && p < w.to);

/** Draft at `p`: the latest draft/ready event at or before it, else the opposite of the first one after it, else `isDraft`. */
function draftAt(timeline: PrTimeline, p: number): boolean {
  const flips = timeline.events.filter((e) => e.kind === 'ready' || e.kind === 'draft').map((e) => ({ kind: e.kind, at: Date.parse(e.at) }));
  const before = flips.filter((f) => f.at <= p).at(-1);
  if (before !== undefined) return before.kind === 'draft';
  const after = flips.find((f) => f.at > p);
  return after !== undefined ? after.kind === 'ready' : timeline.isDraft;
}

/** Running while any bar is in flight, else the newest finished bar's verdict. */
function checksAt(bars: readonly CiBar[], p: number): Pr['checks'] {
  if (bars.some((b) => b.from <= p && p < b.to)) return 'running';
  const last = bars.filter((b) => b.to <= p).at(-1);
  return last?.state === 'failed' ? 'failing' : 'passing';
}

/**
 * The PR's flaps from creation to `end` (HIVE-208): `hatchStatus` replayed at
 * every point any of its inputs changed, neighbours with one flap merged.
 * Findings count is not historical, so it is 0: the findings stage alone is
 * what makes a held PR MUTATING.
 */
export function flapHistory(input: {
  timeline: PrTimeline; bars: readonly CiBar[]; visits: readonly ShipVisit[];
  asksToMe: readonly Window[]; mergeAsks: readonly Window[]; mine: boolean; end: number;
}): FlapSpan[] {
  const { timeline, bars, visits, asksToMe, mergeAsks, mine, end } = input;
  const start = Date.parse(timeline.createdAt);
  const merged = timeline.mergedAt === null ? Infinity : Date.parse(timeline.mergedAt);
  const points = [
    start, end, ...timeline.events.map((e) => Date.parse(e.at)),
    ...bars.flatMap((b) => [b.from, b.to]), ...visits.flatMap((v) => [v.from, v.to ?? end]),
    ...[...asksToMe, ...mergeAsks].flatMap((w) => [w.from, w.to]),
  ];

  const spans: FlapSpan[] = [];
  for (const [p, to] of pairsOf(points, start, end)) {
    const visit = visits.find((v) => v.from <= p && p < (v.to ?? Infinity));
    const state: Pr['state'] = p >= merged ? 'merged' : draftAt(timeline, p) ? 'draft' : 'open';
    const hatch = hatchStatus(
      { state, findings: 0, checks: checksAt(bars, p), mine, mergedAt: timeline.mergedAt },
      { stage: visit?.stage ?? null, askedMe: covers(asksToMe, p), mergeWaiting: covers(mergeAsks, p) },
      p,
    );
    const last = spans.at(-1);
    if (last?.flap === hatch.flap) last.to = to;
    else spans.push({ flap: hatch.flap, tone: flapTone(hatch.flap), from: p, to, github: hatch.github });
  }
  return spans;
}

export type BucketName = 'Before the shipper' | 'Self review and fix' | 'CI' | 'Findings' | 'Waiting on you' | 'Waiting on review';
export interface Bucket { name: BucketName; ms: number; holder: string | null }

const ORDER: BucketName[] = ['Before the shipper', 'Self review and fix', 'CI', 'Findings', 'Waiting on you', 'Waiting on review'];
const BY_STAGE: Partial<Record<ShipVisit['stage'], BucketName>> = {
  intake: 'Self review and fix', 'self-review': 'Self review and fix', 'fix-self': 'Self review and fix',
  ready: 'CI', ci: 'CI', findings: 'Findings', merge: 'Waiting on you',
};

interface BucketInput {
  start: number; end: number; visits: readonly ShipVisit[]; holds: readonly Hold[]; flaps: readonly FlapSpan[];
  bars: readonly CiBar[]; youWindows: readonly Window[]; draftAt: (p: number) => boolean; opener: string | null;
}

/** The one bucket the span starting at `p` belongs to: a visit outranks a SUMMONS flap, which outranks the unheld rules. */
function bucketAt(input: BucketInput, p: number): BucketName {
  const { visits, flaps, bars, youWindows, draftAt: draft } = input;
  const visit = visits.find((v) => v.from <= p && p < (v.to ?? Infinity));
  if (visit !== undefined) {
    if (visit.stage === 'approval') return covers(youWindows, p) ? 'Waiting on you' : 'Waiting on review';
    return BY_STAGE[visit.stage] ?? 'Waiting on review';
  }
  if (flaps.some((f) => f.flap === 'SUMMONS' && f.from <= p && p < f.to)) return 'Waiting on you';
  const beforeShipper = p < (visits[0]?.from ?? Infinity);
  if (beforeShipper && draft(p)) return 'Before the shipper';
  if (bars.some((b) => b.from <= p && p < b.to)) return 'CI';
  if (beforeShipper && visits.length > 0) return 'Before the shipper';
  return 'Waiting on review';
}

/** "Where the time went" (HIVE-208): every span of the PR's life in one bucket, so they sum to its age. */
export function timeBuckets(input: BucketInput): Bucket[] {
  const { start, end, visits, holds, flaps, bars, youWindows, opener } = input;
  const points = [start, end, ...visits.flatMap((v) => [v.from, v.to ?? end]), ...bars.flatMap((b) => [b.from, b.to]),
    ...flaps.flatMap((f) => [f.from, f.to]), ...youWindows.flatMap((w) => [w.from, w.to])];

  const ms = new Map<BucketName, number>();
  const byWho = new Map<BucketName, Map<string, number>>();
  for (const [p, q] of pairsOf(points, start, end)) {
    const name = bucketAt(input, p);
    ms.set(name, (ms.get(name) ?? 0) + (q - p));
    const who = byWho.get(name) ?? new Map<string, number>();
    for (const hold of holds) {
      const overlap = Math.min(q, hold.to) - Math.max(p, hold.from);
      if (overlap > 0) who.set(hold.who, (who.get(hold.who) ?? 0) + overlap);
    }
    byWho.set(name, who);
  }

  return ORDER.flatMap((name) => {
    const total = ms.get(name) ?? 0;
    if (total <= 0) return [];
    const who = [...(byWho.get(name) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [{ name, ms: total, holder: name === 'Before the shipper' ? (opener ?? who) : who }];
  });
}

const COUNT = ['zero', 'one', 'two', 'three', 'four'];
const TAIL = 'Every mark opens its event in the conversation.';

function whoWaited({ name, holder }: Bucket): string {
  if (name === 'Findings' && holder === 'fixer') return "the fixer on acr's findings";
  if (name === 'Self review and fix' && holder === 'acr') return "acr's self review";
  if (name === 'Self review and fix' && holder === 'fixer') return 'the fixer on the self review';
  if (name === 'Waiting on you') return 'you';
  if (name === 'Waiting on review') return 'the reviewers';
  if (name === 'CI') return 'CI';
  if (name === 'Before the shipper') return holder === null ? 'the draft' : `the ${holder} before the shipper took it`;
  return holder === null ? name.toLowerCase() : `the ${holder} on ${name.toLowerCase()}`;
}

/** One sentence under the bar (HIVE-208): the longest wait, and a job that failed twice or more. Only these two cases, by the ticket. */
export function timeSentence(buckets: readonly Bucket[], bars: readonly CiBar[]): string {
  const longest = [...buckets].sort((a, b) => b.ms - a.ms)[0];
  if (longest === undefined) return TAIL;
  const fails = new Map<string, number>();
  for (const bar of bars) {
    if (bar.state !== 'failed') continue;
    for (const job of new Set(bar.failedJobs)) fails.set(job, (fails.get(job) ?? 0) + 1);
  }
  const [job, count] = [...fails].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const repeated = count >= 2 ? `, and ${COUNT[count] ?? String(count)} CI runs failed on the same job, ${job}` : '';
  return `The longest wait was ${whoWaited(longest)}${repeated}. ${TAIL}`;
}

export interface ReviewMark { at: number; label: string; amber: boolean; target: { kind: 'github'; url: string } | { kind: 'ledger'; id: string } }
export interface CommentMark { at: number; author: string; url: string }
export interface CommitMark { at: number; oid: string; url: string }
export interface TimelineModel {
  start: number; end: number; merged: boolean;
  flaps: FlapSpan[]; commits: CommitMark[]; bars: CiBar[]; reviews: ReviewMark[]; comments: CommentMark[]; holds: Hold[];
  buckets: Bucket[]; sentence: string;
  /** The ledger id of the stage post that opened each flap span's visit, for click-through; null when none. */
  flapEvents: (string | null)[];
}

const findingsOf = (entry: LedgerEntry): number => {
  const n = entry.meta?.['findings'];
  return typeof n === 'number' ? n : 0;
};

/** When an ask stopped waiting: its answer, a done or failed on its thread, or the overmind's expiry marker; undefined while open. */
export const closedAt = (ask: LedgerEntry, entries: readonly LedgerEntry[]): number | undefined =>
  entries.find((a) => (a.thread === ask.id && CLOSING_KINDS.has(a.kind)) || (a.from === 'overmind' && a.meta?.['expired'] === ask.id))?.ts;

/** `[ask, its close)`, or to `end` while it is open. */
const windowOf = (ask: LedgerEntry, entries: readonly LedgerEntry[], end: number): Window => ({
  from: ask.ts,
  to: closedAt(ask, entries) ?? end,
});

/** GitHub's reviews (acr's labelled from its answer) and acr's self reviews from the ledger, by time. */
function reviewMarks(timeline: PrTimeline, entries: readonly LedgerEntry[], events: readonly LedgerEntry[]): ReviewMark[] {
  const github = timeline.reviews
    .filter((review) => review.state !== 'PENDING' && review.state !== 'DISMISSED')
    .map((review): ReviewMark => {
      const acr = entries.find((entry) => entry.from === 'acr' && entry.kind === 'answer' && entry.meta?.['review_url'] === review.url);
      const findings = acr === undefined ? 0 : findingsOf(acr);
      const label = acr === undefined
        ? `${review.author ?? 'someone'} · ${review.state.toLowerCase().replaceAll('_', ' ')}`
        : `acr · ${findings} findings`;
      return { at: Date.parse(review.at), label, amber: review.state === 'CHANGES_REQUESTED' || findings > 0, target: { kind: 'github', url: review.url } };
    });
  const self = events
    .filter((entry) => entry.from === 'acr' && entry.meta?.['mode'] === 'self')
    .map((entry): ReviewMark => ({ at: entry.ts, label: 'acr · self review', amber: findingsOf(entry) > 0, target: { kind: 'ledger', id: entry.id } }));
  return [...github, ...self].sort((a, b) => a.at - b.at);
}

/** `maria-k` → `Maria`. */
const firstName = (login: string | null): string => {
  const first = (login ?? 'someone').split(/[-_.]/)[0] ?? '';
  return first.charAt(0).toUpperCase() + first.slice(1);
};

/**
 * The Timeline tab's model (HIVE-208): every lane on one axis from creation
 * to the merge (else `now`), the buckets and the sentence under them.
 */
export function buildTimeline(input: {
  timeline: PrTimeline; entries: readonly LedgerEntry[]; slug: string; n: number; mine: boolean;
  toMe: (to: string) => boolean; now: number;
}): TimelineModel {
  const { timeline, entries, slug, n, mine, toMe, now } = input;
  const start = Date.parse(timeline.createdAt);
  const merged = timeline.mergedAt !== null;
  const end = timeline.mergedAt === null ? now : Date.parse(timeline.mergedAt);
  const events = prEvents(entries, slug, n);
  const visits = shipTrack(entries, slug, n, end).visits;
  const opener = prOpener(entries, slug, n);

  const named = (entry: LedgerEntry) => entry.meta?.['pr'] === n && String(entry.meta['repo']).toLowerCase() === slug.toLowerCase();
  const asks = events.filter((entry) => entry.kind === 'ask');
  const asksToMe = asks.filter((ask) => ask.to !== undefined && toMe(ask.to) && named(ask)).map((ask) => windowOf(ask, entries, end));
  const mergeAsks = asks
    .filter((ask) => ask.from === 'shipper' && ask.meta?.['kind'] === 'permission' && ask.meta['tool'] === 'Bash')
    .map((ask) => windowOf(ask, entries, end));

  const bars = ciBars(timeline.runs, end);
  const holds = holdIntervals(events, entries, slug, n, opener, start, end);
  const flaps = flapHistory({ timeline, bars, visits, asksToMe, mergeAsks, mine, end });
  const buckets = timeBuckets({
    start, end, visits, holds, flaps, bars, youWindows: [...asksToMe, ...mergeAsks], draftAt: (p) => draftAt(timeline, p), opener,
  });
  const stagePosts = events.filter((entry) => entry.from === 'shipper' && entry.kind === 'post' && typeof entry.meta?.['stage'] === 'string');

  return {
    start, end, merged, flaps, bars, holds, buckets,
    commits: timeline.commits.map((c) => ({ at: Date.parse(c.at), oid: c.oid, url: c.url })),
    reviews: reviewMarks(timeline, entries, events),
    comments: timeline.comments.map((c) => ({ at: Date.parse(c.at), author: firstName(c.author), url: c.url })),
    sentence: timeSentence(buckets, bars),
    flapEvents: flaps.map((span) => stagePosts.find((post) => post.ts >= span.from && post.ts < span.to)?.id ?? null),
  };
}
