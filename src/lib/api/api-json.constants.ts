/** The longest example kept, on one line: a call, not a test. */
export const EXAMPLE_MAX_LENGTH = 160

/** Where `api.json` is written: next to the page holding the generated `api` block. */
export const API_JSON_FILE = 'api.json'

/** The folder of a skill that holds `api.md` and `api.json`. */
export const API_JSON_FOLDER = 'references'

/** How many neighbours `dialecte members` suggests for an expression that names nothing. */
export const MEMBER_SUGGESTION_LIMIT = 5

/** The longest summary a one-line answer prints (`api find`, `members`); `api show` prints it whole. */
export const SHORT_SUMMARY_MAX_LENGTH = 120

/** Identifiers only a test holds: an argument naming one is not an example a caller can copy. */
export const SCAFFOLDING_IDENTIFIERS: readonly string[] = ['testCase']

/** A fixture constant of a test file (`REFS`, `BAY_RECORD`): all capitals. */
export const FIXTURE_CONSTANT_PATTERN = /^[A-Z][A-Z0-9_]+$/
