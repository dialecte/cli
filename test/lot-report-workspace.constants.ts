import type { WorktreeCli } from '../src/lib/events/event.types.ts'

/** The moment every report of the tests is read at, after every event of the recorded lot. */
export const REPORT_NOW = new Date('2026-11-09T12:00:00.000Z')

/** The feature the report lots belong to. */
export const REPORT_FEATURE = 'dataflow-subscribe'

/** The sentinel a file of `asks/` holds: no report, card line or usage may ever print it. */
export const ASK_SENTINEL = 'ZZ-ASK-SENTINEL'

/** The cli of the lot's worktree as the step events of the recorded lot name it: it writes step events. */
export const RECORDING_WORKTREE_CLI: WorktreeCli = { version: '0.4.0', stepEvents: true }

/** The name of the log in the registry folder. */
export const CARDS_LOG_NAME = 'cards.log'

/** The names of the two stations of the recorded lot. */
export const FIRST_STATION = 'test-writer'
export const SECOND_STATION = 'implementer'

/** The head of the findings ledger table. */
export const LEDGER_HEAD =
	'| id | round | severity | file:line | finding | state |\n|---|---|---|---|---|---|\n'

/** A hash as a card line carries it. */
export const SHA = 'a'.repeat(40)
