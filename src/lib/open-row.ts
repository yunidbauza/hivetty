/**
 * Which row a list place shows — Work's ticket, Agents' agent, PRs' pull
 * request: the one last shown while it is still listed, else the row that took
 * its place, else the first.
 *
 * `at` is where the last-shown row sat when it was last seen in `keys`. When
 * that row leaves the list, the rows after it move up one, so `keys[at]` is the
 * one that came next; when it was the last row, that is past the end and the
 * first row is shown instead. `-1` means the row was opened from outside the
 * list (a search, a link) and never sat in it, so it stays shown though it is
 * not listed.
 *
 * Answers an index into `keys`, `-1` to keep showing `last` unlisted, or `null`
 * when there is nothing to show.
 */
export function openRowIndex(keys: readonly string[], last: string | null, at: number): number | null {
  if (last !== null) {
    const found = keys.indexOf(last);
    if (found >= 0) return found;
    if (at < 0) return -1;
  }
  if (keys.length === 0) return null;
  return at >= 0 && at < keys.length ? at : 0;
}
