/** The names and wordings of the gate and rules records, and of the card's gate lines read from them. */

/** The record of `dialecte gate --<mode>` in the worktree's git folder; `{mode}` is `fast` or `full`. */
export const GATE_RECORD_FILE = 'dialecte-gate-{mode}.json'

/** The record of `dialecte rules` on the changed files, in the worktree's git folder. */
export const RULES_RECORD_FILE = 'dialecte-rules.json'

/** The gate steps that are no steps of the record: the worktree's hygiene and the machine lock. */
export const UNRECORDED_STEPS: readonly string[] = ['hygiene', 'machine lock']

/** A path no state hash holds: the orchestrator's `.dialecte/` folder, at any depth. */
export const STATE_EXCLUDED_PATTERN = /(^|\/)\.dialecte\//

/** The folder (in the system's temporary folder) the state hash's index of its own is built in. */
export const STATE_INDEX_FOLDER_PREFIX = 'dialecte-state-index-'

/** The mark each card gate status prints. */
export const CARD_GATE_MARKS = { passed: '✓', warning: '!', failed: '✗' } as const

/** Between the parts of a gate line's detail. */
export const DETAIL_SEPARATOR = ' · '

/** The name of the card's line when no gate record exists. */
export const GATE_LINE_NAME = 'gate'

/** The names of the rules and review lines. */
export const RULES_LINE_NAME = 'rules'
export const REVIEW_LINE_NAME = 'review'

/** A gate (or rules) never run on the worktree. */
export const NEVER_RUN_DETAIL = 'never run on this tree'

/** After a record's detail when its state hash is not the worktree's now. */
export const TREE_CHANGED_SUFFIX = ' (the tree changed since)'

/** A skipped step: `{reason}` in a few words. */
export const NOT_RUN_HERE_DETAIL = 'not run here ({reason})'

/** A step the gate did not run because an earlier one failed. */
export const NOT_RUN_DETAIL = 'not run (an earlier step failed)'

/** The gate's reason for a step whose npm script is missing, and how the card says it. */
export const MISSING_SCRIPT_PATTERN = /^no npm script "(.+)"$/
export const MISSING_SCRIPT_DETAIL = 'no $1 script'

/** The review line when the hand-over folder holds no findings ledger. */
export const NO_LEDGER_DETAIL = 'no findings ledger'

/** A findings ledger holding no row yet: nothing recorded, so nothing approved. */
export const NO_FINDINGS_DETAIL = 'no findings recorded'

/** The review line when no row is open. */
export const REVIEW_APPROVED_DETAIL = 'approved · findings ledger'

/** The ledger states that leave a finding open. */
export const OPEN_LEDGER_STATES: readonly string[] = ['open', 'fix to verify', 'fix-to-verify']

/** The severity whose open rows only warn. */
export const NIT_SEVERITY = 'nit'

/** A review round's snapshot folder in the hand-over folder: `round-<n>`. */
export const ROUND_FOLDER_PATTERN = /^round-([1-9]\d*)$/
