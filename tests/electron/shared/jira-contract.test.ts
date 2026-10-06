// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { nextTransition, type JiraTransition } from '../../../electron/shared/jira-contract';

const t = (id: string, name: string, statusCategory: JiraTransition['to']['statusCategory']): JiraTransition => ({
  id,
  name,
  to: { name, statusCategory },
});

describe('nextTransition (HIVE-203)', () => {
  const all = [
    t('1', 'To Do', 'todo'),
    t('2', 'In Progress', 'in-progress'),
    t('3', 'In Review', 'in-progress'),
    t('4', 'Done', 'done'),
  ];

  it('picks the first transition one category forward', () => {
    expect(nextTransition(all, 'todo')?.id).toBe('2');
    expect(nextTransition(all, 'in-progress')?.id).toBe('4');
  });

  it('answers nothing at done, or with only sideways and backward moves', () => {
    expect(nextTransition(all, 'done')).toBeUndefined();
    expect(nextTransition([t('1', 'To Do', 'todo'), t('3', 'In Review', 'in-progress')], 'in-progress')).toBeUndefined();
  });

  it('never skips a category', () => {
    expect(nextTransition([t('4', 'Done', 'done')], 'todo')).toBeUndefined();
  });
});
