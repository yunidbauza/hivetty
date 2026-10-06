/**
 * What a session started from a ticket does first (Settings › Jira › Ticket
 * workflow).
 *
 * Absent (`null` in `JiraConfig.workflow`) is "just open": the session starts
 * at an empty prompt, as it always has. Otherwise either a skill runs as the
 * session's first message, or the ticket is handed to one of the Hive's
 * agents. An agent is a headless `claude -p` run, never a terminal, so
 * "handing" it the ticket is a ledger ask: from the new session, which writes
 * it itself as its first message (`via: 'session'`), or from the overmind
 * instead of opening a session at all (`via: 'wake'`).
 *
 * No imports and no Node or DOM APIs: main validates the config file and the
 * IPC payload with {@link ticketWorkflowOf}, and the renderer builds the first
 * message with {@link ticketStart}, from this one module.
 */

export type TicketWorkflow =
  | {
      kind: 'skill';
      /** As typed in a session, without the slash: `hive:work-on`, `workstream:work-on`. */
      skill: string;
      /** Added after the key. May use `{key}`, `{title}`, `{type}` and `{url}`. */
      prompt?: string;
    }
  | {
      kind: 'agent';
      agent: string;
      via: 'session' | 'wake';
      prompt?: string;
    };

/** What a ticket offers the first message. Everything but the key is optional. */
export interface TicketFacts {
  key: string;
  title?: string;
  type?: string;
  url?: string;
}

/** What starting from a ticket does: type a first message (`''` for none), or wake an agent. */
export type TicketStart =
  | { kind: 'message'; text: string }
  | { kind: 'wake'; agent: string; body: string };

/** A skill as a session names it: a plugin namespace, then the skill. */
const SKILL = /^[a-z0-9][a-z0-9_-]*(:[a-z0-9][a-z0-9_-]*)?$/i;
/** An agent's name, as `agent-contract.ts` allows it. */
const AGENT = /^[a-z0-9][a-z0-9-]*$/;
const PROMPT_MAX = 1000;

/**
 * The workflow in `value`, or why it is not one.
 *
 * A string answer is the reason, for the config reader to report and the IPC
 * guard to throw. A prompt is one line: it is typed into a pty, where a
 * newline would submit early, so control characters are refused rather than
 * flattened behind the user's back.
 */
export function ticketWorkflowOf(value: unknown): TicketWorkflow | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'expected an object';
  const raw = value as Record<string, unknown>;

  let prompt: string | undefined;
  if (raw.prompt !== undefined) {
    if (typeof raw.prompt !== 'string') return 'prompt: expected a string';
    if ([...raw.prompt].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
      return 'prompt: one line, no control characters';
    }
    if (raw.prompt.length > PROMPT_MAX) return `prompt: at most ${String(PROMPT_MAX)} characters`;
    const trimmed = raw.prompt.trim();
    if (trimmed !== '') prompt = trimmed;
  }
  const extra = prompt === undefined ? {} : { prompt };

  if (raw.kind === 'skill') {
    if (!sameKeys(raw, ['kind', 'skill', 'prompt'])) return 'skill: unknown key';
    const skill = typeof raw.skill === 'string' ? raw.skill.trim().replace(/^\//, '') : '';
    if (!SKILL.test(skill)) return 'skill: expected a skill name like hive:work-on';
    return { kind: 'skill', skill, ...extra };
  }
  if (raw.kind === 'agent') {
    if (!sameKeys(raw, ['kind', 'agent', 'via', 'prompt'])) return 'agent: unknown key';
    if (typeof raw.agent !== 'string' || !AGENT.test(raw.agent)) return 'agent: expected an agent name';
    if (raw.via !== 'session' && raw.via !== 'wake') return 'via: expected "session" or "wake"';
    return { kind: 'agent', agent: raw.agent, via: raw.via, ...extra };
  }
  return 'kind: expected "skill" or "agent"';
}

const sameKeys = (raw: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(raw).every((key) => allowed.includes(key));

/** `{key}`, `{title}`, `{type}`, `{url}` filled from the ticket; one it lacks becomes empty. */
export function fillTicket(text: string, ticket: TicketFacts): string {
  return text
    .replace(/\{(key|title|type|url)\}/g, (_match, name: keyof TicketFacts) => ticket[name] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The job an agent is handed: the key and title, then the prompt. */
const jobFor = (ticket: TicketFacts, prompt: string | undefined): string =>
  [
    `Work ${ticket.key}${ticket.title === undefined ? '' : `: ${ticket.title}`}.`,
    prompt === undefined ? '' : fillTicket(prompt, ticket),
    ticket.url ?? '',
  ]
    .filter((part) => part !== '')
    .join(' ');

/** What starting a session from `ticket` does under `workflow` (`null`: just open). */
export function ticketStart(workflow: TicketWorkflow | null, ticket: TicketFacts): TicketStart {
  if (workflow === null) return { kind: 'message', text: '' };
  if (workflow.kind === 'skill') {
    const extra = workflow.prompt === undefined ? '' : fillTicket(workflow.prompt, ticket);
    return { kind: 'message', text: [`/${workflow.skill}`, ticket.key, extra].filter((p) => p !== '').join(' ') };
  }
  const job = jobFor(ticket, workflow.prompt);
  if (workflow.via === 'wake') return { kind: 'wake', agent: workflow.agent, body: job };
  return {
    kind: 'message',
    text: `Hand ${ticket.key} to the ${workflow.agent} agent: call ledger_ask with to "${workflow.agent}" and this body, then wait for its answer. ${job}`,
  };
}
