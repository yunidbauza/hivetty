import { describe, expect, it } from 'vitest';

import { buildTimeline, ciBars, flapHistory, fraction, holdIntervals, MIN, ticks, timeBuckets, timeSentence } from '@lib/pr-timeline';
import type { Bucket, BucketName, CiBar, Hold } from '@lib/pr-timeline';
import type { PrTimeline, PrTimelineRun } from '@shared/github-contract';
import type { LedgerEntry } from '@shared/ledger-contract';
import type { ShipVisit } from '@shared/ledger-derive';

const T0 = new Date(2026, 9, 3, 11, 0).getTime();

describe('fraction', () => {
  it('places a time on the axis, clamped', () => {
    expect(fraction(T0 + 95 * MIN, T0, T0 + 190 * MIN)).toBe(0.5);
    expect(fraction(T0 - MIN, T0, T0 + 10 * MIN)).toBe(0);
    expect(fraction(T0 + 20 * MIN, T0, T0 + 10 * MIN)).toBe(1);
    expect(fraction(T0, T0, T0)).toBe(0);
  });
});

describe('ticks', () => {
  it('a 10-minute PR ticks every few minutes, HH:MM, never touching', () => {
    const out = ticks(T0, T0 + 10 * MIN, 900);
    expect(out[0]).toMatchObject({ at: T0, f: 0, label: '11:00' });
    expect(out.map((t) => t.label)).toEqual(['11:00', '11:05', '11:10']);
  });
  it('the design PR (3h10m at ~900px) ticks every 30 minutes', () => {
    expect(ticks(T0, T0 + 190 * MIN, 900).map((t) => t.label)).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00']);
  });
  it('a 3-day PR widens the step and names the day', () => {
    const out = ticks(T0, T0 + 3 * 24 * 60 * MIN, 900);
    const gaps = out.slice(1).map((t, i) => (t.f - out[i]!.f) * 900);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(56);
    expect(out[0]?.label).toBe('Sat 11:00');
  });
  it('a 30-day PR never crowds its labels, narrow or wide (HIVE-225)', () => {
    for (const width of [400, 1200]) {
      const out = ticks(T0, T0 + 30 * 24 * 60 * MIN, width);
      const gaps = out.slice(1).map((t, i) => (t.f - out[i]!.f) * width);
      expect(out.length).toBeGreaterThan(1);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(72);
    }
  });
});

describe('ticks on a multi-week axis', () => {
  it('dates the ticks past a week, so no two read alike', () => {
    const labels = ticks(T0, T0 + 30 * 24 * 60 * MIN, 1200).map((t) => t.label);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toBe('Oct 3');
  });
});

describe('ciBars', () => {
  const run = (over: Partial<PrTimelineRun>): PrTimelineRun => ({ id: 1, number: 2198, url: 'u', sha: 'abc', workflow: 'CI',
    startedAt: new Date(T0 + 61 * MIN).toISOString(), endedAt: new Date(T0 + 72 * MIN).toISOString(), state: 'passed', failedJobs: [], ...over });
  it('draws passed, failed and running runs oldest first, the running one to now, skipped ones not at all', () => {
    const bars = ciBars([
      run({ id: 3, startedAt: new Date(T0 + 186 * MIN).toISOString(), endedAt: null, state: 'running' }),
      run({ id: 1 }),
      run({ id: 2, state: 'failed', failedJobs: ['integration'], startedAt: new Date(T0 + 141 * MIN).toISOString(), endedAt: new Date(T0 + 150 * MIN).toISOString() }),
      run({ id: 4, state: 'other' }),
    ], T0 + 190 * MIN);
    expect(bars.map((b) => [b.id, b.state, (b.to - b.from) / MIN])).toEqual([[1, 'passed', 11], [2, 'failed', 9], [3, 'running', 4]]);
    expect(bars[1]?.failedJobs).toEqual(['integration']);
  });
});

describe('holdIntervals', () => {
  const slug = 'acme/server';
  const e = (id: string, m: number, over: Partial<LedgerEntry>): LedgerEntry => ({ id, ts: T0 + m * MIN, from: 'shipper', kind: 'post', body: '', ...over });
  const intake = e('i', 4, { from: 'builder', kind: 'ask', to: 'shipper', meta: { pr: 1182, repo: slug, stage: 'intake' } });
  const claim = e('c', 4, { kind: 'claim', meta: { task: 'acme/server#1182' } });
  const toAcr = e('a1', 6, { kind: 'ask', to: 'acr', body: 'https://github.com/acme/server/pull/1182 --self' });
  const acrAnswer = e('a1r', 34, { from: 'acr', kind: 'answer', thread: 'a1', to: 'shipper' });
  const toFixer = e('f1', 34, { kind: 'ask', to: 'fixer', body: 'acme/server#1182 findings' });
  const fixerAnswer = e('f1r', 60, { from: 'fixer', kind: 'answer', thread: 'f1', to: 'shipper' });
  const toFixer2 = e('f2', 110, { kind: 'ask', to: 'fixer', body: 'acme/server#1182 findings' });
  const events = [intake, claim, toAcr, toFixer, toFixer2];
  const all = [...events, acrAnswer, fixerAnswer];

  it('the opener, then the shipper, acr and fixer while asked, the open ask to now', () => {
    const holds = holdIntervals(events, all, slug, 1182, 'builder', T0, T0 + 190 * MIN);
    expect(holds.map((h) => [h.who, (h.from - T0) / MIN, (h.to - T0) / MIN])).toEqual([
      ['builder', 0, 4], ['shipper', 4, 6], ['acr', 6, 34], ['fixer', 34, 60], ['shipper', 60, 110], ['fixer', 110, 190],
    ]);
    expect(holds.find((h) => h.who === 'acr')?.firstEventId).toBe('a1');
  });

  it('ends at the release, and is empty with no opener and no shipper', () => {
    const release = e('r', 120, { kind: 'release', meta: { task: 'acme/server#1182' } });
    const holds = holdIntervals([...events, release], [...all, release], slug, 1182, 'builder', T0, T0 + 190 * MIN);
    expect(holds.at(-1)).toMatchObject({ who: 'fixer', to: T0 + 120 * MIN });
    expect(holdIntervals([], [], slug, 1182, null, T0, T0 + 10 * MIN)).toEqual([]);
  });
});

describe('flapHistory', () => {
  const at = (m: number) => new Date(T0 + m * MIN).toISOString();
  const timeline: PrTimeline = { createdAt: at(0), mergedAt: null, isDraft: false, commits: [], runs: [], reviews: [], comments: [],
    events: [{ kind: 'ready', at: at(60), actor: null }] };
  const v = (stage: ShipVisit['stage'], from: number, to: number | null): ShipVisit => ({ stage, from: T0 + from * MIN, to: to === null ? null : T0 + to * MIN, holder: null });
  const bar = (from: number, to: number, state: CiBar['state']): CiBar => ({ id: from, number: from, sha: 's', url: 'u', from: T0 + from * MIN, to: T0 + to * MIN, state, failedJobs: [] });

  it('replays hatchStatus at each change point: LARVA, COCOONING, INCUBATING, MUTATING, SUMMONS, MUTATING', () => {
    const spans = flapHistory({
      timeline, bars: [bar(61, 72, 'passed')],
      visits: [v('intake', 4, 6), v('self-review', 6, 34), v('fix-self', 34, 60), v('ready', 60, 61), v('ci', 61, 110), v('findings', 110, null)],
      asksToMe: [{ from: T0 + 150 * MIN, to: T0 + 157 * MIN }], mergeAsks: [], mine: true, end: T0 + 190 * MIN,
    });
    expect(spans.map((s) => [s.flap, (s.from - T0) / MIN, (s.to - T0) / MIN])).toEqual([
      ['LARVA', 0, 4], ['COCOONING', 4, 60], ['INCUBATING', 60, 110], ['MUTATING', 110, 150], ['SUMMONS', 150, 157], ['MUTATING', 157, 190],
    ]);
    expect(spans[0]?.tone).toBe('muted');
  });

  it('a PR nobody held: draft LARVA, then BURROWED, HATCHED from the merge', () => {
    const spans = flapHistory({
      timeline: { ...timeline, mergedAt: at(100), events: [{ kind: 'ready', at: at(20), actor: null }, { kind: 'merged', at: at(100), actor: null }] },
      bars: [], visits: [], asksToMe: [], mergeAsks: [], mine: false, end: T0 + 100 * MIN,
    });
    expect(spans.map((s) => s.flap)).toEqual(['LARVA', 'BURROWED']);
  });
});

describe('timeBuckets', () => {
  const v = (stage: ShipVisit['stage'], from: number, to: number | null): ShipVisit => ({ stage, from: T0 + from * MIN, to: to === null ? null : T0 + to * MIN, holder: null });
  const h = (who: string, from: number, to: number): Hold => ({ who, from: T0 + from * MIN, to: T0 + to * MIN, firstEventId: null });
  const sum = (bs: Bucket[]) => bs.reduce((s, b) => s + b.ms, 0);

  it('buckets the design PR and sums to its age', () => {
    const out = timeBuckets({
      start: T0, end: T0 + 190 * MIN, opener: 'builder', draftAt: () => false, bars: [],
      visits: [v('intake', 4, 6), v('self-review', 6, 34), v('fix-self', 34, 60), v('ready', 60, 61), v('ci', 61, 110), v('findings', 110, null)],
      holds: [h('builder', 0, 4), h('shipper', 4, 6), h('acr', 6, 34), h('fixer', 34, 60), h('shipper', 60, 110), h('fixer', 110, 190)],
      flaps: [{ flap: 'SUMMONS', tone: 'amber', from: T0 + 150 * MIN, to: T0 + 157 * MIN, github: '' }],
      youWindows: [{ from: T0 + 150 * MIN, to: T0 + 157 * MIN }],
    });
    expect(out.map((b) => [b.name, b.ms / MIN, b.holder])).toEqual([
      ['Before the shipper', 4, 'builder'], ['Self review and fix', 56, 'acr'], ['CI', 50, 'shipper'], ['Findings', 80, 'fixer'],
    ]);
    expect(sum(out)).toBe(190 * MIN);
  });

  it('a PR the shipper never held: draft, CI, waiting on review', () => {
    const bar: CiBar = { id: 1, number: 1, sha: 's', url: 'u', from: T0 + 20 * MIN, to: T0 + 30 * MIN, state: 'passed', failedJobs: [] };
    const out = timeBuckets({ start: T0, end: T0 + 100 * MIN, opener: null, draftAt: (p) => p < T0 + 20 * MIN, bars: [bar], visits: [], holds: [], flaps: [], youWindows: [] });
    expect(out.map((b) => [b.name, b.ms / MIN])).toEqual([['Before the shipper', 20], ['CI', 10], ['Waiting on review', 70]]);
    expect(sum(out)).toBe(100 * MIN);
  });
});

describe('timeSentence', () => {
  const b = (name: BucketName, m: number, holder: string | null): Bucket => ({ name, ms: m * MIN, holder });
  const failed = (job: string): CiBar => ({ id: 1, number: 1, sha: 's', url: 'u', from: 0, to: 1, state: 'failed', failedJobs: [job] });
  it('names the longest wait and a repeated failure', () => {
    expect(timeSentence([b('Self review and fix', 56, 'acr'), b('Findings', 80, 'fixer')], [failed('integration'), failed('integration'), failed('lint')]))
      .toBe("The longest wait was the fixer on acr's findings, and two CI runs failed on the same job, integration. Every mark opens its event in the conversation.");
  });
  it('a PR the shipper never held, one failure', () => {
    expect(timeSentence([b('CI', 10, null), b('Waiting on review', 70, null)], [failed('unit')]))
      .toBe('The longest wait was the reviewers. Every mark opens its event in the conversation.');
  });
  it('nothing to say yet', () => {
    expect(timeSentence([], [])).toBe('Every mark opens its event in the conversation.');
  });
});

describe('buildTimeline', () => {
  const slug = 'acme/server';
  const pr = { pr: 1182, repo: slug };
  const at = (m: number) => new Date(T0 + m * MIN).toISOString();
  const e = (id: string, m: number, over: Partial<LedgerEntry>): LedgerEntry => ({ id, ts: T0 + m * MIN, from: 'shipper', kind: 'post', body: '', ...over });
  const stage = (id: string, m: number, name: string) => e(id, m, { meta: { ...pr, stage: name } });
  const entries: LedgerEntry[] = [
    e('i', 4, { from: 'builder', kind: 'ask', to: 'shipper', meta: { ...pr, stage: 'intake' } }),
    e('c', 4, { kind: 'claim', meta: { task: 'acme/server#1182' } }),
    stage('s-intake', 4, 'intake'),
    stage('s-self', 6, 'self-review'),
    e('a1', 6, { kind: 'ask', to: 'acr', body: 'https://github.com/acme/server/pull/1182 --self' }),
    e('a1r', 34, { from: 'acr', kind: 'answer', thread: 'a1', to: 'shipper', body: 'self review of acme/server#1182: clean', meta: { mode: 'self', findings: 0 } }),
    stage('s-fix', 34, 'fix-self'),
    e('f1', 34, { kind: 'ask', to: 'fixer', body: 'acme/server#1182 findings' }),
    e('f1r', 60, { from: 'fixer', kind: 'answer', thread: 'f1', to: 'shipper' }),
    stage('s-ready', 60, 'ready'),
    stage('s-ci', 61, 'ci'),
    stage('s-findings', 110, 'findings'),
    e('f2', 110, { kind: 'ask', to: 'fixer', body: 'acme/server#1182 findings' }),
    e('a2r', 140, { from: 'acr', kind: 'answer', thread: 'a2', to: 'shipper', meta: { review_url: 'R1', findings: 3 } }),
  ];
  const timeline: PrTimeline = {
    createdAt: at(0), mergedAt: null, isDraft: false,
    commits: [{ oid: 'abc', at: at(1), url: 'C1' }],
    runs: [{ id: 1, number: 1, url: 'u', sha: 'abc', workflow: 'CI', startedAt: at(61), endedAt: at(72), state: 'passed', failedJobs: [] }],
    reviews: [{ at: at(140), author: 'acr-bot', state: 'COMMENTED', url: 'R1' }, { at: at(141), author: null, state: 'PENDING', url: 'R2' }],
    comments: [{ at: at(150), author: 'maria-k', url: 'K1' }],
    events: [{ kind: 'ready', at: at(60), actor: null }],
  };

  it('composes the design PR: flaps, holds, reviews, comments, buckets and the sentence', () => {
    const model = buildTimeline({ timeline, entries, slug, n: 1182, mine: true, toMe: (to) => to === 'overmind', now: T0 + 190 * MIN });
    expect(model.end).toBe(T0 + 190 * MIN);
    expect(model.merged).toBe(false);
    expect(model.flaps.map((f) => f.flap)).toEqual(['LARVA', 'COCOONING', 'INCUBATING', 'MUTATING']);
    expect(model.holds.map((h) => h.who)).toEqual(['builder', 'shipper', 'acr', 'fixer', 'shipper', 'fixer']);
    expect(model.reviews.map((r) => [r.label, r.amber, r.target.kind])).toEqual([['acr · self review', false, 'ledger'], ['acr · 3 findings', true, 'github']]);
    expect(model.comments[0]?.author).toBe('Maria');
    expect(model.commits).toEqual([{ at: T0 + MIN, oid: 'abc', url: 'C1' }]);
    expect(model.buckets.reduce((s, b) => s + b.ms, 0)).toBe(190 * MIN);
    expect(model.sentence).toMatch(/^The longest wait was the fixer on acr's findings\./);
    expect(model.flapEvents[0]).toBeNull();
    expect(model.flapEvents[1]).toBe('s-intake');
  });

  it('asks to you and the merge card are SUMMONS, and are waiting on you', () => {
    const ask = e('q', 120, { kind: 'ask', to: 'overmind', meta: { ...pr } });
    const answer = e('qr', 130, { from: 'overmind', kind: 'answer', thread: 'q' });
    const merge = e('m', 170, { kind: 'ask', to: 'overmind', body: 'gh pr merge 1182 --repo acme/server', meta: { ...pr, kind: 'permission', tool: 'Bash' } });
    const model = buildTimeline({ timeline, entries: [...entries.slice(0, 11), ask, answer, merge], slug, n: 1182, mine: true, toMe: (to) => to === 'overmind', now: T0 + 190 * MIN });
    expect(model.flaps.filter((f) => f.flap === 'SUMMONS').map((f) => [(f.from - T0) / MIN, (f.to - T0) / MIN])).toEqual([[120, 130], [170, 190]]);
  });

  it('an ask closed by done, failed or the overmind\'s expiry stops waiting there, as an answer would', () => {
    const waits = (close: LedgerEntry) => {
      const ask = e('q', 120, { kind: 'ask', to: 'overmind', meta: { ...pr } });
      const model = buildTimeline({ timeline, entries: [...entries.slice(0, 11), ask, close], slug, n: 1182, mine: true, toMe: (to) => to === 'overmind', now: T0 + 190 * MIN });
      return model.flaps.filter((f) => f.flap === 'SUMMONS').map((f) => [(f.from - T0) / MIN, (f.to - T0) / MIN]);
    };
    expect(waits(e('d', 130, { from: 'shipper', kind: 'done', thread: 'q' }))).toEqual([[120, 130]]);
    expect(waits(e('x', 135, { from: 'shipper', kind: 'failed', thread: 'q' }))).toEqual([[120, 135]]);
    expect(waits(e('ex', 140, { from: 'overmind', kind: 'event', meta: { expired: 'q' } }))).toEqual([[120, 140]]);
    expect(waits(e('fx', 140, { from: 'builder', kind: 'event', meta: { expired: 'q' } }))).toEqual([[120, 190]]);
  });

  it('labels other reviews by author and state, amber on changes requested', () => {
    const reviews = [{ at: at(10), author: 'maria-k', state: 'CHANGES_REQUESTED', url: 'R3' }, { at: at(5), author: null, state: 'APPROVED', url: 'R4' },
      { at: at(6), author: 'x', state: 'DISMISSED', url: 'R5' }];
    const model = buildTimeline({ timeline: { ...timeline, reviews, comments: [{ at: at(1), author: null, url: 'K' }] }, entries: [], slug, n: 1182, mine: false, toMe: () => false, now: T0 + 20 * MIN });
    expect(model.reviews.map((r) => [r.label, r.amber])).toEqual([['someone · approved', false], ['maria-k · changes requested', true]]);
    expect(model.comments[0]?.author).toBe('Someone');
  });

  it('a merged PR ends at its merge', () => {
    const model = buildTimeline({ timeline: { ...timeline, mergedAt: at(100) }, entries: [], slug, n: 1182, mine: false, toMe: () => false, now: T0 + 500 * MIN });
    expect(model.end).toBe(T0 + 100 * MIN);
    expect(model.merged).toBe(true);
  });
});
