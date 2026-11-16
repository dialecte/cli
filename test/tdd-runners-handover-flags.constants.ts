/** The constants of the scratch hand-over of the flag-order tests. */

/** The case the ledger's receipt is of. */
export const FLAG_CASE_FILE = 'src/read.test.ts'
export const FLAG_CASE_NAME = 'read > answers one'

/** The cli a hand-over names as its fallback: never run by these tests. */
export const FLAG_WRITER_CLI = '/opt/dialecte/dist/cli.js'

/** The time the card is dated from. */
export const FLAG_CARD_NOW = new Date(2026, 10, 4, 12, 0, 0)

/**
 * The bound of a case that makes a scratch repository and writes a hand-over card (git, a gate record, the card):
 * a guard against a hang, never a measure of speed.
 */
export const FLAG_CARD_CASE_TIMEOUT = 120_000
