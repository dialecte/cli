/** The record `dialecte contrib` leaves in the worktree's git folder. */
export const CONTRIB_RECORD_FILE = 'dialecte-gate-contrib.json'

/** The refusal of a consumer. */
export const CONSUMER_REFUSAL =
	'contrib: no contributor checks in the consumer profile ("dialecte": { "profile": "contributor" } in a dialecte package)'

/** A committed source file of the scratch package, and an edit of it that breaks no rule. */
export const SOURCE_FILE = 'src/a.ts'
export const SOURCE_TEXT = 'export {}\n'
export const EDITED_SOURCE_TEXT = 'export const first = 1\n'

/** A changed file that breaks a code rule (a function declared as a constant). */
export const BROKEN_FILE = 'src/bad.ts'
export const BROKEN_TEXT = 'export const read = () => 1\n'

/** The generated docs file of the docs-restore case, and what the docs step writes over it. */
export const GENERATED_DOCS_FILE = 'docs/api.md'
export const GENERATED_DOCS_TEXT = 'generated\n'
export const REWRITTEN_DOCS_TEXT = 'rewritten'
