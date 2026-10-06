import type {
  JiraComment,
  JiraIssueDetail,
  JiraLink,
  JiraStatusCategory,
  JiraTransition,
} from '@shared/jira-contract';
import type { LedgerEntry } from '@shared/ledger-contract';

/**
 * One work item.
 *
 * `status` was a closed union of four literals until HIVE-69, and that was a
 * fixture artifact: real Jira statuses are per-workflow and arbitrary — a
 * project can have "Blocked", "In QA", "Awaiting deploy" — so mapping them onto
 * four literals meant either dropping information or lying about it.
 *
 * The pair that replaces it is the whole idea: **the name is displayed verbatim
 * and the colour comes from the category**, so the app shows what Jira shows and
 * no mapping table has to be maintained as workflows change.
 */
export interface Ticket {
  key: string; // 'GRAC-3018'
  /** The status as Jira names it. Displayed verbatim, never matched against. */
  status: string;
  /**
   * Jira's own three-bucket categorisation. Drives colour and grouping.
   *
   * Reused from the IPC contract rather than redeclared, so there is one
   * definition of the three buckets and a mapped issue converts without a cast.
   */
  statusCategory: JiraStatusCategory;
  title: string;
  /** Jira's priority name; `null` on a project without a scheme (HIVE-203). */
  priority: string | null;
  /** Display name; `null` when unassigned (HIVE-203). */
  assignee: string | null;
  /** Jira's issue type name, "Bug", "Story" (HIVE-202). Absent on fixtures. */
  issueType?: string;
  /*
    There is deliberately no `sessions` array here (HIVE-73).

    It existed until the link became real, and it could not have survived it:
    `hydrateTickets` replaces this whole list on every WORK-panel open, so a
    list of session ids stored on the ticket would be wiped by the next
    refresh. The key lives on the *session* instead — `Session.ticket` — and
    the reverse direction is `useTicketSessions(key)`, a selector over the
    entities map. Derived, never stored, exactly one source of truth.

    A block comment rather than a doc comment on purpose: a doc comment here
    has no member to document and would attach itself to `url` below.
  */
  /**
   * The Jira browse URL. Absent for fixtures, present for real issues.
   *
   * Built in main, because only main knows the site.
   */
  url?: string;
}

/** The parent epic's children, done of total (HIVE-202). */
export interface EpicProgress {
  done: number;
  total: number;
  /** The search hit JIRA_MAX_ISSUES: the total is a floor. */
  capped: boolean;
}

/** What a reader of a ticket wants beside the common parts (HIVE-202): the page wants its ledger history, the Ticket tab its links. */
export type TicketDetailWant = 'page' | 'tab';

/**
 * One entry per ticket read, keyed by issue key (HIVE-203, HIVE-202).
 *
 * Every part is optional because each read merges on its own as it lands: one
 * failed read never blanks another, and a part read before stays on screen with
 * its problem beside it rather than vanishing.
 */
export interface TicketDetail {
  key: string;
  /** Read with jira:issue only when the key is not in the list. */
  issue?: Ticket;
  detail?: JiraIssueDetail;
  /** The newest JIRA_MAX_COMMENTS, oldest first. */
  comments?: JiraComment[];
  /** How many comments the thread holds, read or not. */
  total?: number;
  transitions?: JiraTransition[];
  /** ledger:list { ticket } on open; the tail covers what arrives after. */
  history?: LedgerEntry[];
  /** When the detail or comments last read successfully (ms). */
  readAt?: number;
  /** jira:links, for the Ticket tab (HIVE-202). */
  links?: JiraLink[];
  /** For each ticket this one blocks: its own outward Blocks links. Read only at ≤ SECOND_HOP_MAX_LINKS issue links. */
  secondHop?: Record<string, JiraLink[]>;
  /** The parent epic's children, done of total (HIVE-202). */
  epicProgress?: EpicProgress;
  problems: { detail?: string; comments?: string; links?: string };
}

/** The ticket page's key/value column, derived (HIVE-203). Absent keys have no row. */
export interface TicketProperties {
  status: string;
  /** The title's `[Pn]` tag, else Jira's priority. */
  priority?: string;
  /** The title's `[BE]`/`[FE]` tag. */
  side?: string;
  /** The first live session's project. */
  project?: string;
  /** `Unassigned` when Jira has nobody. */
  assignee: string;
  /** Whoever posted the latest progress on the ticket. */
  agent?: string;
  /** The parent's key, once the detail has been read. */
  epic?: string;
}
