import { useState } from 'react';

import { useRotatingPhrase } from '@/hooks/use-rotating-phrase';

import { SwarmCreature, type Creature } from '@components/ui/swarm-creature';

/** Who may hold the cover while a session boots; one is cast per mount. */
const BOOT_CREATURES: readonly Creature[] = ['overlord', 'mutalisk', 'spire'];

/**
 * What a session shows while its shell is still booting (HIVE-101).
 *
 * ## What it is hiding, and why that is worth hiding
 *
 * The first seconds of a session belong to the login shell rather than to
 * Claude. On a real project that is `direnv` loading an `.envrc`, a package
 * manager reporting, and the command line the app assembled echoed back with
 * every flag in it — the `--session-id`, the settings path, the plugin path,
 * and the names of several dozen environment variables. Twice, because the
 * shell echoes what it runs.
 *
 * None of it is the user's work, all of it is the same every time, and some of
 * it is noise the app itself created.
 *
 * ## A cover, not a replacement
 *
 * This is drawn **over** a mounted, laid-out terminal, and that is a hard
 * requirement rather than an implementation detail: xterm measures a cell to
 * size the pty, and it cannot measure inside a box with no layout. Unmounting
 * the terminal — or hiding it with `display: none` — would resize the pty to
 * nonsense and reflow the scrollback the user is about to be handed.
 *
 * So the boot output is never lost. It is still there, in the scrollback,
 * exactly as before; it simply is not what anyone is made to watch.
 *
 * ## The hint is not decoration
 *
 * A session whose `claude` is missing or wedged never reports itself ready, and
 * the explanation is in the terminal *underneath this*. The timeout in
 * `useSessionBoot` is the backstop, but a minute is a long time to withhold an
 * error — so the way out is written on the cover, where somebody staring at a
 * creature for longer than they expected will read it.
 */
export function SessionBootCover() {
  const phrase = useRotatingPhrase('loading.session');
  const [creature] = useState(() => BOOT_CREATURES[Math.floor(Math.random() * BOOT_CREATURES.length)]);

  return (
    <div
      data-testid="session-boot-cover"
      /*
        `bg-term-bg`, not a panel colour: this stands in for the terminal, so it
        has to be the terminal's own ground or the swap reads as a different
        surface appearing rather than as the terminal not being ready.

        Opaque and absolutely positioned over a terminal that is still laid out
        underneath — see the note above on why that is not optional.

        `pointer-events-none` is the other half of "cover, not replacement": a
        click while this is up belongs to the *terminal*, and it lands there.
        Swallowing it would mean a user clicking to focus a session and having
        nothing happen at all, with no way to tell the cover from a hang.
        `useSessionBoot` lifts on that same press, so the click both focuses the
        terminal and reveals it.
      */
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-term-bg"
    >
      {/*
        One of three, cast at random per boot: the overlord, the hovering
        mutalisk or the spire. At 120px this is the full-stage register — this
        surface owns the whole centre and has nothing to compete with, which is
        the condition that register is for.
      */}
      <SwarmCreature creature={creature} size={120} />

      <p
        /*
          `aria-live="polite"` so the wait is announced once and its changes are
          not: a line that re-reads itself every four seconds is a screen reader
          talking over whatever the user is doing.
        */
        aria-live="polite"
        className="font-mono text-ui text-muted"
      >
        {phrase}
      </p>

      <p className="font-mono text-ui-sm text-term-head">
        press any key to watch it boot
      </p>
    </div>
  );
}
