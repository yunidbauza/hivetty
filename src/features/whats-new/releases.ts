/** Which corner piece a slide draws (`pieces.ts`). */
export type PieceKind = 'comb' | 'ticket' | 'pr';

export interface WhatsNewSlide {
  piece: PieceKind;
  title: string;
  body: string;
  points: readonly string[];
}

export interface WhatsNew {
  /** `major.minor`; patches never get an entry of their own. */
  version: string;
  slides: readonly WhatsNewSlide[];
}

/**
 * What each release that earns a What's new screen says.
 *
 * Every major gets an entry (the release test fails a new `x.0` without one); a
 * minor gets one only when somebody writes it; a patch never does. Writing the
 * next one is adding an entry here: the slides are data, the dialog never
 * changes.
 */
export const RELEASES: readonly WhatsNew[] = [
  {
    version: '1.0',
    slides: [
      {
        piece: 'comb',
        title: 'Home is the comb',
        body: 'Every live session, terminal and agent is a cell, and each agent wears the icon you chose for it. The headline counts what needs you, and the cell that is waiting glows amber until you answer it.',
        points: [
          'Needs you, or While you were away when nothing does',
          'Coming up, and your usage limits',
          'Your open pull requests, under the comb',
        ],
      },
      {
        piece: 'ticket',
        title: 'Jira, from ticket to Done',
        body: 'Your assigned tickets live in Work, grouped In progress, To do and Done. Each row says the one thing that matters right now, like waiting on you or 2 findings on #412.',
        points: [
          'Start a session straight from a ticket',
          'The ticket page, and a Ticket tab beside the session',
          'Moves to Done when its pull request merges',
        ],
      },
      {
        piece: 'pr',
        title: 'Pull requests, without leaving',
        body: 'Your open pull requests, and the ones merged in the last day, with their conversation, files and checks on the stage. The session whose branch made it is one click away.',
        points: [
          'The last eight pushes’ checks, as squares',
          'Review threads you can answer in place',
          'No GitHub token stored: gh runs as you',
        ],
      },
    ],
  },
];

/** `1.0.3` → `1.0`: entries are matched on major.minor, so a patch shows its minor's screen. */
export function majorMinor(version: string): string {
  const [major = '0', minor = '0'] = version.split('-')[0]!.split('.');
  return `${major}.${minor}`;
}

/**
 * The entry to show at launch, or `null`.
 *
 * `seen` is the last version shown (any way it was closed counts); `off` is the
 * "Don't show What's new again" box; `fresh` is a first launch, where the
 * first-run page is the tour and nothing has changed for this person yet.
 */
export function whatsNewFor(
  current: string,
  state: { seen: string | null; off: boolean; fresh: boolean },
): WhatsNew | null {
  if (state.off || state.fresh) return null;
  const entry = RELEASES.find((r) => r.version === majorMinor(current));
  return entry !== undefined && entry.version !== state.seen ? entry : null;
}

/** The newest entry, for reopening from Settings whatever the running version is. */
export const latestWhatsNew = (): WhatsNew => RELEASES[RELEASES.length - 1]!;
