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
