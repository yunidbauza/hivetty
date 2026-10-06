import { describe, expect, it } from 'vitest';

import { delegationTitle, delegationWord } from '@lib/delegation';

const d = (agent: string, helpers: string[] = []) => ({ agent, helpers });

describe('delegationWord', () => {
  it('names one agent of up to ten characters', () => {
    expect(delegationWord([d('shipper')])).toBe('shipper');
    expect(delegationWord([d('pr-patrol1')])).toBe('pr-patrol1');
  });

  it('says agents for a longer name, and counts two or more', () => {
    expect(delegationWord([d('pr-patrol-nightly')])).toBe('agents');
    expect(delegationWord([d('shipper'), d('builder')])).toBe('2 agents');
  });

  it('is null with nobody on it', () => {
    expect(delegationWord([])).toBeNull();
  });
});

describe('delegationTitle', () => {
  it('names every agent and who each brought in', () => {
    expect(delegationTitle([d('shipper', ['acr', 'fixer']), d('builder')])).toBe(
      'Waiting on shipper (with acr, fixer), builder',
    );
    expect(delegationTitle([])).toBeNull();
  });
});
