import { describe, expect, it } from 'vitest';

import { livePick, takesEffort } from '../../../../electron/main/sessions/live-pick';

describe('livePick', () => {
  it("maps Claude's display name to its alias and keeps a known effort", () => {
    expect(livePick({ model: 'Sonnet 5.5', effort: 'low' })).toEqual({ model: 'sonnet', effort: 'low' });
    expect(livePick({ model: 'Opus 5.5 (1M context)' })).toEqual({ model: 'opus' });
    expect(livePick({ model: 'Fable 5.2', effort: 'max' })).toEqual({ model: 'fable', effort: 'max' });
  });

  it('drops what the launch would refuse', () => {
    expect(livePick({ model: 'Mystery 9', effort: 'xhigh' })).toEqual({});
    expect(livePick({ model: 'opus; rm -rf ~', effort: 'turbo' })).toEqual({ model: 'opus' });
    expect(livePick({})).toEqual({});
  });

  it('a model that takes no effort carries none', () => {
    expect(livePick({ model: 'Haiku 5.5', effort: 'high' })).toEqual({ model: 'haiku' });
    expect(takesEffort('haiku')).toBe(false);
    expect(takesEffort('opus')).toBe(true);
  });
});
