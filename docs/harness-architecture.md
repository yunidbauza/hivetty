# Harness architecture

A **harness** is the CLI that drives an agent session. HiveTTY speaks to it through a
port, so that Claude Code is the first adapter rather than an assumption spread through
main. Epic HIVE-232 is phase 1; HIVE-233 built the skeleton this doc describes, and each
later story fills in its section.

## Phase 1: no behaviour change

Phase 1 moves Claude-specific code behind the port without changing what it does. Claude
Code stays fully functional, exactly as before. Existing tests keep their assertions; a
test may move to mirror a moved file, and any changed assertion is called out in its PR
with why it is not a behaviour change.

## The pieces

| Piece | Path | What it is |
| --- | --- | --- |
| The contract | `electron/shared/harness-contract.ts` | `HarnessId` (`'claude-code'` only, for now) and `Capabilities`. Types only. |
| The port | `electron/main/harness/port.ts` | `HarnessAdapter`: `id`, `capabilities`, and the methods stories add. |
| The registry | `electron/main/harness/registry.ts` | `createHarnessRegistry({ isAgentSession })` → `{ adapterFor, harnessOf }`. |
| Adapter #1 | `electron/main/harness/claude-code/` | `claudeCodeAdapter`. |

### The port grows by story

| Method | Story |
| --- | --- |
| `launch` | HIVE-234 |
| `prepare` | HIVE-235 |
| `readHook` | HIVE-236 – HIVE-238 |
| `record`, `meters` | HIVE-239 |
| `deliverContext` | HIVE-240 |

### Capabilities: build one, shape for three

`Capabilities` starts empty (`Record<never, never>`, since lint rejects an empty
interface). A field lands only with the story that consumes it, and becomes an
`interface` then. No field is added for a harness that does not exist yet.

### The registry

`harnessOf(entityId)` answers `'claude-code'` for an agent session and `undefined` for a
plain terminal or a command (story 102). Only the sessions closure knows which an entity
is: ids are minted by the renderer, so a prefix proves nothing. The fence below stops
`harness/**` from importing `sessions/**`, so the core passes the fact in as
`isAgentSession`. HIVE-234 makes that the single source for the distinction, replacing
`terminalEntities` in `electron/main/sessions/index.ts`.

`adapterFor(id)` indexes a `Record<HarnessId, HarnessAdapter>`, so a `HarnessId` with no
adapter is a compile error, not a runtime miss.

Outside `electron/main/harness/**` and the contract's `HarnessId` type, nothing names
`claude-code`.

## The fences

Both are `import/no-restricted-paths` zones in `eslint.config.mjs`, and
`pnpm verify:boundaries` plants a violation for each.

1. **The driven side stays sealed.** Nothing outside `electron/main/harness/**` may import
   `electron/main/harness/claude-code/**`. Everyone else goes through the registry.
2. **Adapters don't reach the core.** `electron/main/harness/**` may not import
   `electron/main/{sessions,ipc,notifications,plans}/**`. The core passes what an adapter
   needs in as arguments.

## Adding a second harness

1. Add its id to `HarnessId` in `electron/shared/harness-contract.ts`.
2. Add `electron/main/harness/<id>/index.ts` exporting a `HarnessAdapter`.
3. Add it to the registry's `adapters` table (the compiler insists).
4. Add its folder to fence 1's `from` in `eslint.config.mjs`, and a planted case to
   `scripts/verify-boundaries.mjs`.
5. Teach `harnessOf` how the core says which harness an entity runs. Phase 1 answers
   `'claude-code'` for every agent session.
