import { BOOTSTRAP_DEBOUNCE_MS, BOOTSTRAP_FALLBACK_MS } from '@shared/session-contract';

/**
 * When to write `claude` into a freshly spawned shell (story 096).
 *
 * The command is written as **input**, not passed as an argument, and the
 * timing is the whole of this module.
 *
 * ## Why input rather than `$SHELL -l -c claude`
 *
 * `-c` would run `claude` as the shell's only job and the shell would exit with
 * it — leaving the user looking at a corpse in the middle of a repository they
 * were working in, unable to run `git diff`, rerun the tests, or start another
 * turn without creating a new session. Writing it into the pty makes it an
 * ordinary interactive command, and the shell survives it.
 *
 * ## Why not immediately
 *
 * Characters written before the shell has installed its line discipline land in
 * a buffer it may discard. The session then sits at a bare prompt having
 * silently swallowed the command, which looks like the app failing to start
 * `claude` at all.
 *
 * So: wait for the first output, then a short debounce for the prompt to
 * settle, then write. If nothing arrives at all within the fallback window,
 * write anyway and record it — a genuinely silent startup is unusual but real.
 */

interface BootstrapOptions {
  /** Send the command to a session's pty. */
  write: (entityId: string, data: string) => void;
  /**
   * Called when the bootstrap went in without ever seeing output.
   *
   * Recorded rather than silent: it means the shell produced nothing for five
   * seconds, and if the command *also* fails to take, that is the fact that
   * explains it.
   */
  onSilentStart?: (entityId: string) => void;
  /**
   * The session has finished bootstrapping — every stage written, nothing left
   * pending.
   *
   * The signal main needs to release input it held back: until this fires the
   * session is a bare login shell, and a user's message written into it would
   * be run by the *shell* as a command line rather than reaching the agent.
   */
  onComplete?: (entityId: string) => void;
  debounceMs?: number;
  fallbackMs?: number;
}

export interface Bootstrap {
  /**
   * Arm a freshly spawned session. Idempotent per entity.
   *
   * One stage, always: the command goes in once the shell has settled and that
   * is the end of it. The session's task rides *inside* `command` as `claude`'s
   * initial prompt — see `sessionCommand` (`harness/claude-code/launch.ts`) —
   * rather than following it as a second write, which is what HIVE-91 removed.
   */
  arm(entityId: string, command: string, submitDelayMs: number): void;
  /** Report output. The first one starts the debounce. */
  sawOutput(entityId: string): void;
  /** Abandon a pending bootstrap — the session died before it ran. */
  cancel(entityId: string): void;
  /** Whether a bootstrap is still pending, for diagnostics and tests. */
  isPending(entityId: string): boolean;
  dispose(): void;
}

interface Pending {
  command: string;
  /** The harness's text-then-`\r` gap (HIVE-63), from its launch plan (HIVE-234). */
  submitDelayMs: number;
  timer: ReturnType<typeof setTimeout>;
  /** True once the first chunk has arrived and the debounce is running. */
  settling: boolean;
}

export function createBootstrap(options: BootstrapOptions): Bootstrap {
  const {
    write,
    onSilentStart,
    onComplete,
    debounceMs = BOOTSTRAP_DEBOUNCE_MS,
    fallbackMs = BOOTSTRAP_FALLBACK_MS,
  } = options;

  const pending = new Map<string, Pending>();
  /** Stages whose text is written and whose `\r` has not gone yet (HIVE-63). */
  const submits = new Map<string, ReturnType<typeof setTimeout>>();

  function fire(entityId: string, silent: boolean): void {
    const entry = pending.get(entityId);
    if (!entry) return;
    pending.delete(entityId);
    if (silent) onSilentStart?.(entityId);
    /**
     * The text and its `\r` go in as **two** writes (HIVE-63).
     *
     * `\r`, not `\n`, for the reason it always was: a pty's line discipline
     * turns carriage return into the "line submitted" signal, and a bare
     * newline is inserted as a literal in some shells and readline
     * configurations, leaving the command typed but never run.
     *
     * The split is newer and fixes a defect one level up. Sent as a single
     * write, a stage longer than ~64 characters is treated by Claude Code's TUI
     * as a *paste*, and the trailing carriage return is inserted into the input
     * box instead of submitting it — so the session sat there holding a task
     * nobody could see it had been given. Separating them makes the text a
     * paste (which it is) and the `\r` a keystroke (which is unambiguous).
     *
     * Every stage is split, not just the long ones. See `SUBMIT_DELAY_MS`
     * for why a measured threshold is deliberately not branched on.
     */
    write(entityId, entry.command);
    /**
     * Tracked so `cancel` and `dispose` can clear it. A session killed in the
     * window between the text and its `\r` would otherwise write into a pty
     * that is already gone.
     */
    submits.set(
      entityId,
      setTimeout(() => {
        submits.delete(entityId);
        write(entityId, '\r');

        /**
         * **Everything after the stage happens here, after the `\r`.**
         *
         * Held input is released only now. Releasing it beside the *text* write
         * would leave a 300ms window in which a user's keystrokes are appended
         * to the command line itself — the shell then ran
         * `claude --name sess-01 && exithello`.
         *
         * That window is also what made the old second stage unfixable by
         * timing: its debounce was started by the pty's echo of *this* text and
         * fired inside the gap, appending the task to the command line
         * (`…&& exitRefactor the checkout flow…`). The task is now an argument
         * inside `entry.command`, so there is no second stage to order against
         * this one, and the rule reduces to: submit, then release.
         */
        onComplete?.(entityId);
      }, entry.submitDelayMs),
    );
  }

  return {
    arm(entityId, command, submitDelayMs) {
      // Re-arming would stack a second timer and write the command twice.
      if (pending.has(entityId)) return;
      pending.set(entityId, {
        command,
        submitDelayMs,
        settling: false,
        timer: setTimeout(() => fire(entityId, true), fallbackMs),
      });
    },

    sawOutput(entityId) {
      const entry = pending.get(entityId);
      if (!entry) return;

      // Only the *first* chunk starts the clock. Restarting the debounce on
      // every chunk would postpone the bootstrap indefinitely behind a shell
      // that prints a long motd.
      if (entry.settling) return;

      entry.settling = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => fire(entityId, false), debounceMs);
    },

    cancel(entityId) {
      /**
       * A pending `\r` is cancelled even when no *stage* is pending.
       *
       * The two are not the same window: `fire` deletes the pending entry
       * before it writes, so a session killed between a stage's text and its
       * carriage return has nothing in `pending` and a live timer in `submits`.
       * Returning early on the entry alone would leave that timer to write into
       * a dead pty.
       */
      const submit = submits.get(entityId);
      if (submit !== undefined) {
        clearTimeout(submit);
        submits.delete(entityId);
      }

      const entry = pending.get(entityId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(entityId);
    },

    /**
     * A stage awaiting its `\r` counts as pending (HIVE-63).
     *
     * `fire` deletes the pending entry *before* it writes, so between the text
     * and its carriage return there is no `pending` entry and the stage is
     * demonstrably not finished. `sessions.write` gates held input on this, so
     * the narrower reading opened a 300ms window in which a keystroke went
     * straight to the pty and was appended to the command line — the shell then
     * ran `claude --name sess-01 && exithello`.
     *
     * Moving `onComplete` after the `\r` fixed input that was *already* held;
     * this fixes input that arrives inside the window the split opened.
     */
    isPending: (entityId) => pending.has(entityId) || submits.has(entityId),

    dispose() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      for (const submit of submits.values()) clearTimeout(submit);
      pending.clear();
      submits.clear();
    },
  };
}
