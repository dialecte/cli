/** The names and wordings of the gate and rules records, and of the card's gate lines read from them. */

/** The record of `dialecte gate --<mode>` in the worktree's git folder; `{mode}` is `fast` or `full`. */
export const GATE_RECORD_FILE = 'dialecte-gate-{mode}.json'

/** The record of `dialecte rules` on the changed files, in the worktree's git folder. */
export const RULES_RECORD_FILE = 'dialecte-rules.json'

/** The gate steps that are no steps of the record: the worktree's hygiene. */
export const UNRECORDED_STEPS: readonly string[] = ['hygiene']

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

/** The end of a gate line's detail read from a commit hook's record. */
export const HOOK_RECORD_DETAIL = 'commit hook'

/** The mode of the record `handover run` writes for a commit's hook. */
export const HOOK_RECORD_MODE = 'hook'

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

/** The folder of the records by tree, in the repository's common git folder: `<tree>.json` inside. */
export const CHECK_STORE_FOLDER = 'dialecte-checks'

/** What npm installed, as a check key hashes it: npm's own lock of `node_modules`, relative to the package. */
export const INSTALLED_LOCK_FILE = 'node_modules/.package-lock.json'

/** A check key's `lockHash` when nothing is installed. */
export const NO_INSTALLED_LOCK = 'none'

/** A dependency installed from a folder of the machine: `"file:../core"`. */
export const FILE_DEPENDENCY_PREFIX = 'file:'

/** The folders of a `file:` dependency its fingerprint leaves out: its own installs and git folder. */
export const LINKED_SKIPPED_FOLDERS: readonly string[] = ['node_modules', '.git']

/** The package.json fields whose `file:` dependencies a check key fingerprints. */
export const LINKED_DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'optionalDependencies',
] as const

/** The origin of a hook record a rehearsal made in its scratch clone. */
export const REHEARSAL_ORIGIN = 'rehearsal'

/** The end of a card gate line read from a rehearsal's record. */
export const REHEARSAL_RECORD_DETAIL = 'rehearsal'

/** The end of a card gate line read from a record made at another commit than HEAD. */
export const RECORD_FROM_DETAIL = 'from {head}'

/** How many characters of a sha or tree id the reuse lines and the card's record suffixes show. */
export const SHORT_SHA_LENGTH = 12

/** A segment of a package.json `files` entry npm reads as a glob: the walk starts before it. */
export const PACKAGE_FILES_GLOB_PATTERN = /[*?[\]{}]/

/** A package.json `files` entry that excludes paths from what npm packs. */
export const PACKAGE_FILES_EXCLUSION_PREFIX = '!'

/** The fields of a check key, each a string: a stored record's key is checked against them. */
export const CHECK_KEY_FIELDS = ['tree', 'lockHash', 'commandHash', 'linked'] as const
