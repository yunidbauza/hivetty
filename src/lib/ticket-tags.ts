/**
 * The leading tags some projects put in a title (`[BE][P4]-`, `[FE] `), read off (HIVE-203).
 *
 * Side and priority have no Jira field in use there, so the title is where they live. Only a
 * leading run of known tags is consumed; the first bracket that is not one stops it, so a
 * `[WIP]` stays in the title rather than vanishing.
 */
const TAG = /^\[(BE|FE|BE\/FE|FE\/BE|P\d)\]/i;

export function parseTitleTags(title: string): { title: string; side?: string; priority?: string } {
  let rest = title;
  let side: string | undefined;
  let priority: string | undefined;
  for (let match = TAG.exec(rest); match !== null; match = TAG.exec(rest)) {
    const tag = match[1]!.toUpperCase();
    if (tag.startsWith('P')) priority = tag;
    else side = tag;
    rest = rest.slice(match[0].length);
  }
  if (rest === title) return { title };
  rest = rest.replace(/^(-\s*|\s+)/, '');
  return { title: rest, ...(side ? { side } : {}), ...(priority ? { priority } : {}) };
}
