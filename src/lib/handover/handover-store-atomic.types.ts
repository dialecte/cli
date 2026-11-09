import type { HandoverEntryState } from './handover.types.ts'

/** What `handWrittenEntry` writes an entry of. */
export type HandWrittenEntryParams = { folder: string; state: HandoverEntryState }

/** The part of an entry's JSON the tests read back. */
export type EntryStateRecord = { state: unknown }
