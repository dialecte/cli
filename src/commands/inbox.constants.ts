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

/** The line of a damaged lot. */
export const INBOX_DAMAGED_LINE = 'damaged {folder}: {reason}'

/** Why a folder of a store is a damaged lot. */
export const INBOX_DAMAGE_REASONS = {
	missing: 'identity.json is missing',
	unreadable: 'identity.json does not read as a lot identity',
	// the name it holds is never printed: a forged one would print with it
	otherName: 'identity.json names another lot than its folder',
} as const

/** A folder of a store that is no lot: hidden, a folder being built among them. */
export const HIDDEN_NAME_PREFIX = '.'
