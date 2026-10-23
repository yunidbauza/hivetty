/**
 * Does the clone field already hold a URL rather than a search?
 *
 * Preview-only, like `previewName` in the clone view: it decides whether the
 * picker's list shows, never whether a URL is accepted. `parse-url.ts` in main
 * stays the only validator. A bare scheme (`https:`) already counts, so the
 * list gets out of the way as soon as a paste or a typed URL begins.
 */

const SCHEME = /^(https?|ssh|git|file):/i;

/** git's scp-like form, `user@host:path`, which has no scheme. */
const SCP_LIKE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/;

export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return SCHEME.test(trimmed) || SCP_LIKE.test(trimmed);
}
