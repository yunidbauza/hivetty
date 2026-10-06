import { describe, expect, it } from 'vitest';

import { lostSentence } from '@components/layout/lost-note';

describe('lostSentence (HIVE-140, HIVE-211)', () => {
  it.each([
    [1, true, '1 action (clicks or keystrokes) did not reach mini; redo it.'],
    [3, false, '3 actions (clicks or keystrokes) did not reach mini; redo them once it is back.'],
  ])('lostSentence(%i, attached=%s)', (lost, attached, text) => {
    expect(lostSentence(lost, 'mini', attached)).toBe(text);
  });
});
