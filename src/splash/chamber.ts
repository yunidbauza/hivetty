/**
 * The chamber's copy schedule, with nothing imported and nothing run.
 *
 * Split from `splash.ts` so it can be tested, and because the globe
 * (`globe.ts`) reads `LOG_SCHEDULE` too: a cell lights on the second its log
 * line lands, and one schedule is what keeps the two from drifting apart.
 */

/** Where the wordmark's letters land, and how far apart. Seconds. */
export const WORDMARK_START = 0.62;
export const WORDMARK_STEP = 0.045;

/**
 * Where each log line lands. Seconds, and deliberately uneven — a boot that
 * reports at a metronome's pace reads as a progress bar wearing sentences. The
 * last one closes with the ring at ~2.4s, inside `SPLASH_MIN_MS`.
 */
export const LOG_SCHEDULE = [1.05, 1.35, 1.62, 1.92, 2.28];

/**
 * The wordmark is "Hive TTY": HIVE assembles, a cursor waits after it, and on
 * "hive cluster online" `tty` types itself in, a key every `TYPE_STEP`. The
 * hive wakes, then the terminal attaches.
 */
export const TYPE_STEP = 0.09;
/** How long after HIVE's last letter lands the cursor shows. */
const CURSOR_AFTER = 0.35;

/**
 * Stagger the wordmark and the log off one clock, so they cannot drift.
 *
 * In script rather than in the stylesheet because the alternative is ten
 * `nth-child` rules carrying hand-written delays, and a line added to the
 * markup would then animate at zero and arrive first.
 */
export function scheduleCopy(root: ParentNode): void {
  const glyphs = root.querySelectorAll<HTMLElement>('.wordmark span');
  glyphs.forEach((glyph, i) => {
    glyph.style.animationDelay = `${WORDMARK_START + i * WORDMARK_STEP}s`;
  });
  root.querySelectorAll<HTMLElement>('.wordmark .tty i').forEach((key, i) => {
    key.style.animationDelay = `${LOG_SCHEDULE[4]! + i * TYPE_STEP}s`;
  });
  // Two animations, one delay each: it appears, then blinks from the same moment.
  const cursorAt = WORDMARK_START + (glyphs.length - 1) * WORDMARK_STEP + CURSOR_AFTER;
  root.querySelectorAll<HTMLElement>('.wordmark .cursor').forEach((cursor) => {
    cursor.style.animationDelay = `${cursorAt}s, ${cursorAt}s`;
  });
  root.querySelectorAll<HTMLElement>('.log li').forEach((line, i) => {
    // A line past the end of the schedule holds with the last one rather than
    // animating at 0s and appearing before everything above it.
    line.style.animationDelay = `${LOG_SCHEDULE[i] ?? LOG_SCHEDULE.at(-1)}s`;
  });
}
