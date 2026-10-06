import { Binoculars, Bug, PaperPlaneTilt, Robot } from '@phosphor-icons/react';
import { describe, expect, it } from 'vitest';

import { holderIcon } from '@features/pull-requests/holder-icon';

describe('holderIcon', () => {
  it.each([['acr', Binoculars], ['fixer', Bug], ['shipper', PaperPlaneTilt], ['someone', Robot]] as const)('%s', (who, icon) => {
    expect(holderIcon(who)).toBe(icon);
  });
});
