import { describe, expect, it } from 'vitest';

import { activeMention } from '@features/work/components/mention-picker';

/** Where an `@query` is being typed (HIVE-216). */
describe('activeMention', () => {
  it('finds @ and two or more characters right before the caret', () => {
    expect(activeMention('thanks @da', 10)).toEqual({ start: 7, query: 'da' });
    expect(activeMention('@dana', 5)).toEqual({ start: 0, query: 'dana' });
  });

  it('ignores one character, an email, a space after, and text past the caret', () => {
    expect(activeMention('hi @d', 5)).toBeNull();
    expect(activeMention('me@dana.io', 10)).toBeNull();
    expect(activeMention('hi @dana ', 9)).toBeNull();
    expect(activeMention('hi @dana and', 4)).toBeNull();
  });
});
