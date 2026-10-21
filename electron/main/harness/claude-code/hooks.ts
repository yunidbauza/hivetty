import { HOOK_MAX_BODY_BYTES } from '@shared/hook-contract';
import { isPlanFilePath, TASK_TOOL_NAMES, type PlanToolCall } from '@shared/plan-contract';

import type { HookEffect, HookInput, HookReading } from '../port';

import {
  CLEAR_REASON,
  HOOK_EVENTS,
  noticeSignal,
  toSignal,
  type HookEvent,
} from './hook-vocabulary';

/** Whether a string is one of the events the app subscribes to. */
const isHookEvent = (value: unknown): value is HookEvent =>
  typeof value === 'string' && (HOOK_EVENTS as readonly string[]).includes(value);

/**
 * The ids of the background **shells** a payload reports still running
 * (HIVE-90).
 *
 * Returns `undefined` when the payload carried no `background_tasks` key at
 * all, and an array — possibly empty — when it did. That distinction is the
 * whole contract; see {@link HookStatusEvent.backgroundShells} for why an
 * observed empty list and a silent body must not collapse into each other.
 *
 * ## `background_tasks` is a union, and that is why `type` is filtered
 *
 * The name suggests one kind of thing and it is two. Measured against 2.1.245,
 * a session whose only background work is a **subagent**:
 *
 * ```
 * Stop  background_tasks: [
 *   { id: 'a1bb2b63ce60a4e1c', type: 'subagent', status: 'running',
 *     agent_type: 'general-purpose', description: '…' }
 * ]
 * ```
 *
 * — the same array a backgrounded `Bash` puts a `type: 'shell'` entry in. So
 * an unfiltered read makes a live subagent arrive as a background shell, and
 * a session that has reported `idle (agents)` since HIVE-83 starts reporting
 * `idle (script)` about an agent. Subagents are tracked from `SubagentStart` /
 * `SubagentStop`, which is both a finer signal and a *fresher* one: the same
 * measurement shows a subagent still listed as `running` in the
 * `background_tasks` of its own `SubagentStop`, because the list is a snapshot
 * taken before the stop is applied. Shells are the half with no such pair —
 * no hook fires when a backgrounded process dies — which is exactly why this
 * list is worth reading for them and not for agents.
 *
 * `status === 'running'` is filtered for the obvious reason, and an entry with
 * no string `id` is dropped because ids are the only part of an entry this app
 * keeps.
 *
 * **What the `type` filter costs:** a third kind of background task, added in
 * some later release, is dropped here and a session running one would report a
 * plain `idle`. That is a real risk and the honest reading of it is that the
 * union has one member this app already tracks better and one it needs; a
 * member that does not exist yet cannot be assigned to `script` — which is a
 * *shell* — without repeating the subagent mistake in the other direction.
 *
 * So it is dropped and **said out loud**: `onUnknownType` fires for a running
 * entry of a kind this app has no reading for, and `createReceiver` turns that
 * into one warning per kind per launch. Without it the only thing that could
 * ever notice is `hook-conformance.test.ts`, which needs a real binary and an
 * opt-in environment variable — a silent wrong `idle` is exactly the failure
 * HIVE-90 exists to remove, and it should not be able to come back quietly.
 */
function liveBackgroundShellIds(
  value: unknown,
  onUnknownType: (type: string) => void,
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, type, status } = entry as {
      id?: unknown;
      type?: unknown;
      status?: unknown;
    };
    if (status !== 'running') continue;
    if (type !== 'shell') {
      /*
        `subagent` is a known member and tracked elsewhere, so it is dropped
        quietly. Anything else is news.
      */
      if (typeof type === 'string' && type !== '' && type !== 'subagent')
        onUnknownType(type);
      continue;
    }
    if (typeof id === 'string' && id !== '') ids.push(id);
  }
  return ids;
}

/**
 * Whether a payload's `background_tasks` lists work that keeps a headless
 * `claude -p` alive past its turn: a running workflow or subagent, anything
 * but a shell. Measured against 2.1.286, `-p` waits for a background workflow
 * or subagent and takes another turn when it lands, but exits at once with only
 * a shell still running. `undefined` when the key is absent, as for
 * {@link liveBackgroundShellIds}.
 */
function holdsTheProcess(value: unknown): boolean | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { status?: unknown }).status === 'running' &&
      (entry as { type?: unknown }).type !== 'shell',
  );
}

/**
 * Pull the event name out of a body too large to have been kept whole.
 *
 * `JSON.parse` cannot help on a truncated prefix, and the field is a fixed,
 * unambiguous shape near the front of every payload, so a direct match is
 * both sufficient and honest about what it is doing.
 */
const EVENT_IN_PREFIX = /"hook_event_name"\s*:\s*"([A-Za-z]+)"/;

/**
 * Same trick, same justification, for `SessionEnd`'s `reason`.
 *
 * It decides whether a `SessionEnd` means the conversation ended (`clear`) or
 * something this app leaves to the pty, so it has to survive a truncated body
 * exactly as the event name does.
 */
const REASON_IN_PREFIX = /"reason"\s*:\s*"([a-z_]+)"/;

/**
 * And again for `cwd`, which HIVE-78 reads to resolve the session's branch.
 *
 * A path is not a fixed vocabulary the way an event name is, so this is the
 * loosest of the three: everything up to the closing quote, refusing a value
 * that carries a backslash escape rather than trying to unescape it. On the
 * platforms this app runs on a project path contains no character JSON
 * escapes, so the refusal costs nothing real — and hand-rolling an unescaper
 * against a truncated body to save it would be the wrong trade.
 */
const CWD_IN_PREFIX = /"cwd"\s*:\s*"([^"\\]*)"/;

/**
 * And once more for `notification_type`, which decides what a `Notification`
 * means.
 *
 * A closed vocabulary like the event name, so the same fixed shape and the
 * same justification apply — and it has to survive truncation for a reason
 * the others do not share: a `Notification` payload carries the `message`
 * Claude would have shown, which is unbounded prose.
 */
const NOTIFICATION_TYPE_IN_PREFIX = /"notification_type"\s*:\s*"([a-z_]+)"/;

/**
 * And once more for `tool_name`, which HIVE-83 needs to keep a blocked
 * session from stranding on `waiting`.
 *
 * `tool_name` precedes `tool_input` on the wire, and `tool_input` is what
 * grows a body past `HOOK_MAX_BODY_BYTES` in the first place (a `Write` or
 * `Edit` carries the whole file there) — so `tool_name` always survives a
 * truncation that claims `tool_input` and everything after it, including
 * `tool_use_id`. A closed-enough vocabulary — `Bash`, `Write`,
 * `mcp__server__tool` — so word characters and underscores, same
 * conservatism as the other prefix regexes here.
 */
const TOOL_NAME_IN_PREFIX = /"tool_name"\s*:\s*"([A-Za-z0-9_]+)"/;

/** The tools whose edits the changed-files reader counts (HIVE-201). */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
]);

/**
 * And for a `Write` or `Edit`'s `file_path`, which the plan panel needs to
 * re-read a plan file whose whole new content pushed the body past the cap
 * (HIVE-180).
 *
 * `file_path` is the first key of both tools' `tool_input`, so it survives
 * any truncation that `tool_name` does. The same refusal as `CWD_IN_PREFIX`:
 * a value carrying a backslash escape is not read, and a plan path never
 * carries one.
 */
const FILE_PATH_IN_PREFIX = /"file_path"\s*:\s*"([^"\\]*)"/;

/**
 * And `agent_id`, so a truncated subagent `Write` is still known as the
 * subagent's (HIVE-180). It precedes `tool_name` on the wire (claude
 * 2.1.269, `tests/fixtures/hooks`). Read for the plan gate only: what a
 * truncated body publishes as status is unchanged.
 */
const AGENT_ID_IN_PREFIX = /"agent_id"\s*:\s*"([^"\\]+)"/;

/**
 * And once more for `session_id`, which correlates an agent's `Stop` with the
 * run it belongs to (HIVE-115).
 *
 * A uuid is the narrowest vocabulary of any of these, so the shape is the
 * strictest: hex and hyphens only, which no truncated tail can half-satisfy.
 * It survives truncation on every payload measured — `session_id` is the
 * first key Claude Code writes — but the regex is here rather than assumed,
 * because dropping the uuid silently is exactly the failure this correlation
 * exists to prevent: a `Stop` with no uuid arms a watchdog against whatever
 * is live under that name, which after a fast turnaround is the *next* run.
 */
const SESSION_ID_IN_PREFIX = /"session_id"\s*:\s*"([0-9a-fA-F-]+)"/;

/** Claude Code's hook body read into effects (HIVE-236). Pure: no callbacks, no state. */
export function readHook({ lane, entityId, body, truncated }: HookInput): HookReading {
  return lane === 'agent' ? readAgent(entityId, body, truncated) : readSession(entityId, body, truncated);
}

/**
 * A hook from an **agent's** headless turn (HIVE-115).
 *
 * Its own reader rather than a flag inside the session one, and that is the
 * whole of the story: the only callback reachable from here is
 * `onAgentEvent`. An agent therefore cannot produce a `session:status` push,
 * a session history record, a ticket rename or a `/clear` — not because
 * something downstream remembers to skip it, but because the code that would
 * do any of those is on a path this function never joins.
 *
 * It reads two fields where `handle` reads nine, which is honest rather than
 * lazy. Measured against `claude` 2.1.251, a `-p` run fires `SessionStart`,
 * `PreToolUse`, `PostToolUse`, `Stop` and `SubagentStop` — `Notification` and
 * `PermissionRequest` do not fire headless — and the only one the app acts on
 * today is `Stop`. The rest are accepted so the run does not print a hook
 * failure into its own log, and are carried no further until HIVE-116 has
 * somewhere to draw them. When it does, this is the one place that has to
 * learn a field, and it can learn it without touching the session path.
 */
function readAgent(entityId: string, body: string, truncated: boolean): HookReading {
  let event: unknown;
  let sessionUuid: unknown;
  let backgroundWork: boolean | undefined;

  if (truncated) {
    // The prefix is all there is; see EVENT_IN_PREFIX and SESSION_ID_IN_PREFIX.
    event = EVENT_IN_PREFIX.exec(body)?.[1];
    sessionUuid = SESSION_ID_IN_PREFIX.exec(body)?.[1];
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { malformed: true, effects: [] };
    }
    const fields =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as {
            hook_event_name?: unknown;
            session_id?: unknown;
            background_tasks?: unknown;
          })
        : undefined;
    event = fields?.hook_event_name;
    sessionUuid = fields?.session_id;
    backgroundWork = holdsTheProcess(fields?.background_tasks);
  }

  // An event outside the subscribed set is a success, not an error — the
  // same reading the session path takes, and for the same reason.
  if (!isHookEvent(event)) return { effects: [] };

  /*
    `SessionEnd` leaves here with no callback at all. It is a lifecycle event
    about a conversation, and a run's lifecycle is the *process* — which
    `runs.ts` watches on 'close' and 'exit', where the exit code is. There is
    nothing this could add that is not already known more accurately a moment
    later, and `toSignal` takes no `SessionEnd` by construction.
  */
  if (event === 'SessionEnd') return { effects: [] };
  // `Notification` never fires headless (above), and an agent acts on nothing but a turn's end.
  if (event === 'Notification') return { effects: [] };

  return {
    effects: [
      {
        kind: 'agent',
        event: {
          entityId,
          signal: toSignal(event),
          // Absent rather than empty when the payload did not carry one, the same
          // discipline every optional field on the session event follows.
          ...(typeof sessionUuid === 'string' && sessionUuid !== '' ? { sessionUuid } : {}),
          ...(backgroundWork === undefined ? {} : { backgroundWork }),
        },
      },
    ],
  };
}

/**
 * A hook from an entity **session**: every field the status tracker, the plan
 * panel and the prompt semantics read (HIVE-236). The parse is `handle`'s, moved
 * from `electron/main/hooks/receiver.ts`.
 */
function readSession(entityId: string, body: string, truncated: boolean): HookReading {
  let event: unknown;
  let reason: unknown;
  let cwd: unknown;
  let notificationType: unknown;
  /**
   * Only ever set on a body that parsed whole.
   *
   * A truncated body means the payload was **larger than 64 KB**, and the
   * intent shapes this looks for are short opening phrases in short messages.
   * Recovering a prompt from a truncated prefix would mean matching against
   * text that has been cut at an arbitrary byte, in the one case where the
   * user pasted something enormous — the worst input for a shape test and the
   * least likely to be "work on ABC-123".
   */
  let prompt: unknown;
  let toolUseId: unknown;
  let toolName: unknown;
  let toolInput: unknown;
  let toolResponse: unknown;
  let agentId: unknown;
  let runInBackground: unknown;
  let backgroundShells: string[] | undefined;
  /**
   * Claude's own id for the conversation this event fired in (first-prompt naming).
   *
   * Read on the session path as well as the agent one, because it is what
   * names the transcript — and unlike the uuid pinned at spawn it stays
   * correct across a `/clear`, which starts a *new* conversation in the same
   * pty under a uuid nothing told main about.
   */
  let sessionUuid: unknown;
  const unknownTaskTypes: string[] = [];

  if (truncated) {
    // The prefix is all there is; see EVENT_IN_PREFIX.
    event = EVENT_IN_PREFIX.exec(body)?.[1];
    reason = REASON_IN_PREFIX.exec(body)?.[1];
    cwd = CWD_IN_PREFIX.exec(body)?.[1];
    notificationType = NOTIFICATION_TYPE_IN_PREFIX.exec(body)?.[1];
    toolName = TOOL_NAME_IN_PREFIX.exec(body)?.[1];
    sessionUuid = SESSION_ID_IN_PREFIX.exec(body)?.[1];
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { malformed: true, effects: [] };
    }
    const fields =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as {
            hook_event_name?: unknown;
            reason?: unknown;
            cwd?: unknown;
            prompt?: unknown;
            notification_type?: unknown;
            tool_use_id?: unknown;
            tool_name?: unknown;
            agent_id?: unknown;
            tool_input?: unknown;
            tool_response?: unknown;
            background_tasks?: unknown;
            session_id?: unknown;
          })
        : undefined;
    event = fields?.hook_event_name;
    sessionUuid = fields?.session_id;
    reason = fields?.reason;
    cwd = fields?.cwd;
    prompt = fields?.prompt;
    notificationType = fields?.notification_type;
    toolUseId = fields?.tool_use_id;
    toolName = fields?.tool_name;
    agentId = fields?.agent_id;
    toolInput = fields?.tool_input;
    toolResponse = fields?.tool_response;
    runInBackground = (toolInput as { run_in_background?: unknown } | null | undefined)
      ?.run_in_background;
    backgroundShells = liveBackgroundShellIds(fields?.background_tasks, (type) =>
      unknownTaskTypes.push(type),
    );
  }

  const reading = (effects: HookEffect[]): HookReading =>
    unknownTaskTypes.length > 0 ? { effects, unknownTaskTypes } : { effects };

  /**
   * An event outside the subscribed set is a success, not an error.
   *
   * Claude may deliver more than was asked for — a settings merge the user
   * made, a future default — and answering 4xx would print a hook failure in
   * their session for something the app simply does not care about.
   */
  if (!isHookEvent(event)) return reading([]);

  /**
   * `SessionEnd` is a lifecycle event and leaves here on its own channel.
   *
   * **Only `clear` is acted on.** `logout`, `prompt_input_exit` and `other`
   * all mean the process is going away, and the pty is the honest observer of
   * that — `activity.ts` reports `terminated` for hook-driven sessions too.
   * Acting on them here is the exact bug this event was withdrawn for once
   * already.
   */
  if (event === 'SessionEnd') return reading(reason === CLEAR_REASON ? [{ kind: 'cleared' }] : []);

  const effects: HookEffect[] = [];
  const cwdField = typeof cwd === 'string' && cwd !== '' ? { cwd } : {};
  const uuidField = typeof sessionUuid === 'string' && sessionUuid !== '' ? { sessionUuid } : {};

  /*
    The plan panel's sources (HIVE-179, HIVE-180). The main agent only: a
    subagent's work shares the session's id space but is not the session's
    plan, so `agent_id` is read off a truncated prefix too. PreToolUse is
    ignored — a task's id exists only in the response, and a denied call
    never ran.

    The task tools and plan mode: whole bodies only, since a truncated one
    has lost `tool_input`'s tail and a half-read plan is worse than a late
    one. A truncated plan-mode plan is dropped and said so.

    A `Write` or `Edit` to a `.hive/plans/*.md` file: handed over with its
    `file_path` and nothing else — main re-reads the file itself, under
    confinement — and so a truncated body still counts, by the path in its
    prefix.
  */
  if (event === 'PostToolUse' && typeof toolName === 'string') {
    const callerAgent = truncated ? AGENT_ID_IN_PREFIX.exec(body)?.[1] : agentId;
    let call: PlanToolCall | undefined;
    if (callerAgent === undefined) {
      if (toolName === 'Write' || toolName === 'Edit') {
        const filePath = truncated
          ? FILE_PATH_IN_PREFIX.exec(body)?.[1]
          : (toolInput as { file_path?: unknown } | null | undefined)?.file_path;
        if (isPlanFilePath(filePath)) {
          call = {
            entityId,
            toolName,
            toolInput: { file_path: filePath },
            toolResponse: undefined,
            ...(truncated ? { truncated: true as const } : {}),
            ...cwdField,
          };
        }
      } else if (TASK_TOOL_NAMES.has(toolName) || toolName === 'ExitPlanMode') {
        if (!truncated) {
          call = { entityId, toolName, toolInput, toolResponse, ...cwdField };
        } else if (toolName === 'ExitPlanMode') {
          console.warn(
            `[hive] plan mode plan over ${String(HOOK_MAX_BODY_BYTES)} bytes, dropped (${entityId})`,
          );
        }
      }
    }
    if (call !== undefined) effects.push({ kind: 'plan', call });
    if (callerAgent === undefined && FILE_TOOL_NAMES.has(toolName)) effects.push({ kind: 'file-edit' });
  }

  /*
    A turn's end, so the store re-reads the session's plan file: a step
    ticked by a shell edit fires no Write or Edit to hand over above. `Stop`
    is the main agent's only; a subagent's is `SubagentStop`.
  */
  if (event === 'Stop') {
    effects.push({
      kind: 'plan',
      reread: true,
      call: { entityId, toolName: 'Stop', toolInput: undefined, toolResponse: undefined, ...cwdField },
    });
  }

  /**
   * The intent goes out **before** the status (HIVE-78).
   *
   * Ordering, not taste. `onEvent` is what makes a session `working`, and a
   * renderer that learned the ticket second would briefly render the row
   * under its old identity — the visible flicker being precisely a rename, on
   * the frame the user pressed enter. Neither callback is allowed to throw
   * into the other's path, which is why the whole `handle` runs inside the
   * caller's try.
   *
   * The receiver decides what the prompt means (marker, ticket, first-prompt
   * name); this only carries it.
   */
  if (event === 'UserPromptSubmit') {
    effects.push({
      kind: 'prompt',
      ...(typeof prompt === 'string' ? { text: prompt } : {}),
      ...(typeof sessionUuid === 'string' && sessionUuid !== '' ? { conversation: sessionUuid } : {}),
    });
  }

  /**
   * A `Notification` is the one event whose status is not a property of the
   * event.
   *
   * An **unrecognised** type is answered 204 and published as nothing, which
   * is the same treatment an unsubscribed event gets and for the same reason:
   * Claude raises notifications this app has no reading of — an auth prompt,
   * something added in a later release — and moving a session to `waiting` on
   * one would put a dot on the rail that no amount of looking at the terminal
   * explains. The vocabulary is closed here so that a new member is a decision
   * someone makes, not a guess this code makes on their behalf.
   */
  if (event === 'Notification') {
    const signal = noticeSignal(notificationType);
    if (signal === undefined) return reading([]);
    effects.push({ kind: 'status', event: { entityId, signal, ...cwdField, ...uuidField } });
    return reading(effects);
  }

  effects.push({
    kind: 'status',
    event: {
      entityId,
      signal: toSignal(event, toolName),
      ...uuidField,
      /**
       * Absent rather than empty when the payload did not carry one. The
       * session layer treats absence as "nothing to look at on this tick",
       * which is the honest reading — an empty string would be a directory.
       */
      ...cwdField,
      ...(typeof toolUseId === 'string' ? { toolUseId } : {}),
      ...(typeof toolName === 'string' ? { toolName } : {}),
      ...(typeof agentId === 'string' && agentId !== '' ? { agentId } : {}),
      ...(runInBackground === true ? { runInBackground: true } : {}),
      ...(backgroundShells === undefined ? {} : { backgroundShells }),
    },
  });
  return reading(effects);
}
