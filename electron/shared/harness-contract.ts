/**
 * The harness port's shared vocabulary (HIVE-232, phase 1).
 *
 * A harness is the CLI that drives an agent session. Data and types only: this
 * module follows `electron/shared`'s rule and drags nothing in.
 */

/** Which CLI drives an agent session. One member until a second harness lands. */
export type HarnessId = 'claude-code';

/**
 * What a harness can do. Empty on purpose ("build one, shape for three"): each
 * story adds only the fields it consumes. `Record<never, never>` rather than an
 * empty interface, which `no-empty-object-type` rejects; the first field turns
 * it into an `interface`.
 */
export type Capabilities = Record<never, never>;

/** Why a session is blocked on a human (HIVE-237): a tool wants a yes, the agent asked, or a server wants input. */
export type WaitingReason = 'permission' | 'question' | 'input';

/** What a harness raises after the fact (HIVE-237): the turn ended and nobody typed, or a block echoed. */
export type NoticeReason = 'idle' | 'permission';

/**
 * What a hook says the session is doing, in the core's words (HIVE-237).
 *
 * The adapter maps its harness's events into this; the status tracker, the inbox and `/done` read only this.
 * A closed union of exactly what the core distinguishes: a new member is a decision, not a pass-through.
 */
export type StatusSignal =
  | {
      kind:
        | 'session-start'
        | 'prompt'
        | 'tool-start'
        | 'tool-end'
        | 'subagent-start'
        | 'subagent-end'
        | 'turn-end';
    }
  | { kind: 'waiting'; reason: WaitingReason }
  | { kind: 'notice'; reason: NoticeReason };
