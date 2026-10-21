import { AUTH_ENV_KEYS } from '@shared/config-contract';
import { isSendableSessionName } from '@shared/session-contract';

import { expandEnvArgs, substituteEnv } from '../../container/container-command';
import { shellQuote } from '../../container/shell-quote';
import type { LaunchPlan, LaunchSpec } from '../port';

/** What a session was started *as* (story 109). Field docs: `LaunchSpec`. */
type SessionOptions = Omit<LaunchSpec, 'command'>;

/**
 * How long to wait between writing a stage's text and writing its `\r` (HIVE-63).
 *
 * The bug this fixes: a stage used to go in as a **single** write,
 * `` `${command}\r` ``, and Claude Code's TUI applies paste detection to input
 * that arrives in one fast chunk. Above a size threshold the whole write is
 * treated as a paste, and the trailing carriage return is inserted as a literal
 * newline inside the input box instead of submitting it. The session then sits
 * there looking idle, holding a task nobody can see it was given.
 *
 * Stage one never hit it — `claude --model … && exit` is short and fixed. Stage
 * two writes the **task**, which is arbitrary-length user text, so the defect
 * only ever appeared on the stage where it is hardest to notice.
 *
 * The boundary was measured against `claude` 2.1.222 by bisection, submitting a
 * single write and watching the title glyph for the spinner that means the turn
 * started: **submits at ≤62 characters, swallowed at ≥65** — a 64-byte chunk
 * heuristic. The number is recorded because it explains the bug, not because
 * anything depends on it: the fix splits *every* stage's write rather than
 * branching on a length, since a threshold read off one release is exactly the
 * kind of constant that goes stale without anyone noticing.
 *
 * Splitting the write is what fixes it: the text arrives as a paste (which is
 * fine — that is what it is), and the `\r` arrives separately as a keystroke,
 * which is unambiguously "submit". The delay only has to outlast the TUI's own
 * paste-coalescing window, not any model work, which is why it is short.
 */
export const SUBMIT_DELAY_MS = 300;

/**
 * `--session-id` takes a uuid and rejects anything else.
 *
 * Checked here rather than assumed because a malformed value makes `claude`
 * exit non-zero, which `&&` turns into "the session opened and did nothing".
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The command line a session is bootstrapped with.
 *
 * ## Why `&& exit` — and why this reverses story 096
 *
 * Story 096 chose `$SHELL -l` with `claude` typed into it *specifically* so the
 * shell would outlive the agent: quitting Claude dropped the user into a live
 * shell in the right repository on the right branch, where they could run
 * `git diff` or rerun the tests without starting a new session. That was a
 * deliberate decision and this deliberately undoes it.
 *
 * The reason is that HiveTTY is a fleet view. A session whose agent has quit
 * is finished work, and leaving thirteen idle login shells in the rail — each
 * indistinguishable from a session that is merely quiet — makes the one list
 * the app exists to render steadily less true. `/exit` should retire the row.
 *
 * ## Why `&&` and not `;`
 *
 * `;` would exit the shell however `claude` ended, which includes the two
 * endings the user most needs to see:
 *
 * - `claude: command not found` (127) — a mistyped `claudeCommand` (story 090)
 *   would make every new session vanish the instant it opened, with the error
 *   scrolling past inside a pty that is already closing.
 * - a crash — the stack trace would go with it.
 *
 * `&&` exits only on a **clean** exit, which is what `/exit` and `Ctrl-D`
 * produce. Anything else leaves the login shell up with the wreckage on screen.
 * The session then stays open, which is the correct outcome for a session that
 * did not finish so much as fail.
 *
 * Story 108 revisited the status this produces. This story said "there is no new
 * status" and mapped the exit onto `done`, which turned out to be the wrong
 * word: `done` is a fixture's judgement about the *work*, and a pty exit is an
 * observation about a *process*. `/exit` now yields `terminated`. The rest of
 * the reasoning above stands unchanged, including the "keep the transcript
 * readable" rule that keeps the tab and its scrollback in place afterwards.
 *
 * ## Why the flags are not quoted (story 109)
 *
 * `--model opus --effort high` is interpolated into a string a login shell will
 * parse, which is normally exactly where a value needs quoting or escaping.
 * These do not, and the reason is upstream: both are validated at the IPC
 * boundary against a closed list of literals (`assertOneOf` in
 * `shared/guards.ts`), so by the time either arrives here it is one of eight
 * known words with no shell metacharacter in any of them.
 *
 * That is a **guarantee about the guard**, not an observation about today's
 * values, and it is why the sets live in `shared/session-contract.ts` where
 * both processes read them. Widening either list to something a shell could
 * interpret would need quoting here — obvious while writing the list, invisible
 * six months later. If a value with a space, a quote or a `$` is ever added,
 * this is the line that breaks.
 *
 * ## Why the flags and the task go *before* `&&`, and nothing goes after
 *
 * They are arguments to `claude`, so they bind to it and not to `exit`. The
 * short-circuit still measures what it always measured: `claude` ending
 * cleanly. A session started with a bad flag exits non-zero, `&&` does not
 * fire, and the login shell stays up with the CLI's own complaint on screen —
 * which is the right outcome for a mistyped model and the same failure mode a
 * mistyped `claudeCommand` already has.
 *
 * ## Why the task is an argument, and not typed in afterwards (HIVE-91)
 *
 * It used to be a **second stage**: this command went in, `createBootstrap`
 * waited for `claude`'s TUI to stop painting, and then wrote the task as a
 * separate line. That is a timing guess about another program's startup, and
 * when the guess is wrong there is no safe failure — the task is written into
 * whatever is reading the pty. When `claude` does not start at all the thing
 * reading the pty is **the login shell**, so it ran the user's instruction as a
 * command line:
 *
 * ```
 * $ claude --model opus … && exit
 * zsh: command not found: claude          # or a recursive ~/.zshrc wrapper
 * $ what time is it
 * what: time: No such file or directory
 * ```
 *
 * Which is both a lost task and arbitrary text handed to a shell. Passing it as
 * `claude <flags> '<task>'` closes the window structurally rather than making
 * the guess better: there is only one write, so there is no moment at which the
 * task exists as pty input on its own. If `claude` never starts, the task never
 * goes anywhere — it was an argument to a process that failed.
 *
 * Verified against Claude Code 2.1.232 on a real pty before this was written:
 * the positional argument is read as the initial prompt, it is **submitted**
 * rather than merely typed into the box, and the session stays interactive
 * afterwards instead of exiting once it has answered. All three matter — the
 * middle one is what the removed stage existed to achieve, and the last is what
 * makes it safe to keep `&& exit` bound to a clean quit.
 *
 * This also retires the paste-threshold problem HIVE-63 worked around. A task
 * longer than ~64 characters was treated by the TUI as a paste, which swallowed
 * its own carriage return; an argument has no input box to be pasted into.
 */
export const sessionCommand = (
  claudeCommand: string,
  {
    model,
    effort,
    name,
    sessionUuid,
    resume = false,
    settingsPath,
    pluginDir,
    mcpConfig,
    subscriptionAuth = false,
    task,
    container,
  }: SessionOptions = {},
): string => {
  /*
    Through the map, or dropped. A path under neither mapped root has no
    container-side spelling, and passing the host one would name a file the
    container cannot open — an error at `claude` startup about a file, which is
    further from the cause than no flag at all. Task 9's diagnostic reports the
    unmappable case before a session is ever spawned.
  */
  const mapped = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    if (container === undefined) return value;
    return container.map.toContainer(value) ?? undefined;
  };

  /* Each mapped once, into a local: the map is a lookup, and calling it twice
     per flag to test then use it is how the two answers drift. */
  const settings = mapped(settingsPath);
  const plugin = mapped(pluginDir);
  const mcp = mapped(mcpConfig);

  const flags = [
    ...(model === undefined ? [] : ['--model', model]),
    ...(effort === undefined ? [] : ['--effort', effort]),
    /**
     * Dropped rather than escaped when it fails the pattern. See
     * {@link LaunchSpec.name} — the guard is at the IPC boundary and this
     * is the second, local check, because the value also reaches here from
     * main's own spawn path where no IPC guard ever ran.
     */
    ...(name !== undefined && isSendableSessionName(name) ? ['--name', name] : []),
    ...(sessionUuid !== undefined && UUID_PATTERN.test(sessionUuid)
      ? [resume ? '--resume' : '--session-id', sessionUuid]
      : []),
    ...(settings === undefined ? [] : ['--settings', shellQuote(settings)]),
    ...(plugin === undefined ? [] : ['--plugin-dir', shellQuote(plugin)]),
    ...(mcp === undefined ? [] : ['--mcp-config', shellQuote(mcp)]),
  ];
  /**
   * Unset the API credentials **here**, not only in the spawned environment
   * (HIVE-79).
   *
   * `stripEnv` removes them from the environment node-pty is handed, and that
   * is necessary but not sufficient: a session runs `$SHELL -l` and `claude` is
   * *typed into that shell*. A login shell sources the user's profile, so an
   * `export ANTHROPIC_API_KEY=…` in `~/.zshrc` — the dominant way that variable
   * is set, and precisely the population `AUTH_ENV_KEYS` exists for — is
   * re-established before `claude` ever runs. Both limit gauges would then read
   * `—` forever, which is the exact failure the feature exists to prevent.
   *
   * `env.ts` already documents this mechanism from the other direction: it
   * notes that stripping `CLAUDE_*` in the host "is not lossy" *because* the
   * login shell re-establishes anything the user genuinely exports. The same
   * sentence, read as a warning rather than a reassurance, is this bug.
   *
   * `unset` rather than `env -u`: `claudeCommand` is user-configurable and may
   * be a shell alias or function, which `env` cannot invoke. A `;` rather than
   * `&&` so the `&&` that follows still binds `exit` to `claude`'s own status —
   * and because `unset` on an already-unset name succeeds anyway.
   */
  const prefix = subscriptionAuth ? `unset ${AUTH_ENV_KEYS.join(' ')}; ` : '';

  /**
   * An empty task is **omitted**, not quoted into an empty argument.
   *
   * The picker spawns with `''` rather than `undefined` — see
   * `new-session-picker.tsx` — so this is the common path, not a defensive
   * flourish. `claude ''` is a positional argument that happens to be empty,
   * which is a request to open with a blank prompt rather than no prompt at all.
   *
   * Newlines are flattened for the reason the whole module exists: this string
   * is written into a pty and terminated by one `\r`, so an embedded newline
   * would submit the line early and leave the tail of the task to be read by the
   * shell. The console's grammar cannot produce one (`parse-command.ts` splits on
   * whitespace) but the picker's message box can, and "cannot happen today" is a
   * weaker guarantee than one `replaceAll` here.
   *
   * Behind a `--`, because `--mcp-config <configs...>` is variadic: a prompt
   * right after it is read as a second config file, and `claude` exits with
   * `MCP config file not found: /hive:work-on KEY` (verified against the CLI).
   * The `--` also keeps a task that begins with `-` from being read as a flag.
   */
  const initialPrompt =
    task === undefined || task.trim() === ''
      ? []
      : ['--', shellQuote(task.replaceAll(/[\r\n]+/g, ' ').trim())];

  /*
    Substituted into `claudeCommand` alone, **before** the join — never into
    the flags or the task (final-review fix).

    The flags are `shellQuote`d closed forms and the task is one too, and
    `{env}` is not a placeholder either of them promises to leave alone. Doing
    the substitution on the *joined* line meant a task containing the literal
    text `{env}` — nothing stops a user typing that — was substituted a second
    time, **inside its own quoted region**: each expansion is `-e NAME='value'`,
    an even number of quotes, spliced into an already-open single-quoted
    string. The first `'` in the splice closes the task's quote early, and
    everything after it — including any `;`, backtick or `$(…)` a project's
    `env` value happened to contain — lands unquoted in the host login shell.
    The expansion belongs to the command the user configured in Settings,
    never to text they typed into a prompt box, so it can only ever run
    against `claudeCommand`.

    This also closes the quieter half of the same bug: a `claudeCommand` with
    no `{env}` but a task that happens to contain the literal text used to
    make `substituteEnv` find *a* placeholder anyway (in the task) and return
    non-null, so the container got none of `HIVE_SESSION_ID`, `HIVE_HOOK_TOKEN`
    or `HIVE_RECEIVER_URL` while `diagnoseCommand` reported the command as
    fine. Substituting into `claudeCommand` alone means `null` means what it
    says: no `{env}` in the command the user configured, full stop.

    `null` still means exactly that — the command is emitted unchanged rather
    than half-built, because a string with the placeholder still in it would
    be typed into a shell verbatim. Task 9's diagnostic is what actually flags
    the missing placeholder to the user; this function only refuses to guess.
  */
  const command =
    container === undefined
      ? claudeCommand
      : (substituteEnv(claudeCommand, expandEnvArgs(container.env, container.config.envArg)) ??
        claudeCommand);

  const line = [command, ...flags, ...initialPrompt].join(' ');

  return `${prefix}${line} && exit`;
};

/**
 * Claude Code's launch plan (HIVE-234): the command line `bootstrap.arm`
 * types, the credentials the spawn strips under `subscriptionAuth` (HIVE-79),
 * and the gap between the text and its `\r` that the TUI's paste detection
 * needs (HIVE-63).
 */
export const launch = ({ command, ...options }: LaunchSpec): LaunchPlan => ({
  command: sessionCommand(command, options),
  stripEnv: options.subscriptionAuth === true ? AUTH_ENV_KEYS : [],
  submitDelayMs: SUBMIT_DELAY_MS,
});
