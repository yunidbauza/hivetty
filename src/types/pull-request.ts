export type PrListState = 'open' | 'approved' | 'draft' | 'merged';
type PrChecks = 'passing' | 'running' | 'failing';

/**
 * A pull request as shown in the PRs panel.
 *
 * `state` is wider than `Session['pr'].state`: the panel distinguishes
 * `approved` from `open`, while a session only tracks whether its PR exists and
 * whether it has landed.
 *
 * The fields come from GitHub through `PrRecord`, except `session` — see below.
 */
export interface Pr {
  n: number;
  /** The short name, what the card shows: `the-hive`, not `owner/the-hive`. */
  repo: string;
  /** The owner, so two repos with one short name never share a ledger reading (HIVE-171). */
  owner: string;
  title: string;
  state: PrListState;
  findings: number;
  checks: PrChecks;
  /** The GitHub page. Every surface that opens a PR externally opens this. */
  url: string;
  /** `headRefName`. The only thing a session is matched on. */
  branch: string;
  /** ISO 8601 from GitHub. Orders the Hatchery within a flap (HIVE-215). */
  updatedAt: string;
  /** ISO 8601, `null` until merged. The HATCHED time and the merged order (HIVE-215). */
  mergedAt: string | null;
  /** The token's owner wrote it. Only a PR of yours can read SUMMONS (HIVE-215). */
  mine: boolean;
  /**
   * The session that owns it, or `null` when no live session is on that branch.
   *
   * **Resolved, never stored.** Main has no idea what a session is, so this is
   * computed by `usePrs()` from a branch match against the fleet. `null` is the
   * ordinary case for a PR raised outside the app, or one whose session has
   * ended — and it is why every surface has a fallback action rather than
   * assuming there is a tab to open.
   */
  session: string | null;
}

/**
 * A PR as reached through a Jira ticket (story 032).
 *
 * Distinct from `Pr` because it is *resolved*, not stored, and because the
 * ticket row shows less: no title, since the ticket above it already says what
 * the work is.
 *
 * It used to be resolved from `Session.pr` — a field nothing ever set, which is
 * why the section was permanently empty. It now comes from the live PR list,
 * matched to the ticket by branch and then by key; see `resolveTicketPrs`.
 */
export interface TicketPr {
  n: number;
  repo: string;
  state: PrListState;
  findings: number;
  url: string;
  /** Owning session id, for `openEntity` — `null` when nothing matched. */
  session: string | null;
}

/**
 * The pull request a fleet row points at (HIVE-100).
 *
 * The third of these resolved shapes, and the smallest: a 34px column has room
 * for `#123` and nothing else, so it carries the number, the colour rule's
 * input, and the page to open. Findings and checks are deliberately absent —
 * they have no glyph that fits, and the PRs panel exists to show them.
 *
 * **Resolved from the live list first, and only then from the session.**
 * `Session.pr` was the obvious place for this and is the reason the column was
 * empty for as long as it existed: nothing ever wrote that field, on any code
 * path, and the fixtures made the emptiness look like an absence of pull
 * requests rather than an absence of a writer. `TicketPr` above records the
 * same discovery.
 *
 * Resolving live fixed it for *this week's* work and left the rest of the
 * column empty, because the sweep is open PRs plus 24 hours of merges: a row
 * whose PR landed on Tuesday matched nothing on Thursday. `Session.lastPr` is
 * the answer to that — a PR the app saw and wrote down, offered only when the
 * live list has nothing, and marked as remembered by the absence of `state`.
 */
export interface SessionPr {
  n: number;
  /**
   * The live state — **absent when this is a remembered PR** rather than one
   * the current sweep can see.
   *
   * The optionality is the whole honesty of the fallback. `Session.lastPr` is
   * written down when a sweep resolves it and is never revisited, so by the
   * time it is being read the PR may have been approved, merged or closed. A
   * state carried across that gap would be a claim nothing stands behind — and
   * because state is rendered as a *colour*, it would be the most confident
   * thing in the cell.
   *
   * So a remembered PR arrives here without one, and both surfaces render it
   * neutral and say "last seen" in the words a screen reader gets. Present
   * means the sweep matched this branch a moment ago and the colour is earned.
   */
  state?: PrListState;
  /** The GitHub page. What the `#123` link opens. */
  url: string;
}

/** The swarm's word for what is happening to a PR (HIVE-215). */
export type Flap =
  | 'LARVA' | 'COCOONING' | 'INCUBATING' | 'MUTATING' | 'BURROWED' | 'HATCHING' | 'SUMMONS' | 'HATCHED';

/** One per `--cc-*` token: grey a draft or parked, green moving, amber needs you, brand merged. */
export type FlapTone = 'muted' | 'green' | 'amber' | 'brand';

/** What `hatchStatus` reads from the ledger, besides the PR itself. */
export interface HatchFacts {
  /** `shipStage(...)`: the shipper's stage, `null` when nobody holds the PR. */
  stage: string | null;
  /** An open ask to you names it. */
  askedMe: boolean;
  /** Its merge waits on your card. */
  mergeWaiting: boolean;
}

/** A PR's hatch status (HIVE-215): the one rule HIVE-205, HIVE-200 and HIVE-209 read. */
export interface HatchStatus {
  flap: Flap;
  /** HATCHED only: `HH:MM`, local, 24-hour. */
  at?: string;
  tone: FlapTone;
  /** GitHub's words: the state and one reason. The tooltip and accessible text. */
  github: string;
  /** The Hatchery's order: SUMMONS 0 … LARVA 6, HATCHED 7. */
  rank: number;
  /** Exactly `flap === 'SUMMONS'`. */
  needsYou: boolean;
}

/** One Hatchery row. */
export interface HatcheryRow {
  pr: Pr;
  hatch: HatchStatus;
}
