import { describe, expect, it } from 'vitest';

import { parseTitleTags } from '@lib/ticket-tags';

describe('parseTitleTags (HIVE-203)', () => {
  it.each([
    ['[BE][P4]-Drafter worker', { title: 'Drafter worker', side: 'BE', priority: 'P4' }],
    ['[FE] Hero refresh', { title: 'Hero refresh', side: 'FE' }],
    ['[BE/FE] Both halves', { title: 'Both halves', side: 'BE/FE' }],
    ['[fe] lower case', { title: 'lower case', side: 'FE' }],
    ['Plain title', { title: 'Plain title' }],
    ['[WIP] Not a tag', { title: '[WIP] Not a tag' }],
    ['[BE][WIP] x', { title: '[WIP] x', side: 'BE' }],
    ['A [BE] in the middle', { title: 'A [BE] in the middle' }],
  ])('%s', (input, expected) => {
    expect(parseTitleTags(input)).toEqual(expected);
  });
});
