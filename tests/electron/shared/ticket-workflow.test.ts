import { describe, expect, it } from 'vitest';

import { fillTicket, ticketStart, ticketWorkflowOf } from '../../../electron/shared/ticket-workflow';

const ticket = {
  key: 'HIVE-226',
  title: 'Ticket workflow',
  type: 'Story',
  url: 'https://behiques.atlassian.net/browse/HIVE-226',
};

describe('ticketWorkflowOf', () => {
  it('reads a skill, dropping a typed slash and a blank prompt', () => {
    expect(ticketWorkflowOf({ kind: 'skill', skill: '/hive:work-on', prompt: '  ' })).toEqual({ kind: 'skill', skill: 'hive:work-on' });
    expect(ticketWorkflowOf({ kind: 'skill', skill: 'debug', prompt: ' one PR ' })).toEqual({ kind: 'skill', skill: 'debug', prompt: 'one PR' });
  });

  it('reads an agent either way it can be handed the ticket', () => {
    expect(ticketWorkflowOf({ kind: 'agent', agent: 'builder', via: 'wake' })).toEqual({ kind: 'agent', agent: 'builder', via: 'wake' });
    expect(ticketWorkflowOf({ kind: 'agent', agent: 'builder', via: 'session', prompt: 'x' })).toMatchObject({ via: 'session', prompt: 'x' });
  });

  it.each([
    ['a non-object', 'hive:work-on', 'expected an object'],
    ['an unknown kind', { kind: 'macro' }, 'kind'],
    ['a skill with a space', { kind: 'skill', skill: 'work on' }, 'skill:'],
    ['a skill with shell in it', { kind: 'skill', skill: 'x; rm -rf' }, 'skill:'],
    ['an unknown key', { kind: 'skill', skill: 'x', extra: 1 }, 'unknown key'],
    ['an agent with no via', { kind: 'agent', agent: 'builder' }, 'via'],
    ['an agent name with a slash', { kind: 'agent', agent: '../x', via: 'wake' }, 'agent:'],
    ['a prompt with a newline', { kind: 'skill', skill: 'x', prompt: 'a\nb' }, 'one line'],
    ['a prompt over the cap', { kind: 'skill', skill: 'x', prompt: 'a'.repeat(1001) }, 'at most'],
  ])('refuses %s, saying why', (_name, value, reason) => {
    const result = ticketWorkflowOf(value);
    expect(typeof result).toBe('string');
    expect(result).toContain(reason);
  });
});

describe('fillTicket', () => {
  it('fills the four placeholders, and empties one the ticket lacks', () => {
    expect(fillTicket('{key} {title} ({type}) {url}', ticket)).toBe(
      'HIVE-226 Ticket workflow (Story) https://behiques.atlassian.net/browse/HIVE-226',
    );
    expect(fillTicket('see {url} now', { key: 'X-1' })).toBe('see now');
  });
});

describe('ticketStart', () => {
  it('just opens with no workflow', () => {
    expect(ticketStart(null, ticket)).toEqual({ kind: 'message', text: '' });
  });

  it('runs a skill on the key, with the prompt after it', () => {
    expect(ticketStart({ kind: 'skill', skill: 'hive:work-on' }, ticket)).toEqual({ kind: 'message', text: '/hive:work-on HIVE-226' });
    expect(ticketStart({ kind: 'skill', skill: 'hive:work-on', prompt: 'keep {key} to one PR' }, ticket)).toEqual({
      kind: 'message',
      text: '/hive:work-on HIVE-226 keep HIVE-226 to one PR',
    });
  });

  it('wakes an agent with the job, and no message', () => {
    expect(ticketStart({ kind: 'agent', agent: 'builder', via: 'wake', prompt: 'one PR' }, ticket)).toEqual({
      kind: 'wake',
      agent: 'builder',
      body: 'Work HIVE-226: Ticket workflow. one PR https://behiques.atlassian.net/browse/HIVE-226',
    });
  });

  it('has the session ask the agent itself, as its first message', () => {
    const start = ticketStart({ kind: 'agent', agent: 'builder', via: 'session' }, { key: 'HIVE-226' });
    expect(start.kind).toBe('message');
    expect(start.kind === 'message' && start.text).toBe(
      'Hand HIVE-226 to the builder agent: call ledger_ask with to "builder" and this body, then wait for its answer. Work HIVE-226.',
    );
  });
});
