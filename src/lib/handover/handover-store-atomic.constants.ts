import type { HandoverEntryState } from './handover.types.ts'

/** The state an older installed cli's `handover run` writes over an entry after the commit. */
export const OLD_CLI_ENTRY_STATE: HandoverEntryState = 'committed'

export const FIRST_WRITE = new Date('2026-11-08T09:00:00')
export const SECOND_WRITE = new Date('2026-11-08T10:30:00')
export const BRANCH = 'feat/x'
