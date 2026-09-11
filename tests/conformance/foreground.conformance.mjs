import { assert, describe, it } from './harness.mjs';

/**
 * A terminal knows what holds its tty (terminals, phase 2).
 *
 * The unit suite proves the poll's plumbing against a scripted `process`
 * getter. Only a real pty can prove the getter reads the foreground process
 * group of a real shell: `null` at the prompt, `sleep` while one runs, and
 * `null` again when it returns.
 *
 * The harness default `/bin/sh` is deliberate here rather than incidental, and
 * it is the configuration a real pty caught the poll getting wrong: the comm
 * name is the *executable's*, and on this platform `/bin/sh` is a bash build
 * that answers `bash`. A prompt reading of `null` is therefore a claim about
 * the shell being recognised at all, not only about the tty being idle.
 */
describe('foreground', () => {
  it('reports the prompt, then the running command, then the prompt', async (context) => {
    const session = await context.ready(context.open({ foreground: true }));

    await session.waitForForeground((name) => name === null, { timeout: 3_000 });

    session.send('sleep 2');
    await session.waitForForeground((name) => name === 'sleep', { timeout: 3_000 });

    await session.waitForForeground((name) => name === null, { timeout: 5_000 });
    assert.equal(session.foreground, null);
  });

  it('reports nothing for a session that did not ask', async (context) => {
    const session = await context.ready(context.open());
    session.send('sleep 1');
    await session.waitForOutput(/sleep 1/);
    // The one shape a polled predicate cannot express: nothing arriving. The
    // wait is longer than the poll's own cadence, so a host that reported
    // regardless of the flag would have spoken by now.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    assert.equal(session.foreground, undefined);
  });
});
