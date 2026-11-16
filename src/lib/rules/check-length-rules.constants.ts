import type { RuleName } from './check-code-rules.types.ts'

/** The most lines a case document written in a test file may span, from its first to its last non-blank line. */
export const INLINE_DOCUMENT_MAX_LINES = 40

/** The most lines a test file may hold. */
export const TEST_FILE_MAX_LINES = 400

/** The most lines a fixture file read with `?raw` may hold. */
export const FIXTURE_FILE_MAX_LINES = 120

/** What a length finding on a file already over the limit at the base, and not grown, ends with. */
export const NOT_GROWN_SUFFIX = ' (not grown by this change)'

/** The `inline-document-long` message: `{count}` the document's lines. */
export const INLINE_DOCUMENT_LONG_MESSAGE = `case document of {count} lines (over ${INLINE_DOCUMENT_MAX_LINES}): move it to fixtures/<what-it-holds>.xml with a static ?raw import`

/** The `test-file-long` message: `{count}` the file's lines. */
export const TEST_FILE_LONG_MESSAGE = `test file of {count} lines (over ${TEST_FILE_MAX_LINES}): one table per behaviour, split by behaviour`

/** The `fixture-file-long` message: `{count}` the fixture's lines. */
export const FIXTURE_FILE_LONG_MESSAGE = `fixture of {count} lines (over ${FIXTURE_FILE_MAX_LINES}): split it, one document per variant`

/**
 * The rules that judge a file's growth since the base, not the lines the change adds: an error of theirs is never
 * softened as on a line not added (a file over its limit and not grown is a warning of its own).
 */
export const GROWTH_JUDGED_RULES: readonly RuleName[] = ['test-file-long', 'fixture-file-long']
