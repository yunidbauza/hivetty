import { formatDuration } from '@/lib/format-duration';
import type { Pr } from '@/types/pull-request';

import { SHIP_STOPS, type ShipStopName, type ShipTrack } from '@shared/ledger-derive';

export type StopState = 'done' | 'now' | 'next';

export interface BandStop {
  key: string;
  label: string;
  state: StopState;
  /** Summed over every visit; `null` on the short track, which has no times. */
  spentMs: number | null;
  holder: string | null;
}

const LABEL: Record<ShipStopName, string> = {
  intake: 'Intake',
  'self-review': 'Self review',
  'fix-self': 'Fix',
  ready: 'Ready',
  ci: 'CI',
  findings: 'Findings',
  approval: 'Approval',
  merge: 'Merge',
};

const SHORT = ['Draft', 'Open', 'Review', 'Merge'] as const;
/** Where GitHub's state alone puts a PR on the short track (D10); merged sits past the end. */
const SHORT_AT: Record<Pr['state'], number> = { draft: 0, open: 2, approved: 3, merged: SHORT.length };

const stateAt = (i: number, at: number): StopState => (i < at ? 'done' : i === at ? 'now' : 'next');

/**
 * The slim ship track's stops (HIVE-205, D10). Held: the shipper's eight, by
 * where it is now, so a step back moves the glow back. Merged after a shipper
 * ran it: all eight ticked. Anything else: the short track from GitHub's state.
 */
export function bandStops(pr: Pick<Pr, 'state'>, track: ShipTrack): BandStop[] {
  const shipped = track.stops.some((s) => s.firstAt !== null);
  const long = (at: number): BandStop[] =>
    track.stops.map((s, i) => ({
      key: s.stage,
      label: LABEL[s.stage],
      state: stateAt(i, at),
      spentMs: s.spentMs,
      holder: s.holder,
    }));

  if (pr.state === 'merged' && shipped) return long(SHIP_STOPS.length);
  if (pr.state !== 'merged' && track.held && track.current !== null) return long(SHIP_STOPS.indexOf(track.current.stage));

  const at = SHORT_AT[pr.state];
  return SHORT.map((label, i) => ({ key: label.toLowerCase(), label, state: stateAt(i, at), spentMs: null, holder: null }));
}

/** The hover: "Self review · 28m 3s · acr". */
export function stopTitle(stop: BandStop): string {
  return [stop.label, stop.spentMs === null ? null : formatDuration(stop.spentMs), stop.holder].filter(Boolean).join(' · ');
}
