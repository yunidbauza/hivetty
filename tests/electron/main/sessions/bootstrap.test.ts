// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUBMIT_DELAY_MS } from '../../../../electron/main/harness/claude-code/launch';
import { createBootstrap } from '../../../../electron/main/sessions/bootstrap';

/**
 * When `claude` is written into a freshly spawned shell (story 096).
 *
 * **Fake timers throughout**, per `AGENTS.md`. Every rule here is a timing rule,
 * and the failure they prevent — characters landing in a buffer the shell
 * discards — is invisible in a test that waits for real milliseconds and passes
 * anyway on a fast machine.
 */

let written: { entityId: string; data: string }[];
let silent: string[];

function bootstrap(options: { debounceMs?: number; fallbackMs?: number } = {}) {
  return createBootstrap({
    write: (entityId, data) => written.push({ entityId, data }),
    onSilentStart: (entityId) => silent.push(entityId),
    ...options,
  });
}

/**
 * What each stage submitted, as one line per stage.
 *
 * A stage goes in as **two** writes — its text, then its `\r` after
 * {@link SUBMIT_DELAY_MS} (HIVE-63) — so this drops the carriage returns and
 * puts them back on the text. The timing rules most of these tests exist for
 * are about when a stage *fires*, and one line per stage keeps them readable.
 *
 * **This helper cannot see ordering, and that is a real limitation.** By
 * filtering every `\r` and re-attaching one, it reports the same thing whether
 * a stage's carriage return preceded the next stage's text or followed it —
 * which is exactly the defect that shipped in the first version of the split
 * and passed this suite. Anything about the *sequence* of bytes must assert on
 * `written` directly; see `byte order across stages` below, which does.
 *
 * Deliberately **does not advance timers**. These tests interleave assertions
 * with `advanceTimersByTime` at debounce granularity, and a helper that moved
 * the clock as a side effect of being read would fire the next stage early —
 * turning the assertion into a measurement of the assertion.
 */
function submitted() {
  return written
    .filter((entry) => entry.data !== '\r')
    .map((entry) => ({ entityId: entry.entityId, data: `${entry.data}\r` }));
}

/** Every write for one entity, concatenated — the bytes the pty actually saw. */
const stream = (entityId: string) =>
  written
    .filter((entry) => entry.entityId === entityId)
    .map((entry) => entry.data)
    .join('');

beforeEach(() => {
  vi.useFakeTimers();
  written = [];
  silent = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bootstrap timing', () => {
  it('writes nothing until the shell has said something', () => {
    /**
     * The failure this prevents: characters written before the shell installs
     * its line discipline land in a buffer it may discard, and the session sits
     * at a bare prompt having silently swallowed the command.
     */
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);

    vi.advanceTimersByTime(4_000);

    expect(written).toEqual([]);
    expect(boot.isPending('sess')).toBe(true);
  });

  it('writes after the first output plus a settling debounce', () => {
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);

    boot.sawOutput('sess');
    vi.advanceTimersByTime(149);
    expect(written).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(submitted()).toEqual([{ entityId: 'sess', data: 'claude\r' }]);
  });

  it('submits with a carriage return, not a newline', () => {
    /**
     * A pty's line discipline turns CR into "line submitted". A bare newline is
     * inserted as a literal in some shells and readline configurations, leaving
     * the command typed but never run — which looks exactly like `claude`
     * failing to start.
     */
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(SUBMIT_DELAY_MS);

    expect(written.map((entry) => entry.data).join('')).toBe('claude\r');
    expect(written.some((entry) => entry.data.includes('\n'))).toBe(false);
  });

  it('sends the text and its carriage return as two writes', () => {
    /**
     * HIVE-63. Sent as one write, a stage longer than ~64 characters is treated
     * by Claude Code's TUI as a **paste**, and the trailing `\r` is inserted
     * into the input box rather than submitting it — so the session sits there
     * holding a task nobody can see it was given. Splitting them makes the text
     * a paste, which it is, and the `\r` a keystroke, which is unambiguous.
     *
     * Measured against `claude` 2.1.222: a single write submits at ≤62
     * characters and is swallowed at ≥65.
     */
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);

    // The text goes in on its own, with no carriage return attached.
    expect(written).toEqual([{ entityId: 'sess', data: 'claude' }]);

    vi.advanceTimersByTime(SUBMIT_DELAY_MS);
    expect(written).toEqual([
      { entityId: 'sess', data: 'claude' },
      { entityId: 'sess', data: '\r' },
    ]);
  });

  it('does not submit a stage whose session died in the split', () => {
    /**
     * The window the split opens: `fire` has already dropped the pending entry
     * by the time it writes, so a session killed between the text and its `\r`
     * has nothing in `pending` and a live timer waiting to write into a pty
     * that is gone.
     */
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);
    expect(written).toHaveLength(1);

    boot.cancel('sess');
    vi.advanceTimersByTime(SUBMIT_DELAY_MS * 10);

    expect(written).toHaveLength(1);
  });

  it('does not restart the debounce on every chunk', () => {
    // A shell that prints a long motd would otherwise postpone the bootstrap
    // indefinitely, one chunk at a time.
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);

    boot.sawOutput('sess');
    vi.advanceTimersByTime(100);
    boot.sawOutput('sess');
    boot.sawOutput('sess');
    vi.advanceTimersByTime(50);

    expect(submitted()).toHaveLength(1);
  });

  it('writes exactly once, however much output arrives afterwards', () => {
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);

    boot.sawOutput('sess');
    vi.advanceTimersByTime(1_000);

    expect(submitted()).toHaveLength(1);
  });

  it('writes anyway after the fallback window, and records that it did', () => {
    /**
     * A genuinely silent startup is unusual but real — a bare `sh` with no
     * profile and `PS1` unset prints nothing at all. Waiting forever would leave
     * the session permanently empty.
     */
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);

    vi.advanceTimersByTime(5_000);

    expect(submitted()).toEqual([{ entityId: 'sess', data: 'claude\r' }]);
    // Flagged, because if the command also fails to take, this is the fact that
    // explains it.
    expect(silent).toEqual(['sess']);
  });

  it('does not flag a bootstrap that followed real output', () => {
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);

    expect(silent).toEqual([]);
  });

  it('uses the configured command, not a hard-coded one', () => {
    // `claudeCommand` from story 090, so a user with a wrapper or an alternate
    // binary is not stuck.
    const boot = bootstrap();
    boot.arm('sess', '/opt/bin/claude-wrapper', SUBMIT_DELAY_MS);
    boot.sawOutput('sess');
    vi.advanceTimersByTime(150);

    expect(written[0]!.data).toBe('/opt/bin/claude-wrapper');
  });
});

describe('bootstrap lifecycle', () => {
  it('ignores a second arm for the same session', () => {
    // Re-arming would stack a timer and write the command twice.
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);

    boot.sawOutput('sess');
    vi.advanceTimersByTime(5_000);

    expect(submitted()).toHaveLength(1);
  });

  it('drops a pending bootstrap when the session dies first', () => {
    const boot = bootstrap();
    boot.arm('sess', 'claude', SUBMIT_DELAY_MS);
    boot.cancel('sess');

    vi.advanceTimersByTime(10_000);

    expect(written).toEqual([]);
    expect(boot.isPending('sess')).toBe(false);
  });

  it('ignores output for a session it is not tracking', () => {
    const boot = bootstrap();
    expect(() => boot.sawOutput('ghost')).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(written).toEqual([]);
  });

  it('keeps sessions independent', () => {
    const boot = bootstrap();
    boot.arm('a', 'claude', SUBMIT_DELAY_MS);
    boot.arm('b', 'claude', SUBMIT_DELAY_MS);

    boot.sawOutput('a');
    vi.advanceTimersByTime(150);

    expect(submitted()).toEqual([{ entityId: 'a', data: 'claude\r' }]);
    expect(boot.isPending('b')).toBe(true);
  });

  it('drops every timer on dispose, so nothing outlives the app', () => {
    const boot = bootstrap();
    boot.arm('a', 'claude', SUBMIT_DELAY_MS);
    boot.arm('b', 'claude', SUBMIT_DELAY_MS);

    boot.dispose();
    vi.advanceTimersByTime(10_000);

    expect(written).toEqual([]);
  });
});

/**
 * One stage, always — the task is an argument, not a second write (HIVE-91).
 *
 * Story 097 delivered a spawn's task as a *second stage*: the command settled,
 * then the TUI's own output settled, then the task was typed in. That is a
 * timing guess about another program's startup, and it had no safe failure. When
 * `claude` did not start, the thing reading the pty was the login shell, so the
 * user's instruction was run as a command line:
 *
 * ```
 * $ claude --model opus … && exit
 * zsh: command not found: claude
 * $ what time is it
 * what: time: No such file or directory
 * ```
 *
 * The task now rides *inside* the command as `claude`'s initial prompt, so these
 * tests assert the absence the fix creates: whatever the TUI does, and whatever
 * the command contains, the pty sees one stage and never a second.
 */
describe('the single stage (HIVE-91)', () => {
  const DEBOUNCE = 150;
  const FALLBACK = 5_000;
  const SETTLE = DEBOUNCE + SUBMIT_DELAY_MS;
  const armed = () =>
    bootstrap({ debounceMs: DEBOUNCE, fallbackMs: FALLBACK });

  /** A command carrying its task, as `sessionCommand` now builds it. */
  const WITH_TASK = "claude --name sess-a 'fix the hero' && exit";

  it('writes the command carrying its task, and nothing after it', () => {
    const boot = armed();
    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);

    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SETTLE);
    expect(submitted()).toEqual([{ entityId: 'sess-a', data: `${WITH_TASK}\r` }]);

    /**
     * The TUI paints — which is what the old second stage waited for. Nothing
     * may follow, because there is no longer anything to follow with.
     */
    boot.sawOutput('sess-a');
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(FALLBACK * 2);
    expect(submitted()).toEqual([{ entityId: 'sess-a', data: `${WITH_TASK}\r` }]);
  });

  it('never writes the task as pty input of its own', () => {
    /**
     * The regression guard for the reported defect, asserted on the byte stream
     * rather than on write counts — the failure was that `fix the hero` reached
     * the pty as a line in its own right, whoever happened to be reading it.
     */
    const boot = armed();
    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SETTLE);

    for (let i = 0; i < 40; i += 1) {
      boot.sawOutput('sess-a');
      vi.advanceTimersByTime(DEBOUNCE - 20);
    }
    vi.advanceTimersByTime(FALLBACK * 2);

    expect(stream('sess-a')).toBe(`${WITH_TASK}\r`);
  });

  it('a TUI that never stops painting still adds no second write', () => {
    const boot = armed();
    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SETTLE);

    for (let i = 0; i < 200; i += 1) {
      boot.sawOutput('sess-a');
      vi.advanceTimersByTime(DEBOUNCE - 20);
    }

    expect(submitted()).toHaveLength(1);
  });

  it('reports completion after the stage’s carriage return', () => {
    const done: string[] = [];
    const boot = createBootstrap({
      write: (entityId, data) => written.push({ entityId, data }),
      onComplete: (entityId) => done.push(entityId),
      debounceMs: DEBOUNCE,
      fallbackMs: FALLBACK,
    });

    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(DEBOUNCE);

    /**
     * Not yet — the text has gone in but the `\r` has not (HIVE-63).
     * Completion releases held input, and releasing it here would append the
     * user's keystrokes to the command line rather than sending them to the
     * agent.
     */
    expect(done).toEqual([]);

    vi.advanceTimersByTime(SUBMIT_DELAY_MS);
    expect(done).toEqual(['sess-a']);
  });

  it('completes exactly once, however much the TUI paints afterwards', () => {
    const done: string[] = [];
    const boot = createBootstrap({
      write: (entityId, data) => written.push({ entityId, data }),
      onComplete: (entityId) => done.push(entityId),
      debounceMs: DEBOUNCE,
      fallbackMs: FALLBACK,
    });

    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SETTLE);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(FALLBACK * 2);

    expect(done).toEqual(['sess-a']);
  });

  it('a session that dies before settling writes nothing at all', () => {
    const boot = armed();
    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.cancel('sess-a');
    vi.advanceTimersByTime(FALLBACK * 2);

    expect(submitted()).toEqual([]);
  });

  it('drops a pending stage on dispose, so nothing outlives the app', () => {
    const boot = armed();
    boot.arm('sess-a', WITH_TASK, SUBMIT_DELAY_MS);
    boot.dispose();
    vi.advanceTimersByTime(FALLBACK * 2);

    expect(submitted()).toEqual([]);
  });

  it('keeps two sessions’ stages independent', () => {
    const boot = armed();
    boot.arm('sess-a', "claude 'first' && exit", SUBMIT_DELAY_MS);
    boot.arm('sess-b', "claude 'second' && exit", SUBMIT_DELAY_MS);

    for (const id of ['sess-a', 'sess-b']) {
      boot.sawOutput(id);
      vi.advanceTimersByTime(SETTLE);
    }

    expect(stream('sess-a')).toBe("claude 'first' && exit\r");
    expect(stream('sess-b')).toBe("claude 'second' && exit\r");
  });
});

describe('byte order (HIVE-63)', () => {
  const DEBOUNCE = 150;
  const FALLBACK = 5_000;

  it('the text goes in before its carriage return, and nothing between', () => {
    /**
     * The window this pins used to be a two-stage ordering bug.
     *
     * `SUBMIT_DELAY_MS` (300) is longer than `BOOTSTRAP_DEBOUNCE_MS` (150), and
     * the pty echoes the text just written — which is output, which started the
     * *next* stage's clock. Arming stage two beside the text therefore fired it
     * inside the gap before stage one's `\r`, and the shell received
     * `…&& exitfix the hero`: the command corrupted and the task lost.
     *
     * HIVE-91 removed the second stage, so the ordering hazard is gone by
     * construction rather than by arithmetic between two constants. What remains
     * worth asserting is that the surviving stage is still two writes in the
     * right order, and that output arriving in the gap adds nothing — which is
     * the same observation, now with the stronger expected value.
     */
    const boot = bootstrap({ debounceMs: DEBOUNCE, fallbackMs: FALLBACK });
    const command = "claude --name sess-a 'fix the hero' && exit";
    boot.arm('sess-a', command, SUBMIT_DELAY_MS);

    // The shell speaks; the stage settles and its text goes in.
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(DEBOUNCE);
    expect(stream('sess-a')).toBe(command);

    // The echo of that text arrives while the `\r` is still pending — this is
    // the exact window the bug lived in.
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SUBMIT_DELAY_MS * 4);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(SUBMIT_DELAY_MS * 4);

    expect(stream('sess-a')).toBe(`${command}\r`);
  });

  it('holds a stage as pending until its carriage return has gone', () => {
    /**
     * `sessions.write` gates held input on `isPending`. `fire` deletes the
     * pending entry before it writes, so without counting the submit window a
     * keystroke arriving in those 300ms went straight to the pty and was
     * appended to the command line.
     */
    const boot = bootstrap({ debounceMs: DEBOUNCE, fallbackMs: FALLBACK });
    boot.arm('sess-a', 'claude', SUBMIT_DELAY_MS);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(DEBOUNCE);

    expect(boot.isPending('sess-a')).toBe(true);

    vi.advanceTimersByTime(SUBMIT_DELAY_MS);
    expect(boot.isPending('sess-a')).toBe(false);
  });

  it('submits after the delay it was armed with (HIVE-234)', () => {
    const boot = bootstrap({ debounceMs: 10 });
    boot.arm('sess-a', 'claude && exit', 50);
    boot.sawOutput('sess-a');
    vi.advanceTimersByTime(10);
    expect(written.map((w) => w.data)).toEqual(['claude && exit']);
    vi.advanceTimersByTime(49);
    expect(written.map((w) => w.data)).toEqual(['claude && exit']);
    vi.advanceTimersByTime(1);
    expect(written.map((w) => w.data)).toEqual(['claude && exit', '\r']);
  });
});
