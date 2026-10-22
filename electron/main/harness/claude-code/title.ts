/**
 * How Claude Code's terminal title reads as a session name (HIVE-61; moved here by HIVE-239).
 *
 * Claude prefixes the title with an activity glyph: `✳` when settled, spinner
 * frames while it works. It is stripped, and **only** the name is reported. The glyph looks like a free status signal and is not one — it
 * returns to `✳` while the session sits on an unanswered question, so it cannot
 * express `waiting`, which is the distinction the whole attention model rests
 * on. Status comes from hooks (HIVE-62), never from this.
 */

/**
 * Glyphs Claude may put in front of the name.
 *
 * **A Unicode category, not a list of blocks — and that is the third attempt.**
 *
 * This started as an enumeration of the frames observed on one release, which
 * missed `✳` and put it in every session's name. That was replaced by two
 * ranges — braille `U+2800`–`U+28FF` and the dingbats run `U+2720`–`U+274F` —
 * on the reasoning that a range degrades gracefully where a list does not. It
 * does not degrade far enough: measured against a real `claude`, the spinner
 * now cycles `U+25D0`/`U+25D1` (`◐`, `◑`) out of Geometric Shapes, which is
 * neither range, so a session ended mid-frame kept a half-filled circle in
 * front of its name forever and read as still working long after it was `done`.
 *
 * Blocks were never the property being tested for. **`\p{So}` — Symbol, other —
 * is**, and every frame yet observed is in it: `✳` U+2733, `◐` U+25D0, `◑`
 * U+25D1, the whole braille block. A spinner Anthropic adds from a fourth block
 * is one this already covers, which is the difference between a rule and a
 * running patch.
 *
 * The trailing `\s*` is what separates glyph from name, so a name is never
 * returned with a leading space.
 *
 * `*` and `·` are still deliberately not stripped, and now by construction
 * rather than by hand: both are `\p{Po}` (punctuation) rather than `\p{So}`, so
 * the session someone renamed to `*scratch*` survives without the class needing
 * to remember it. `+` (`\p{Sm}`) and `#` (`\p{Po}`) likewise.
 *
 * A name the *user* chose that opens with a symbol — `🚀 deploy` — is not at
 * risk, because Claude's own glyph is always in front of it: `+` stops at the
 * space, so `✳ 🚀 deploy` strips to `🚀 deploy`. Only a title with no activity
 * glyph at all could lose one, and Claude does not write those.
 */
const LEADING_GLYPH = /^\p{So}+\s*/u;

/**
 * What Claude titles a session that has no name of its own.
 *
 * Not a name — the *absence* of one, spelled out. A session shows it at startup
 * before the agent has named itself, and again after `/clear`, which begins a
 * fresh unnamed conversation in the same terminal.
 *
 * Reporting it as a rename is how a cleared session came to be called
 * `Claude Code` for a moment. Worse, it was indistinguishable from a real
 * rename, so it convinced the renderer that the terminal had moved on — which
 * dropped the guard against the *previous* session's title and let that title
 * name the new session. Measured, after a `/clear`:
 *
 * ```
 * title "pepe"          <- the finished conversation's name, correctly refused
 * title "Claude Code"   <- taken for a rename; guard dropped
 * title "pepe"          <- no longer refused; the successor inherited it
 * ```
 *
 * A user could of course rename a session to exactly this, and would then see
 * no name. That is the right trade: the string is Claude's own default, so the
 * common case by far is a session that has not been named.
 */
const UNNAMED_TITLE = 'Claude Code';

/**
 * Strip the activity glyph and surrounding whitespace from a raw title.
 *
 * Answers `''` for a title that carries no name, which `createTitleReader`
 * (`sessions/title.ts`) drops — the same treatment an empty title already gets.
 */
export function nameFromTitle(title: string): string {
  const name = title.replace(LEADING_GLYPH, '').trim();
  return name === UNNAMED_TITLE ? '' : name;
}
