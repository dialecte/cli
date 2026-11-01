import type { ReceiptFlag } from '../tdd/tdd.types.ts'

/** Name of the lock file, in the repository's git folder, while a hand-over script waits or runs. */
export const HANDOVER_LOCK_FILE = 'dialecte-handover.lock'

export const COMMIT_SCRIPT_FILE = 'commit.sh'

/** The files of a hand-over folder: the lots as the agent wrote them, then the snapshot. */
export const HANDOVER_FILES = {
	lots: 'lots.json',
	files: 'files.txt',
	hashes: 'files.sha256',
	deleted: 'files.deleted',
	/** The hash of `lots.json` as reviewed: an edit after the hand-over is refused. */
	lotsHash: 'lots.sha256',
	/** Each merge lot's conflicts and resolutions (paths, files, hashes), by the lot's index. */
	merges: 'merges.json',
	/** The hash of `merges.json` as reviewed: an edit after the hand-over is refused. */
	mergesHash: 'merges.sha256',
} as const

/** A conflict marker line git leaves in a file it could not merge. */
export const CONFLICT_MARKER_PATTERN = /^(<{7}|>{7})( |$)/m

/** A full commit or tree sha. */
export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/

/** The lock whose packages `node_modules` must hold before a commit that stages a change of it. */
export const PACKAGE_LOCK_FILE = 'package-lock.json'

/**
 * What installs the staged lock's packages exactly (the lock is never rewritten), running no install script:
 * a script (the root's `prepare`, a package's `postinstall`) could change git config, hooks or any file.
 */
export const INSTALL_COMMAND = [
	'npm',
	'ci',
	'--ignore-scripts',
	'--prefer-offline',
	'--no-audit',
	'--no-fund',
] as const

/** Before the names of the installed packages of the staged lock whose install script did not run. */
export const SKIPPED_INSTALL_SCRIPTS_NOTE = '; install scripts not run: '

/** The most packages that note names; the others are counted (`and <n> more`). */
export const SKIPPED_SCRIPTS_NAMED = 5

/** The folder segment before a package's name in a lock path (`vite/node_modules/fsevents`). */
export const NODE_MODULES_SEGMENT = 'node_modules/'

/** The manifest written over with its staged copy while the staged lock is installed. */
export const PACKAGE_MANIFEST_FILE = 'package.json'

/** The oldest git with `merge-tree --write-tree` (the trial merge of a merge lot): major, minor. */
export const MERGE_LOT_GIT_VERSION = [2, 38] as const

/** Modes git cannot take a resolution file for: a symlink, a submodule. */
export const UNRESOLVABLE_MODES: Readonly<Record<string, string>> = {
	'120000': 'symlink',
	'160000': 'submodule',
}

/** The lock entries an install may leave out of node_modules. */
export const OPTIONAL_LOCK_FLAGS = [
	'dev',
	'devOptional',
	'peer',
	'peerOptional',
	'optional',
] as const

/** A script of a hand-over written by hand, before the lots file existed. */
export const LEGACY_SCRIPT_PATTERN = /^commit.*\.sh$/

/** The marker a rehearsal clone holds, in its git folder: whose process made it. */
export const REHEARSAL_MARKER_FILE = 'dialecte-rehearsal.json'

/** The commit a lots file names: a sha or an unambiguous prefix of one. */
export const HEAD_PATTERN = /^[0-9a-f]{7,40}$/

/** How many leading bytes decide that a file is binary (no references looked for in it). */
export const BINARY_PROBE_LENGTH = 8000

/** Before each line a lot's commit (its hooks) prints. */
export const HOOK_OUTPUT_PREFIX = '  │ '

/** The folder (in the system's temporary folder) holding a lot's full hook log. */
export const HOOK_LOG_FOLDER_PREFIX = 'dialecte-hook-'

export const HOOK_HEARTBEAT_LABEL = '  … hook running'

/** Folders `--rehearse` clones into, under the system's temporary folder; `worktree prune` finds them by it. */
export const REHEARSAL_FOLDER_PREFIX = 'dialecte-rehearse-'

/** How deep `handover list` looks for hand-over folders under its root. */
export const LIST_DEPTH = 4

/** Width of the guard name column of the progress lines. */
export const GUARD_NAME_WIDTH = 11

/**
 * The script a hand-over writes. People run it with `sh` (macOS: bash 3.2), so it re-executes itself
 * with bash. It runs the cli the repository installs; a cli without `handover run` (missing, or older)
 * gets one line saying how to run the hand-over anyway.
 *
 * Placeholders: `__HEADER__`, `__REPOSITORY__`, `__FALLBACK__` (the command with the cli that wrote the
 * script).
 */
export const COMMIT_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
__HEADER__
if [ -z "\${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd __REPOSITORY__
npx --no-install @dialecte/cli handover run --probe >/dev/null 2>&1 || { echo ">> no @dialecte/cli with \\\`handover run\\\` installed in "__REPOSITORY__": npm install --save-dev @dialecte/cli@latest there, or run: "__FALLBACK__ >&2; exit 1; }
exec npx --no-install @dialecte/cli handover run "$HERE" "$@"
`

/** What `commit.sh` asks the repository's own cli: does it run hand-overs? */
export const HANDOVER_PROBE_COMMAND = [
	'npx',
	'--no-install',
	'@dialecte/cli',
	'handover',
	'run',
	'--probe',
] as const

/** How many untracked entries the rehearsal's warning names before `and N more`. */
export const UNTRACKED_WARNING_LIMIT = 10

/** How long the repository's cli gets to answer the probe. */
export const HANDOVER_PROBE_TIMEOUT_MILLISECONDS = 10_000

/** The folder (in the system's temporary folder) the probe's answer is written to. */
export const HANDOVER_PROBE_FOLDER_PREFIX = 'dialecte-probe-'

/** The probe's answer from a cli that runs hand-overs. */
export const HANDOVER_PROBE_ANSWER = 'handover run'

/** How long a lot's unstaging waits for a stopped git to remove its `index.lock`. */
export const INDEX_LOCK_WAIT_MILLISECONDS = 5_000

/** How often the unstaging tries again while `index.lock` is there. */
export const INDEX_LOCK_RETRY_MILLISECONDS = 100

/**
 * The file a run leaves in the repository's git folder while it holds a merge in progress: JSON with the
 * `tip` it merges, its `pid` and `startedAt`. A merge of that tip left in progress with this file is the cli's
 * own, aborted and redone; one without it is someone else's, refused unless `--resume-merge`.
 */
export const MERGE_MARKER_FILE = 'dialecte-merge.json'

/**
 * The folder in the repository's git folder holding the working `package.json` and lock while an install runs
 * on the staged ones: each file by name (the working bytes), and `<name>.staged` (the bytes written over it).
 * A signal or a crash leaves it; the next run restores the working files from it when they still hold the
 * staged bytes, and refuses naming it when they hold anything else.
 */
export const INSTALL_BACKUP_FOLDER = 'dialecte-install-backup'

/** In the install backup: the bytes written over a working file. */
export const STAGED_SUFFIX = '.staged'

/** In the install backup: the working file did not exist. */
export const ABSENT_SUFFIX = '.absent'

/** The card's line for the accepted and revised receipts of earlier lots, `{counts}` a count per kind. */
/**
 * The tdd section's line when no gate run on this tree listed the cases of the change: the receipts are not
 * counted, since the ledger alone also holds cases the change no longer has.
 */
export const TDD_COUNTS_FROM_GATE_LINE = 'counts from the last gate: run the gate on this tree'

export const EARLIER_LOTS_LINE = 'earlier lots: {counts} (not in the lot file)'

/** The words after each count of the tdd section's first line. */
export const TDD_COUNT_WORDS = {
	proven: 'proven red → green',
	unchanged: 'unchanged',
	kept: 'kept',
} as const

/** The mark at the right edge of the tdd section's head line of the entries to read. */
export const TO_READ_MARK = 'to read ↓'

/** The label of each kind of entry to read, in the head line and before each entry. */
export const TO_READ_LABELS = { revised: 'revised', gone: 'gone', unused: 'unused' } as const

/** The indent of an entry to read, before its label. */
export const TO_READ_INDENT = '  '

/** Before the count of an accepted reason's row, and between the count and the reason. */
export const ACCEPTED_REASON_INDENT = '  '

/** The width of an entry's label column, its gap included: the entries' texts start aligned. */
export const TO_READ_LABEL_WIDTH = 9

/** Between a revised case's test file and its title. */
export const CASE_TITLE_SEPARATOR = ' › '

/** The order the tdd section counts the kinds of flags in; a kind not named here comes after. */
export const FLAG_ORDER: readonly string[] = [
	'rollback',
	'red after green',
	'test code changed around it',
] satisfies readonly ReceiptFlag[]

/** The flag a change of helper code puts on unchanged cases too: on those, it is noise. */
export const NOISE_PRONE_FLAG: ReceiptFlag = 'test code changed around it'

/** The tdd section's name for the flag on cases whose receipts are otherwise only unchanged. */
export const NOISE_FLAG_LINE = 'helper code changed near unchanged cases (noise)'

/** Where `handover run` moves the lot file of a committed hand-over: in its folder. */
export const ARCHIVED_LOT_FILE = 'lot.json'

/** The line `handover run` writes when it moves the lot file into the hand-over folder. */
export const LOT_FILE_ARCHIVED = 'lot file archived: {path}'

/** What a lot file holds once archived: an empty declaration. */
export const EMPTY_LOT_DECLARATION = '{}\n'

/** The folder (in the system's temporary folder) holding the index of its own a trial base is built in. */
export const TRIAL_INDEX_FOLDER_PREFIX = 'dialecte-trial-index-'

/** The message of a trial base commit: an object no ref points to, only a merge-tree's side. */
export const TRIAL_BASE_MESSAGE = 'dialecte: trial base of a hand-over'

/** Who a trial base commit is by: the repository's own identity may be unset (it never reaches a ref). */
export const TRIAL_BASE_IDENTITY = { name: 'dialecte', email: 'dialecte@localhost' } as const

/** The counts of a `git diff --shortstat` line: files changed, insertions, deletions (each absent when 0). */
export const SHORTSTAT_PATTERNS = {
	files: /(\d+) files? changed/,
	insertions: /(\d+) insertions?\(\+\)/,
	deletions: /(\d+) deletions?\(-\)/,
} as const

/** The text of the card's closing rule: where its terms and the receipts are explained. */
export const HANDOVER_CARD_FOOTER = 'dialecte handover --legend · details: dialecte tdd status'

/** The card's title: `{repository}` the repository's folder name, `{branch}` the branch. */
export const HANDOVER_CARD_TITLE = 'hand-over: {repository} {branch}'

/** The card's sections, in order, each opened by its rule. */
export const HANDOVER_CARD_SECTIONS = {
	commit: 'commit',
	gates: 'gates',
	tdd: 'tdd',
	notes: 'notes',
} as const

/** Between the parts of the verdict line and of a merge line. */
export const CARD_PART_SEPARATOR = ' · '

/** The verdict's tail when no gate line blocks it. */
export const ALL_GATES_GREEN = 'all gates green'

/** The verdict's tail for the lines recorded on another tree: `{names}` in card order. */
export const OTHER_TREE_GATES = 'gates ran on another tree: {names}'

/** A merge lot's size before a rehearsal recorded its tree. */
export const MERGE_NOT_SIZED = 'size after rehearse'

/** A pending lot's commit cell. */
export const PENDING_COMMIT = 'pending'

/** A merge lot's tree when no rehearsal recorded it. */
export const TREE_NOT_RECORDED = 'tree not recorded: rehearse first'

/** After the HEAD line once a run committed: the run never pushes. */
export const NOTHING_PUSHED = 'nothing pushed'

/** How many characters of a sha the card prints. */
export const CARD_SHA_LENGTH = 7

/** The minus sign of the card's line counts (not a hyphen). */
export const MINUS_SIGN = '−'
