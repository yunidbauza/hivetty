/**
 * Reading a session's name back out of its pty (HIVE-61).
 *
 * Claude Code writes its display name into the terminal as an **OSC 0** title
 * sequence — `ESC ] 0 ; <text> BEL` — and rewrites it whenever the name changes,
 * which includes `/rename` and its own auto-title. That is the only channel on
 * which the *agent's* idea of its identity is observable, and main already sees
 * every chunk (`ipc/pty.ts`), so reading it costs one pass over bytes that are
 * already in hand.
 *
 * ## Why a stateful reader rather than a regex per chunk
 *
 * A pty hands out arbitrary byte boundaries. `ESC ] 0 ; ✳ sess-07 BEL` can and
 * does arrive split — the escape in one chunk, the text in the next — and a
 * regex applied per chunk sees neither half and reports nothing. That failure is
 * invisible in testing (short titles usually land whole) and permanent in
 * production for exactly the long names a user bothered to set. So the reader
 * carries a partial sequence across chunks.
 *
 * ## Why the buffer is capped
 *
 * An OSC introducer with no terminator would otherwise accumulate the entire
 * output of the session — a `pnpm build` log — in a string nobody ever reads.
 * The cap abandons the sequence instead. A dropped title is a cosmetic loss; an
 * unbounded buffer on the firehose channel is not.
 *
 * What a title *means* — the activity glyph, the harness's spelling of "unnamed" — is
 * the adapter's (`record.nameFromTitle`, HIVE-239); this module only finds titles in the
 * byte stream.
 */

/** `ESC ] <code> ;` — the start of an operating-system-command sequence. */
const OSC_START = '\x1b]';

/** BEL, and the two-character `ESC \` (ST), both of which end an OSC. */
const BEL = '\x07';
const ST = '\x1b\\';

/**
 * Abandon a sequence that has run this long without terminating.
 *
 * Comfortably longer than any real title and far shorter than a build log.
 */
const MAX_SEQUENCE_LENGTH = 2_048;

export interface TitleReader {
  /**
   * Feed a pty chunk. Returns every *new* name the chunk completed, in order.
   *
   * Usually empty — titles are rare among terminal output — so the common path
   * allocates nothing.
   */
  read(chunk: string): string[];
  /** Drop any partial sequence. Used when a session's process is gone. */
  reset(): void;
}

/**
 * @param nameOf The harness's reading of a raw title as a name; `''` means no name,
 *   which is dropped like an empty title.
 */
export function createTitleReader(nameOf: (title: string) => string): TitleReader {
  /**
   * Bytes held from a previous chunk because a sequence was still open.
   *
   * Empty on the common path: only a chunk that contains an unterminated OSC
   * introducer leaves anything behind.
   */
  let partial = '';

  function scan(buffer: string, out: string[]): string {
    let rest = buffer;

    for (;;) {
      const start = rest.indexOf(OSC_START);
      if (start === -1) {
        /**
         * Keep one trailing byte if it could be the start of an introducer.
         *
         * A chunk ending in a bare ESC is the split that matters most: discard
         * it and the `]` opening the next chunk is read as ordinary text, and
         * the title is lost.
         */
        return rest.endsWith('\x1b') ? '\x1b' : '';
      }

      const afterStart = rest.slice(start);

      const bel = afterStart.indexOf(BEL);
      const st = afterStart.indexOf(ST, 1);
      const hasBel = bel !== -1;
      const hasSt = st !== -1;

      if (!hasBel && !hasSt) {
        // Unterminated. Hold it for the next chunk unless it has grown absurd.
        return afterStart.length > MAX_SEQUENCE_LENGTH ? '' : afterStart;
      }

      const end =
        hasBel && (!hasSt || bel < st)
          ? { index: bel, width: BEL.length }
          : { index: st, width: ST.length };

      const body = afterStart.slice(OSC_START.length, end.index);
      const semicolon = body.indexOf(';');

      if (semicolon !== -1) {
        const code = body.slice(0, semicolon);
        /**
         * `0` sets icon name *and* window title, `2` sets the window title.
         * Claude uses `0`; `2` is accepted because it means the same thing to
         * every terminal and costs one comparison.
         *
         * Everything else is skipped on purpose — OSC 9 (the notification
         * carrying "Claude needs your permission") passes through here and must
         * never be mistaken for a name.
         */
        if (code === '0' || code === '2') {
          const name = nameOf(body.slice(semicolon + 1));
          // An empty title is a clear, not a rename. Claude emits one at exit.
          if (name !== '') out.push(name);
        }
      }

      rest = afterStart.slice(end.index + end.width);
    }
  }

  return {
    read(chunk) {
      const out: string[] = [];
      partial = scan(partial + chunk, out);
      return out;
    },

    reset() {
      partial = '';
    },
  };
}
