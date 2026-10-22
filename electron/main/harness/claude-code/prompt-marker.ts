import { ledgerMarker, type LedgerEntry } from '@shared/ledger-contract';

/**
 * The bytes that hand Claude Code a ledger entry (HIVE-113, HIVE-138, HIVE-240).
 *
 * The marker names the entry and carries nothing else. Claude's `UserPromptSubmit` hook carries it
 * to the receiver, which answers with the entry whole as hook context (`contextReply`). The `\r`
 * submits: Claude's TUI takes carriage return as Enter, as a person typing would send it.
 */
export const promptMarker = (entry: LedgerEntry): string => `${ledgerMarker(entry)}\r`;
