/**
 * What Claude Code's hooks tell the app about a session (HIVE-62).
 *
 * Types and constants only — both processes import this.
 *
 * ## Why hooks and not the terminal
 *
 * `sessions/activity.ts` derives status from pty traffic, which can separate
 * "producing output" from "quiet" and nothing else. The state the whole
 * attention model is built on — `waiting`, blocked on the user — is invisible
 * there, because a TUI that has asked a question and a TUI that is thinking both
 * produce no output.
 *
 * Claude's terminal *title* looks like it closes that gap and does not. The
 * title carries an activity glyph (`✳` settled, braille frames working), but it
 * returns to `✳` while the session sits on an unanswered question — measured,
 * not assumed:
 *
 * ```
 * 14.9s  OSC 0 -> "⠂ sess-clean"   ← working
 * 17.7s  OSC 0 -> "✳ sess-clean"   ← "settled", while blocked on a question
 * 23.7s  OSC 9 -> "Claude needs your permission"
 * ```
 *
 * OSC 9 does carry a real signal, but it is prose, it lagged the question by six
 * seconds, and it is gated by the user's notification preferences. Hooks are the
 * only source that says what happened, when it happened, and for which session.
 */

/**
 * Events that say what the agent is *doing*.
 *
 * `SessionEnd` is excluded because it is a **lifecycle** event, not a status:
 * it reports a boundary between two conversations, and there is no honest
 * `ObservedStatus` to map it to. Expressed as a type rather than a comment so
 * the status map in `harness/claude-code/hook-vocabulary.ts` cannot be given a
 * bogus entry for it.
 *
 * Spelled out rather than derived since HIVE-236: the list is the Claude adapter's
 * (`harness/claude-code/hook-vocabulary.ts`), behind a fence. HIVE-237 retires this union.
 */
export type StatusHookEvent =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'PermissionRequest'
  | 'Elicitation'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Notification'
  | 'Stop';

/** What is still running while the main agent is not (HIVE-83). */
export type IdleDetail = 'agents' | 'script';

/**
 * Status as observed from outside the pty.
 *
 * Wider than `DerivedStatus` by exactly one member. `waiting` is absent there
 * because it cannot be derived *from a pty*; that reasoning is still correct and
 * that type is still the right one for `activity.ts`. It becomes observable here
 * because a hook is a different observer with a different vantage point.
 *
 * `done` is absent here too, and stays absent now that `/done` can produce it
 * (HIVE-93). The reason is unchanged and is the point of the type: no hook
 * observes `done`. It is *declared* — by the user typing `/done`, or by a skill
 * handing off to it — and a declaration is not an observation. Keeping it out
 * of this union is what stops the status map in
 * `harness/claude-code/hook-vocabulary.ts` from being given an entry
 * that would quietly let some Claude Code event mean "the work is finished".
 *
 * What carries it instead is `SessionFinishedEvent` in `session-contract.ts`,
 * on a channel of its own — the one place main speaks about a session having
 * been *told* something rather than having seen it. The status channel never
 * carries `done` at all.
 */
export type ObservedStatus = 'working' | 'waiting' | 'idle' | 'terminated';

/** Claude's notification types this app reads. The list lives in the adapter (HIVE-236); HIVE-237 retires this. */
export type HookNotificationType = 'idle_prompt' | 'permission_prompt';

/**
 * The header carrying the Hive's own session id.
 *
 * Correlation does **not** go through the hook payload's `session_id`. That
 * field is Claude's uuid, and mapping it back would mean maintaining a second
 * table that has to be right at exactly the moment a session is starting. The
 * app already controls the environment each pty is spawned in, so it puts its
 * own id there and the hook echoes it — the mapping is the identity function.
 */
export const HOOK_HEADER_SESSION = 'x-hive-session';

/** The header carrying the caller's own session-bound token (HIVE-112). */
export const HOOK_HEADER_TOKEN = 'x-hive-token';

/**
 * The header carrying the run a `POST /mcp` caller belongs to (HIVE-130).
 *
 * The stdio host reads {@link HOOK_ENV_RUN} from its own environment and stamps
 * `meta.run` on every write before the body leaves the process
 * (`mcp-host/client.ts`). A session reaching the MCP endpoint over HTTP has no
 * such process for us to read an environment from, so the run travels as a
 * header instead — and it has to travel *somehow*, because `meta.run` is the
 * only thing that lets main tell one run's asks and handoff from a concurrent
 * neighbour's (HIVE-128).
 *
 * Optional, exactly as the environment variable is: a pty session has no run.
 * It is stamped where the body cannot override it.
 *
 * Since HIVE-184 it **is** an authenticated claim. Lanes (HIVE-183) route an
 * answer to the conversation of the run that asked, by `meta.run`, so a forged
 * run id would steer an answer into another lane's conversation. The receiver
 * refuses a ledger write whose run id comes without that run's own token,
 * {@link HOOK_HEADER_RUN_TOKEN}. `from` is still taken from
 * {@link HOOK_HEADER_SESSION}; the token proves the run, not the party.
 */
export const HOOK_HEADER_RUN = 'x-hive-run';

/**
 * The run's own token (HIVE-184): HMAC-SHA256(launchSecret, "run:" + run).
 * Required beside a run id on every ledger write; see {@link HOOK_HEADER_RUN}.
 */
export const HOOK_HEADER_RUN_TOKEN = 'x-hive-run-token';

/**
 * A session's identity, resolved rather than referenced (HIVE-132).
 *
 * Every generated artifact normally carries `$HIVE_SESSION_ID` and
 * `$HIVE_HOOK_TOKEN` and lets the launching process substitute them. That fails
 * for a container whose environment was fixed at creation time and has since
 * gone stale — `tokenFor` is keyed on a launch secret minted per receiver, so
 * *every* token changes when the app restarts. `rewrite` freshness resolves the
 * two into the files instead, which is why this shape exists.
 *
 * Declared here because three separate emitters need it — the hook settings,
 * the status line script and this file's own command builders — and a type
 * defined beside one of them would make the other two import across a seam
 * that does not otherwise exist.
 */
export interface HookIdentity {
  session: string;
  token: string;
}

/** The environment variable each session's pty carries its Hive id in. */
export const HOOK_ENV_SESSION = 'HIVE_SESSION_ID';

/** The run a headless agent process belongs to (HIVE-128). */
export const HOOK_ENV_RUN = 'HIVE_RUN_ID';
/** `standing` or `task` — `RunKind` in `agent-contract.ts` (HIVE-128). */
export const HOOK_ENV_RUN_KIND = 'HIVE_RUN_KIND';
/** The process's run token, sent as {@link HOOK_HEADER_RUN_TOKEN} (HIVE-184). */
export const HOOK_ENV_RUN_TOKEN = 'HIVE_RUN_TOKEN';

/**
 * The environment variable carrying a session's grants, as a JSON array of
 * rule strings the `approve` tool matches calls against (HIVE-119).
 *
 * Missing or unparseable is read as an empty list, never as "allow" —
 * default-deny is the whole point of the fence.
 */
export const HOOK_ENV_GRANTS = 'HIVE_GRANTS';

/**
 * The environment variable carrying a session's own token into the hook.
 *
 * A derivation of the receiver's launch secret and this one session's id
 * (HIVE-112) — not the launch secret itself, which never leaves the receiver.
 */
export const HOOK_ENV_TOKEN = 'HIVE_HOOK_TOKEN';

/**
 * The environment variable carrying the receiver's base URL (HIVE-112).
 *
 * The third of the three the MCP host needs, and the one the hooks never
 * wanted: a hook is handed its URL baked into the generated settings file, but
 * the MCP host is started by `claude`, from a config file written before the
 * receiver had bound. So it is told at spawn instead, the way its identity is.
 */
export const HOOK_ENV_RECEIVER_URL = 'HIVE_RECEIVER_URL';

/** The path the receiver serves. */
export const HOOK_PATH = '/hook';

/**
 * The path `/done` posts to (HIVE-93).
 *
 * Its own route rather than an event on {@link HOOK_PATH}, for the reason
 * `METRICS_PATH` is separate: nothing about this is a hook. No Claude Code
 * event produces it, it carries no payload to parse, and the receiver's answer
 * to it is a *lifecycle* action rather than a status tick. Sharing the hook
 * route would mean inventing an event name Claude Code never sends.
 */
export const DONE_PATH = '/done';

/**
 * The path a session posts to the moment Claude is actually up (HIVE-101).
 *
 * Its own route for {@link DONE_PATH}'s reason: nothing about it is a status
 * tick. It carries no payload, names no Claude Code event the app models, and
 * the receiver's answer to it is a *lifecycle* fact — the shell has finished
 * whatever it was doing and the thing the user came for is on screen.
 */
export const READY_PATH = '/ready';

/**
 * The largest body the receiver will read.
 *
 * Hook payloads carry `tool_input`, which for an Edit is a whole file. The app
 * reads none of it — only the event name matters — so the cap is small and a
 * body that exceeds it is answered rather than buffered.
 */
export const HOOK_MAX_BODY_BYTES = 64 * 1024;

/** What the receiver hands the rest of main once a POST validates. */
export interface HookStatusEvent {
  entityId: string;
  event: StatusHookEvent;
  status: ObservedStatus;
  /**
   * Which kind of interruption, for a `Notification` event only.
   *
   * On the event rather than folded into `event` because the two answer
   * different questions and only one of them is a status: `event` says *which
   * hook spoke*, which is what makes `waiting` distinguishable at all, and this
   * says *what it said*. Flattening them into a widened `StatusHookEvent` would
   * put synthetic members into a union whose whole value is that it names real
   * Claude Code events.
   *
   * Absent for every other event, which is the same discipline `cwd` follows:
   * absence is the honest answer, not a default.
   */
  notificationType?: HookNotificationType;
  /**
   * The directory the agent is working in, as the payload reported it (HIVE-78).
   *
   * **This is the field that makes an honest branch possible**, and it arrives
   * free. the design note in `docs/desktop-architecture.md` ("The branch a session is on")
   * listed "the session's live working directory" as the first of two things
   * main did not have, and proposed
   * inspecting the shell process with `lsof -a -p <pid> -d cwd` to get it. That
   * is unnecessary: every Claude Code hook payload already carries `cwd`, and it
   * is the *agent's* cwd rather than the shell's — which is the more accurate of
   * the two anyway, since a session that moves into a worktree moves the agent,
   * not necessarily the login shell.
   *
   * Optional because it is read off a payload this app does not control. A
   * missing `cwd` means no branch is resolved on that event, which is the same
   * outcome as a session with no hooks at all.
   */
  cwd?: string;
  /**
   * Claude's own id for the conversation this event fired in (first-prompt naming).
   *
   * The uuid the Hive pins at spawn answers the same question for the *first*
   * conversation in a pty and stops being true after a `/clear`, which starts a
   * new one under an id nothing tells main about. This does not: the payload is
   * written by the conversation that is actually running.
   *
   * It is what names the transcript, `~/.claude/projects/<escaped-cwd>/<uuid>.jsonl`,
   * which is the only place a `/rename` is distinguishable from Claude's own
   * `ai-title` — see `sessions/title-origin.ts`.
   *
   * Optional on the same terms as {@link cwd}: it is read off a payload this app
   * does not control, and its absence means one title goes unclassified rather
   * than anything failing.
   */
  sessionUuid?: string;
  /**
   * Tool identity, carried since HIVE-83.
   *
   * All optional because not every event has them and because a body over
   * `HOOK_MAX_BODY_BYTES` truncates `tool_use_id` off the end — `tool_input`
   * precedes it on the wire. `tool_name` precedes `tool_input` in turn, so it
   * always survives truncation; `tool_use_id` never does. Both `PreToolUse`
   * and `PostToolUse` lose `tool_use_id` the same way, so the tracker's
   * bookkeeping stays consistent and only pairing degrades — `tool_name`
   * recovers by itself, per `receiver.ts`'s truncated-prefix parse.
   */
  toolUseId?: string;
  toolName?: string;
  /** Present on every event originating inside a subagent, absent on the main agent's. */
  agentId?: string;
  /** `tool_input.run_in_background` on a `Bash` call. */
  runInBackground?: boolean;
  /**
   * The background **shells** Claude Code reports still running, by id
   * (HIVE-90).
   *
   * `Stop` and `SubagentStop` carry a `background_tasks` array — the live list,
   * authored by Claude Code itself rather than inferred from the tool events
   * that opened each shell. Measured against 2.1.245, a shell started with
   * `run_in_background` and left running:
   *
   * ```
   * Stop  background_tasks: [
   *   { id: 'bcy0lrc5b', type: 'shell', status: 'running',
   *     description: '…', command: 'sleep 40; echo finished-bg' }
   * ]
   * ```
   *
   * and the same shell once it has exited — whether it outlived the turn or
   * finished inside it — `background_tasks: []`. That second case is the whole
   * of HIVE-90: the inference in `tracker.ts` had no way to see it, because
   * Claude Code emits no hook when a backgrounded process dies.
   *
   * **Shells, not tasks**, and the difference is load-bearing: the same array
   * also carries `type: 'subagent'` entries, which this app tracks from
   * `SubagentStart` / `SubagentStop` instead and more freshly. `receiver.ts`'s
   * `liveBackgroundShellIds` is where that filter lives and why.
   *
   * ## Empty and absent are different, deliberately
   *
   * `[]` is an **observation**: the session was asked and reported nothing
   * running. `undefined` is **silence** — either an event that does not carry
   * the key at all, or a `Stop` body over {@link HOOK_MAX_BODY_BYTES}, since
   * `last_assistant_message` precedes `background_tasks` on the wire and a long
   * final message truncates the list away. Collapsing the two would turn a
   * body the app could not read into "nothing is running", which is the
   * announce-too-early defect this field exists to remove. `tracker.ts` trusts
   * an observation and falls back to its inference on silence.
   *
   * Ids only: the rest of each entry is a description and a command line the
   * app has no reading for, and forwarding a user's command text through the
   * status channel is not something this needs to do to count what is running.
   */
  backgroundShells?: string[];
}

/**
 * The same POST, arriving under an **agent's** name rather than a session's
 * (HIVE-115).
 *
 * A distinct type rather than a widened {@link HookStatusEvent}, because the
 * two travel on different callbacks and only one of them may reach a status
 * push or the session history — see `ReceiverOptions.onAgentEvent`.
 *
 * **The name documents; it does not enforce.** `sessionUuid` is optional, so
 * the two interfaces are mutually assignable and the compiler will not stop a
 * consumer written for one from being handed the other. What actually keeps an
 * agent's event off the session path is *positional*: `receiver.ts` parts the
 * two id spaces before it reads a field of the payload, and the branch that
 * builds this shape can only reach `onAgentEvent`. This type's job is to give
 * the uuid somewhere to live that is not the session's shape, and to say at a
 * glance which register a signature is about.
 *
 * It extends the session shape rather than replacing it because everything on
 * that shape is still true here: an agent's headless turn raises the same
 * events, in the same vocabulary, with the same `cwd` and tool identity. Only
 * {@link HookAgentEvent.sessionUuid} is new, and only agents have a use for it.
 */
export interface HookAgentEvent extends HookStatusEvent {
  /**
   * Claude's own uuid for the conversation this hook fired in — the payload's
   * `session_id`.
   *
   * {@link HOOK_HEADER_SESSION} explains why a *session* never correlates on
   * this field: the app puts its own id in the environment and the hook echoes
   * it, so the mapping is the identity function and a second table would be one
   * more thing to keep right. An agent needs both, and for a reason a session
   * does not have: a wake is one process per turn, and the id in the header is
   * the agent's **name**, which every run it ever makes shares. A `Stop`
   * delivered late — after the run it belonged to exited and the next one
   * started under the same name — would otherwise arm a stall watchdog against
   * a different, healthy run. The uuid is what tells the two apart, because the
   * waker minted it for `--session-id` (or is resuming it) and therefore knows
   * which run it names.
   *
   * Optional because it is read off a payload this app does not control. Absent
   * means the correlation cannot be made and the consumer decides what to do
   * with that; it is never inferred.
   */
  sessionUuid?: string;
  /**
   * The `Stop` reported a background workflow or subagent still running,
   * which keeps `claude -p` alive for another turn. The stall watchdog must
   * not arm on it. Absent when the payload carried no `background_tasks`.
   */
  backgroundWork?: boolean;
}

/**
 * A prompt in which the user named a ticket they intend to work on (HIVE-78).
 *
 * Separate from {@link HookStatusEvent} because it is a different kind of fact
 * arriving from the same POST: `UserPromptSubmit` always moves the status to
 * `working`, and only *sometimes* carries an intent. Folding the key into the
 * status event would put an optional field on every tick of the most frequent
 * event on the channel, and would tie a rename to a status change that has
 * nothing to do with it.
 *
 * The key here is **unconfirmed** — see `SessionTicketIntentEvent` for why
 * confirming it is the renderer's job.
 */
export interface HookTicketIntentEvent {
  entityId: string;
  key: string;
  source: TicketIntentSource;
}

/**
 * Where a ticket candidate came from, and therefore how much it may change.
 *
 * `prompt` is the user saying it in their own words; `branch` is main reading it
 * off the branch the session is standing on. Both associate the session — the
 * WORK card matches on the ticket and never on the name — but only the spoken
 * one renames the row, because only it is a decision the user made just now and
 * would recognise in a new name. See `SetSessionTicketOptions` in the store.
 *
 * Carried explicitly rather than inferred from which listener fired, because
 * both arrive on the one channel and the renderer's rename decision must not
 * depend on remembering that.
 */
export type TicketIntentSource = 'prompt' | 'branch';
