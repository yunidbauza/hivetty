import { describe, expect, it } from 'vitest';

import { bandStops, stopTitle } from '@features/pull-requests/ship-band';
import { SHIP_STOPS, type ShipStop, type ShipTrack } from '@shared/ledger-derive';

const stop = (
  stage: ShipStop['stage'],
  spentMs = 0,
  holder: string | null = null,
  firstAt: number | null = spentMs ? 1 : null,
): ShipStop => ({ stage, firstAt, spentMs, holder });
const track = (current: ShipStop['stage'] | null, held = current !== null): ShipTrack => {
  const stops = SHIP_STOPS.map((s) => stop(s, s === current ? 4_800_000 : 60_000, s === 'self-review' ? 'acr' : 'shipper'));
  return { held, current: stops.find((s) => s.stage === current) ?? null, stops, visits: [] };
};
const none: ShipTrack = { held: false, current: null, stops: SHIP_STOPS.map((s) => stop(s)), visits: [] };
const states = (stops: ReturnType<typeof bandStops>) => stops.map((s) => `${s.label}:${s.state}`);

describe('bandStops', () => {
  it('ticks the stops before the held one, glows it, leaves the rest next', () => {
    expect(states(bandStops({ state: 'open' }, track('findings')))).toEqual([
      'Intake:done',
      'Self review:done',
      'Fix:done',
      'Ready:done',
      'CI:done',
      'Findings:now',
      'Approval:next',
      'Merge:next',
    ]);
  });

  it('moves the glow back with the stage', () => {
    expect(bandStops({ state: 'open' }, track('findings')).find((s) => s.state === 'now')?.spentMs).toBe(4_800_000);
  });

  it('gives a PR nobody holds the short track from its state', () => {
    expect(states(bandStops({ state: 'draft' }, none))).toEqual(['Draft:now', 'Open:next', 'Review:next', 'Merge:next']);
    expect(states(bandStops({ state: 'open' }, none))).toEqual(['Draft:done', 'Open:done', 'Review:now', 'Merge:next']);
    expect(states(bandStops({ state: 'approved' }, none))).toEqual(['Draft:done', 'Open:done', 'Review:done', 'Merge:now']);
  });

  it('ticks every stop of a merged PR, long when the shipper held it, short otherwise', () => {
    expect(bandStops({ state: 'merged' }, { ...track('merge'), held: false, current: null }).every((s) => s.state === 'done')).toBe(true);
    expect(bandStops({ state: 'merged' }, { ...track('merge'), held: false, current: null })).toHaveLength(8);
    expect(states(bandStops({ state: 'merged' }, none))).toEqual(['Draft:done', 'Open:done', 'Review:done', 'Merge:done']);
  });

  it('titles a stop with its time and holder', () => {
    const selfReview = bandStops({ state: 'open' }, track('findings'))[1]!;
    expect(stopTitle(selfReview)).toBe('Self review · 1m 0s · acr');
    expect(stopTitle(bandStops({ state: 'draft' }, none)[0]!)).toBe('Draft');
  });
});
