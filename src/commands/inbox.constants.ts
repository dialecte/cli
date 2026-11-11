import type { InboxGroup } from './inbox.types.ts'

/** The flags and the value options `inbox` takes, without the dashes. */
export const INBOX_FLAGS: readonly string[] = ['json', 'simulated']

/** The command's name, as the stream rule and the command map know it. */
export const INBOX_COMMAND = 'inbox'
export const INBOX_VALUE_OPTIONS: readonly string[] = ['repository']

/** The groups in the order the inbox prints them. */
export const INBOX_GROUPS: readonly InboxGroup[] = ['person', 'caller', 'ready', 'failed']

/** What waits, as a line says it: `{id}`, `{audience}` of a question. */
export const INBOX_WHAT = {
	question: 'question {id} ({audience})',
	ready: 'READY',
	failed: 'FAILED',
} as const

/** The columns of a line are joined by two spaces. */
export const INBOX_COLUMN_SEPARATOR = '  '

/** The line the inbox always ends with. */
export const INBOX_COUNT_LINE =
	'working {working} · simulated {simulated} (listed with --simulated)'

/** The line of a damaged lot: its folder, the reason (`RECORD_DAMAGE_REASONS`), the stop to run. */
export const INBOX_DAMAGED_LINE = 'damaged {folder}: {reason}; next: {stop}'

/** The line of a store the store list names that cannot be listed: its path and why. */
export const INBOX_SKIPPED_LINE = 'skipped store {store}: {reason}'

/** Why a store is skipped; `{detail}` the error code (or message) of the listing. */
export const INBOX_SKIPPED_REASONS = {
	notFolder: 'not a folder',
	unreadable: 'cannot be read ({detail})',
} as const

/** The error code of a listing of a path that is no folder. */
export const NOT_A_FOLDER_CODE = 'ENOTDIR'
