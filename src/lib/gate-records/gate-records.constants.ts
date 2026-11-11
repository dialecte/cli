/** The names and wordings of the gate and rules records, and of the card's gate lines read from them. */

/** The record of `dialecte gate --<mode>` in the worktree's git folder; `{mode}` is `fast` or `full`. */
export const GATE_RECORD_FILE = 'dialecte-gate-{mode}.json'

/** The record of `dialecte rules` on the changed files, in the worktree's git folder. */
export const RULES_RECORD_FILE = 'dialecte-rules.json'

/** The name of the gate's first `--fast` step: the worktree's hygiene. */
export const HYGIENE_STEP_NAME = 'hygiene'

/** The gate steps that are no steps of the record: the worktree's hygiene. */
export const UNRECORDED_STEPS: readonly string[] = [HYGIENE_STEP_NAME]

/** A path no state hash holds: the orchestrator's `.dialecte/` folder, at any depth. */
export const STATE_EXCLUDED_PATTERN = /(^|\/)\.dialecte\//

/** The third entry of a scoped step in a gate command hash: `[name, run, "scoped"]`. */
export const SCOPED_STEP_HASH_MARK = 'scoped'

/** A gate step whose command checks the rules (`dialecte rules`): its key folds in the machine's lists. */
export const RULES_STEP_PATTERN = /\brules\b/

/** The folder (in the system's temporary folder) a commit's index is copied to for `git write-tree`. */
export const COMMIT_INDEX_FOLDER_PREFIX = 'dialecte-commit-index-'

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

/**
 * The warning row of a run that spanned a sleep of the machine: `! slept <duration> during <run>`, the run being
 * `gate --<mode>` for a gate record, `handover run` for a hand-over folder's run record.
 */
export const SLEPT_LINE_NAME = 'slept'
export const SLEPT_LINE_DETAIL = '{duration} during {run}'
export const SLEPT_GATE_RUN = 'gate --{mode}'
export const SLEPT_HANDOVER_RUN = 'handover run'

/** The card's line of a contributor without a contrib record of the checked tree, and its detail. */
export const CONTRIB_LINE_NAME = 'contrib'
export const CONTRIB_NEVER_RUN_DETAIL = 'never run: dialecte contrib'
/** A contrib row of the worktree's last record of the same tree, made at another HEAD than the lots file's. */
export const CONTRIB_HEAD_MOVED_SUFFIX = ' (HEAD moved since: run dialecte contrib again)'
/** A contrib row of the worktree's last record of the same tree and HEAD, against another install or other rows. */
export const CONTRIB_KEY_CHANGED_SUFFIX = ' (the install or the contrib rows changed since)'

/** A gate (or rules) never run on the worktree. */
export const NEVER_RUN_DETAIL = 'never run on this tree'

/** A scoped step's selection on its card line: `{ids}` joined by `, `, `{base}` the short base it selected against. */
export const SELECTED_DETAIL = 'selected {ids} since {base}'

/** A scoped step that selected nothing: `{paths}` how many changed paths it judged (`3 paths`). */
export const NOTHING_SELECTED_DETAIL = 'nothing selected since {base} ({paths})'

/** Between the ids of `SELECTED_DETAIL`. */
export const SELECTED_ID_SEPARATOR = ', '

/** After a selection made at an older base than the card's, an ancestor of it, on the tree the card checks. */
export const OLDER_BASE_SUFFIX = ' (older base)'

/** After a line of a record whose base is no ancestor of the card's: it no longer answers (stale). */
export const BASE_MOVED_SUFFIX = ' (the base moved since)'

/** The base a commit hook's record says its hook used: `{base}` short. */
export const HOOK_BASE_DETAIL = 'base {base}'

/** The card's failed gate line of a config the cli cannot run: `{message}` is the `GateConfigError`'s. */
export const INVALID_GATE_CONFIG_DETAIL = 'invalid gate config: {message}'

/** The required row of a release hand-over (`handover write --release`), apart from contrib's `release` row. */
export const GATE_RELEASE_LINE_NAME = 'gate release'

/** The `gate release` row when a green release record of the checked tree holds the current release key. */
export const RELEASE_GREEN_DETAIL = 'green on this tree'

/** The `gate release` row of a failed release record of the checked tree: `{step}` the step it failed at. */
export const RELEASE_FAILED_DETAIL = 'failed at {step}'

/** The end of a failed step's card row: `{count}` files it named failing, `{paths}` the first ones (and how many more). */
export const FAILING_DETAIL = 'failing {count}: {paths}'

/** How many of a failed step's failing files its card row names. */
export const FAILING_PATHS_SHOWN = 3

/** After the paths a failed step's card row names, when it named more: `{more}` how many. */
export const FAILING_MORE = '+{more} more'

/** Between the paths of `FAILING_DETAIL`. */
export const FAILING_PATH_SEPARATOR = ', '

/** The card row of a step that failed in parallel and passed on its serial rerun: `{count}` the flaky files. */
export const FLAKY_DETAIL = '{count} flaky, passed serially'

/** Before `FLAKY_DETAIL`: the tests that passed in parallel. */
export const FLAKY_PASSED_DETAIL = '{passed} passed'

/** The end of a gate line's detail read from a commit hook's record. */
export const HOOK_RECORD_DETAIL = 'commit hook'

/** The note of a hook's test step that `gate --hook` answered from a green `gate --full` record. */
export const HOOK_REUSED_NOTE = 'reused gate --full of {at} (HEAD {head})'

/** The detail of the card's line for a hook's test step answered from a green `gate --full` record. */
export const HOOK_REUSED_DETAIL = 'reused by the hook'

/** The mode of the record `handover run` writes for a commit's hook. */
export const HOOK_RECORD_MODE = 'hook'

/** The mode of the record `gate --release` writes (`dialecte-gate-release.json`). */
export const RELEASE_RECORD_MODE = 'release'

/** After a record's detail when its state hash is not the worktree's now. */
export const TREE_CHANGED_SUFFIX = ' (the tree changed since)'

/** A skipped step: `{reason}` in a few words. */
export const NOT_RUN_HERE_DETAIL = 'not run here ({reason})'

/**
 * A step of a gate record of another tree that the standing hook record of the checked tree superseded but did not
 * run (no step of its name, no test step answering a test step): it warns, never blocks.
 */
export const NOT_RUN_ON_CHECKED_TREE_DETAIL = 'not run on the merged tree'

/**
 * The same step when the tree checked is the worktree's own (a hand-over that merges nothing): the standing hook
 * record of that tree did not run it.
 */
export const NOT_RUN_BY_HOOK_DETAIL = 'not run by the commit hook on this tree'

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

/** The line before the steps a green record of the same check answers: `{command}` is `gate --full` or `contrib`. */
export const RECORD_REUSED_LINE = 'reused: {command} green on this tree at {at} (HEAD {head})'

/** How many characters of a sha or tree id the reuse lines and the card's record suffixes show. */
export const SHORT_SHA_LENGTH = 12

/** A segment of a package.json `files` entry npm reads as a glob: the walk starts before it. */
export const PACKAGE_FILES_GLOB_PATTERN = /[*?[\]{}]/

/** A package.json `files` entry that excludes paths from what npm packs. */
export const PACKAGE_FILES_EXCLUSION_PREFIX = '!'

/** The fields of a check key, each a string: a stored record's key is checked against them. */
export const CHECK_KEY_FIELDS = ['tree', 'lockHash', 'commandHash', 'linked'] as const
