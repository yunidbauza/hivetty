import type { ResolvedContainer } from '@shared/config-contract';
import type { Capabilities, HarnessId } from '@shared/harness-contract';
import type { SessionEffort, SessionModel } from '@shared/session-contract';

import type { PathMap } from '../container/path-map';

/**
 * The port every harness adapter implements (HIVE-233).
 *
 * Methods arrive with the stories that move code behind them: `launch`
 * (HIVE-234, landed), `prepare` (HIVE-235), `readHook` (HIVE-236–238),
 * `record` and `meters` (HIVE-239), `deliverContext` (HIVE-240). See
 * `docs/harness-architecture.md`.
 */
export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly capabilities: Capabilities;
  /** The command line, stripped env and submit delay a session starts with (HIVE-234). */
  launch(spec: LaunchSpec): LaunchPlan;
}

/**
 * What a container project's session needs beyond the host shape (HIVE-133).
 *
 * `docker exec` carries nothing across the boundary it crosses, so a spawn
 * needs both halves of the fix: {@link PathMap} to rewrite the three flag
 * paths, and `env` — already fully assembled, `HIVE_*` written last — to
 * expand at `claudeCommand`'s `{env}` placeholder.
 *
 * `config` is {@link ResolvedContainer}, not the raw `ContainerConfig` a file
 * or the IPC guard produces: `envArg` is read here unconditionally, and only
 * the resolved shape guarantees it is a `string` rather than `string | undefined`.
 * `effectiveRuntime` is the one place that turns one into the other.
 */
export interface ContainerSpawn {
  config: ResolvedContainer;
  map: PathMap;
  /** Everything that must reach the container, HIVE_* written last. */
  env: Record<string, string>;
}

/**
 * What the session was started *as* (story 109), and what the core knows
 * about it before any harness reads it (HIVE-234).
 *
 * Both optional, and omitting one omits its flag rather than substituting a
 * default. A spawn that names neither produces exactly the command line this
 * module has always produced, which is what keeps a fixture opened for the
 * first time — or a `spawn` typed into the console — running under whatever the
 * user's own `claude` configuration says.
 */
export interface LaunchSpec {
  /**
   * The configured binary the core read from `claudeCommand` (story 090),
   * `{env}` placeholder and all.
   */
  command: string;
  /**
   * Whether to unset the API credentials before invoking `claude` (HIVE-79).
   *
   * Defaults to `false` here rather than to the config's own default, so a
   * caller that does not know about authentication cannot silently opt a
   * session into a billing change. `sessions/index.ts` is the one caller that
   * reads the config and passes it.
   */
  subscriptionAuth?: boolean;
  model?: SessionModel;
  effort?: SessionEffort;
  /**
   * What to call the session inside Claude (HIVE-61).
   *
   * HiveTTY's own entity id, so the agent's prompt box, its `/resume` picker
   * entry and its terminal title all say `sess-07` rather than an auto-title
   * derived from whatever the first message happened to be.
   *
   * Filtered by `isSendableSessionName` rather than trusted: unlike
   * `--model` and `--effort` this has no closed list behind it, so the
   * no-quoting rule below does not cover it on its own. A name that fails the
   * pattern omits the flag — the session starts unnamed, which is what it did
   * before this story, rather than starting with a mangled command line.
   */
  name?: string;
  /**
   * The conversation's session id, pinned rather than left to Claude.
   *
   * Pinning it makes the transcript path deterministic
   * (`~/.claude/projects/<escaped-cwd>/<uuid>.jsonl`), which is what later work
   * needs to resume a session, read its cost, or read the `custom-title` and
   * `ai-title` records back. Cheap to add now and impossible to add
   * retroactively for a session that has already started.
   */
  sessionUuid?: string;
  /**
   * Continue the conversation {@link LaunchSpec.sessionUuid} names rather
   * than start one under it (HIVE-88).
   *
   * `--resume <uuid>` where `--session-id <uuid>` would have gone: the same
   * identifier, the opposite claim about it. Ignored without a uuid — there is
   * nothing to resume — so a caller that asked to resume a record written
   * before uuids were recorded gets the plain spawn it would have got anyway.
   */
  resume?: boolean;
  /**
   * A settings file to merge on top of the user's own (HIVE-62).
   *
   * Carries the hook configuration that reports session status back to the app.
   * `--settings` *merges*, so the user's own hooks, permissions and preferences
   * are untouched; the app never writes to `~/.claude/settings.json`.
   *
   * A path rather than the inline JSON `--settings` also accepts: inline JSON
   * on a shell-parsed command line is braces, quotes and colons in exactly the
   * position the no-quoting rule below does not cover.
   *
   * The path is **quoted** by `shellQuote`, and that is not belt and
   * braces. It is `app.getPath('userData')`, which on macOS contains a space —
   * so the unquoted version split into two arguments on every Mac.
   */
  settingsPath?: string;
  /**
   * A generated plugin directory whose skills this session may use (HIVE-96).
   *
   * The app-only half of custom skills, and the reason it is a **flag** rather
   * than a key in the settings file above: `--plugin-dir` loads for this
   * process alone and writes nothing to `~/.claude`, so a `claude` the user
   * starts in Terminal.app has none of these commands. Checked against the
   * binary rather than assumed — `--settings` cannot carry skills at all, and
   * `--add-dir` only finds a `.claude/` *inside* the directory it adds.
   *
   * Omitted when main has no directory to offer, which is what a failed
   * generation looks like: a session with no custom skills starts and works.
   *
   * `shellQuote`d for exactly the reason `settingsPath` is — it lives
   * under `app.getPath('userData')`, which contains a space on every Mac.
   */
  pluginDir?: string;
  /**
   * The generated `--mcp-config`, giving this session the ledger tools
   * (HIVE-112).
   *
   * A **separate flag from `--plugin-dir`**, and that is the whole design: a
   * server delivered inside the plugin is named `mcp__plugin_hive_hive__*`,
   * while one delivered here is `mcp__hive__*` — the name HIVE-115's agent
   * preamble and HIVE-119's `--permission-prompt-tool` both use. Two names for
   * one tool set would mean the preamble had to branch on who was reading it.
   *
   * Deliberately **without** `--strict-mcp-config`: verified against the CLI,
   * this flag merges rather than replaces, so a session inside the Hive keeps
   * whatever MCP servers the user configured for themselves. Adding `--strict`
   * here would silently take them away.
   *
   * `shellQuote`d for the reason `pluginDir` is — it lives under
   * `app.getPath('userData')`, which contains a space on every Mac.
   */
  mcpConfig?: string;
  /**
   * The session's opening instruction, as `claude`'s initial prompt.
   *
   * An **argument**, not a second thing typed into the shell afterwards, and
   * that distinction is the whole of HIVE-91. See `sessionCommand` for
   * what the two-stage version did when `claude` failed to start.
   *
   * Untrusted free text — it comes from the console's `spawn <project> <task…>` and
   * from the picker's message box — so unlike every other value here it is
   * `shellQuote`d rather than covered by a closed-list guard. It is the
   * second argument on this command line to need that, for the same reason
   * `settingsPath` does and a much more obvious one.
   */
  task?: string;
  /**
   * The project runs inside a container (HIVE-133).
   *
   * Two things happen when this is present, and both are about a boundary
   * `docker exec` does not carry anything across:
   *
   * - **Environment moves onto the command line.** `docker exec` does not
   *   inherit the pty's environment, so `envFor`'s three variables — which
   *   reach a host session through the spawn env — would never arrive. They are
   *   expanded through `config.envArg` and substituted at `{env}`.
   * - **Paths are rewritten.** `--settings`, `--plugin-dir` and `--mcp-config`
   *   all name host paths under `<userData>/hive`, which mean nothing inside
   *   the container.
   */
  container?: ContainerSpawn;
}

/** What a harness answers a {@link LaunchSpec} with (HIVE-234). */
export interface LaunchPlan {
  /** What `bootstrap.arm` types into the session's shell. */
  command: string;
  /** What `startProcess` removes from the pty's environment. */
  stripEnv: readonly string[];
  /** The bootstrap's gap between the text and its `\r` (HIVE-63). */
  submitDelayMs: number;
}
