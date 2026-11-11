import type { LotStateName } from '../store/store.types.ts'
import type { ReceiptFlag } from '../tdd/tdd.types.ts'
import type { HandoverState } from './handover.types.ts'

/** The states an entry of the hand-over registry records; the entry state type derives from it. */
export const HANDOVER_ENTRY_STATES = ['pending', 'committed', 'abandoned'] as const

/** Name of the lock file, in the repository's git folder, while a hand-over script waits or runs. */
export const HANDOVER_LOCK_FILE = 'dialecte-handover.lock'

/** What the name of a stale lock set aside holds after the lock's: a taker's own name, removed once it is read. */
export const LOCK_ASIDE_INFIX = '.aside-'

/** How many times a writer tries to take the lock before it answers with whoever holds it. */
export const LOCK_TAKE_ATTEMPTS = 8

/**
 * Where git keeps the folder of each linked worktree, in the git common folder, and the file of that folder
 * naming the worktree's `.git` (so a worktree's own git folder is found without git, its worktree gone or not).
 */
export const LINKED_WORKTREES_FOLDER = 'worktrees'
export const LINKED_WORKTREE_GITDIR_FILE = 'gitdir'

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
	/** Written by `handover abandon`: the hand-over will not run (`{ "at" }`, the time it was abandoned). */
	abandoned: 'abandoned.json',
	/** Written when a run (`--rehearse` or not) ends: `{ "sleptMs"? }`, the sleep it spanned; the DONE card reads it. */
	lastRun: 'last-run.json',
} as const

/** The folder, in the repository's shared git folder, registering every hand-over written (one entry each). */
export const HANDOVER_STORE_FOLDER = 'dialecte-handover'

/** The extension of an entry of the store: `<name>.json`. */
export const STORE_ENTRY_EXTENSION = '.json'

/** A run of characters a branch name turns into one `-` in a store name. */
export const STORE_NAME_REPLACED_CHARACTERS = /[^A-Za-z0-9._-]+/g

/** The counter of the second hand-over of a branch on a day (the first has none). */
export const STORE_NAME_FIRST_COUNTER = 2

/** The date that starts a store name (`yyyy-mm-dd`). */
export const STORE_NAME_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** An argument of `show`, `run` or `abandon` that may name a worktree index (`0171`, or unpadded `171`). */
export const STORE_INDEX_ARGUMENT_PATTERN = /^\d+$/

/** What follows the date and the branch slug in a store name after the first: `-<counter>`. */
export const STORE_NAME_COUNTER_PATTERN = /^-(\d+)$/

/** The dashes at either end of a branch slug, left out of the name. */
export const STORE_NAME_EDGE_DASHES = /^-+|-+$/g

/** The states `handover run` without a folder runs: something still to commit, nothing else moved. */
export const RUNNABLE_STATES: readonly HandoverState[] = ['pending', 'partly committed']

/** The refusals of `handover show`, `run` and `abandon` before any hand-over is read. */
export const HANDOVER_STORE_REFUSALS = {
	noRepository: 'handover {verb}: {cwd} is in no git repository',
	noHandover: 'handover {verb}: {argument} names no hand-over: {reason}',
	folderGone: 'handover {verb}: {name}: its folder {folder} is gone',
} as const

/** What `handover show` prints besides the card. */
export const HANDOVER_SHOW_TEXTS = {
	emptyStore: 'handover show: no hand-over in {store}',
	noneForBranch: 'handover show: no hand-over of {branch} in {store}; it holds:',
	repositoryMissing: 'handover show: {folder}: its repository {repository} does not exist',
	changed:
		'{count} file(s) differ from the reviewed snapshot: re-gate, then dialecte handover {lots} --rehash',
} as const

/** What `handover run` without a folder prints when it does not run one. */
export const HANDOVER_RUN_TEXTS = {
	nothingToRun: 'handover run: no hand-over to run in {store} (none pending or partly committed)',
	several:
		'handover run: {count} hand-overs to run in {store}, nothing run: name one (dialecte handover run <name>)',
	abandoned: 'handover run: {folder} is abandoned ({marker}): nothing run; write a new hand-over',
} as const

/** `handover` without a lots file or a verb: its verbs, `write` first. */
export const HANDOVER_USAGE =
	'handover: expected a verb: write <lots.json> [--out <id|folder>] [--rehash] [--json] | show [<name|folder>] | review <name|index|folder> [--json] [--print] | run [<name|folder>] | abandon [<name|folder>] | list | --legend (handover <lots.json> is handover write <lots.json>)'

/** `handover <lots.json> --rehash` of an abandoned folder: refused, nothing written. */
export const HANDOVER_REHASH_ABANDONED_REFUSAL =
	'handover: {folder} is abandoned ({marker}): nothing written; write the hand-over into a new folder (--out <dir>)'

/**
 * What a hand-over verb refuses on a lot folder, and a committed hand-over for any folder (exit 2, nothing
 * written); `{name}` is the lot's full name. The write's refusals take the `handover: ` prefix where printed.
 */
export const HANDOVER_LOT_REFUSALS = {
	damaged:
		'{name} is damaged ({damage}): its folder takes no hand-over; to move it aside: dialecte lot stop {name} --reason <text>',
	simulated: 'a simulated lot has no hand-over ({name})',
	ended: '{name} is {state}: its folder takes no hand-over',
	question: 'answer {question} first: {answer}',
	repository: "repository {repository} is not the lot's worktree {worktree}",
	branch: "branch {branch} is not the lot's branch {lotBranch}",
	committed: '{entry} is committed: a committed hand-over is never rewritten',
	runCanceled: 'handover run: {name} is canceled: its hand-over is not run',
	abandon:
		'{name} is a lot: its hand-over is redone with dialecte handover write --rehash --out {name}; to end the lot: dialecte lot stop {name}',
	danglingLink:
		'--out leads through {link}, a symbolic link to nothing ({target}): name the folder itself, or remove the link',
} as const

/** The lot states whose folder takes no hand-over. */
export const HANDOVER_REFUSED_LOT_STATES: readonly LotStateName[] = ['canceled', 'failed']

/** A run and an abandon that crossed: each refuses once it finds the other's marker after writing its own. */
export const HANDOVER_INTERLEAVING_REFUSALS = {
	run: 'handover run: {folder} was abandoned while this run started ({marker}): nothing run, its run marker removed',
	abandon:
		'handover abandon: a run of {folder} started while it was being abandoned (pid {pid}, since {startedAt}, marked by {marker}): nothing abandoned, the lock and the entry kept',
} as const

/** What `handover abandon` prints. */
export const HANDOVER_ABANDON_TEXTS = {
	nothingHeld:
		'handover abandon: nothing is held in {root}: name the hand-over (dialecte handover abandon <name|folder>)',
	already: 'handover abandon: {folder} is abandoned already (since {at})',
	committed: 'handover abandon: every lot of {folder} is committed: nothing to abandon',
	running:
		'handover abandon: the hand-over {folder} is running (pid {pid}, since {startedAt}, marked by {marker}): nothing abandoned; wait until its run ends',
	abandoned: 'handover abandon: {folder} abandoned: it will not run, its commits stay',
	lockReleased: 'the lock {lock} released',
	lockKept: 'the lock {lock} names another hand-over ({script}): left as it is',
} as const

/** A conflict marker line git leaves in a file it could not merge. */
export const CONFLICT_MARKER_PATTERN = /^(<{7}|>{7})( |$)/m

/** A full commit or tree sha. */
export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/

/** The lock whose packages `node_modules` must hold before a commit that stages a change of it. */
export const PACKAGE_LOCK_FILE = 'package-lock.json'

/** The guard that finds the lots already committed on top of the recorded HEAD. */
export const HEAD_GUARD_NAME = 'head'

/** The head guard's detail when every lot is on HEAD as reviewed: the guards after it are not run. */
export const ALREADY_COMMITTED_DETAIL =
	'every lot is committed already: the hand-over is already committed, the guards after head are not run'

/** `lot close` of a hand-over its registry entry records closed by an earlier close: nothing moved, exit 0. */
export const LOT_CLOSE_ALREADY_CLOSED = '{handover} already closed'

/** How many commits only a worktree's HEAD reflog reaches `lot close` names when it keeps it; the rest are counted. */
export const HEAD_REFLOG_COMMITS_SHOWN = 3

/** `lot close` run from inside the worktree it would close: kept, never moved from under its own feet. */
export const CLOSE_FROM_INSIDE =
	'lot close runs from inside {worktree}: run it from another folder, such as cd {main}'

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

/** The last line of a rehearsal whose folder was removed here (no trash beside the repository). */
export const REHEARSAL_REMOVED_LINE = 'removed the rehearsal clone and its folder'

/**
 * The marker a real `handover run` holds in its hand-over folder while it runs (`{ "pid", "startedAt" }`),
 * removed at its end: `dialecte gate` refuses while its process is alive.
 */
export const HANDOVER_RUN_MARKER_FILE = 'running.json'

/**
 * A refusal while the repository is held by a hand-over the caller may not run under: names the script, why
 * (`{why}`, empty or a parenthesis), and the lock, and says what to do without touching the lock.
 */
export const HANDOVER_HOLD_REFUSAL =
	"the repository is held by the hand-over {script}{why} (its lock: {lock}): run it first (its last commit releases the lock), or hand the lock's path to the person who runs the repository, who decides"

/** Why the hand-over holding the repository is not one written for it. */
export const HANDOVER_HOLD_REASONS = {
	scriptGone: ' (no such script)',
	noLotsFile: ' (its folder holds no lots file: {reason})',
	otherRepository: ' (written for another repository: {repository})',
} as const

/** Under the card `handover <lots.json>` printed, above the command that runs it; `{lots}` the lots file, quoted. */
export const HANDOVER_WRITTEN_NOTE =
	'Review the card, then run it. The repository is held until every lot is committed; `dialecte gate` still runs under this hand-over (after a late edit: re-gate, then `dialecte handover {lots} --rehash`):'

/** A refusal while a real run of the hand-over written for this repository is in progress. */
export const HANDOVER_RUNNING_REFUSAL =
	'the hand-over {folder} is running (pid {pid}, since {startedAt}, marked by {marker}): wait until its run ends, then run the gate again'

/** The gate's line when it runs under the hand-over written for its repository. */
export const GATE_UNDER_HANDOVER =
	'under the hand-over {folder} of this repository: once the gate is green, refresh it with `dialecte handover {lots} --rehash`'

/** The lot's files stayed staged and git's index lock is there: what to do without touching the lock. */
export const STILL_STAGED_INDEX_LOCK =
	"git's index lock {lock} is still there: hand its path to the person who runs the repository, who decides once no git runs in it, then"

/** The commit a lots file names: a sha or an unambiguous prefix of one. */
export const HEAD_PATTERN = /^[0-9a-f]{7,40}$/

/** How many leading bytes decide that a file is binary (no references looked for in it). */
export const BINARY_PROBE_LENGTH = 8000

/** Before each line a lot's commit (its hooks) prints. */
export const HOOK_OUTPUT_PREFIX = '  │ '

/** The folder (in the system's temporary folder) holding a lot's full hook log. */
export const HOOK_LOG_FOLDER_PREFIX = 'dialecte-hook-'

export const HOOK_HEARTBEAT_LABEL = '  … hook running'

/**
 * The rehearsal folders `--rehearse` makes (the clone inside, named as its repository, with the links to the
 * repository's siblings beside it); `worktree prune` finds them, and an earlier cli's clones, by it.
 */
export const REHEARSAL_FOLDER_PREFIX = 'dialecte-rehearse-'

/**
 * Where rehearsal folders are made on a POSIX system: a short path whatever the system's temporary folder
 * (a tool's socket path under the hook's temporary folder must stay within the system's limit of about 100
 * bytes).
 */
export const POSIX_REHEARSAL_SCRATCH_ROOT = '/tmp'

/** The hook's temporary folder (`TMPDIR`) in the rehearsal folder: short, removed with it. */
export const REHEARSAL_TEMPORARY_FOLDER = '.tmp'

/** How deep `handover list` looks for hand-over folders under its root. */
export const LIST_DEPTH = 4

/** Width of the guard name column of the progress lines. */
export const GUARD_NAME_WIDTH = 11

/** What the `references` guard says a lot holds, per profile: a consumer's lots may name tickets and plan tags. */
export const CONTRIBUTOR_REFERENCES_DETAIL = 'a plan tag or a standard citation'
export const CONSUMER_REFERENCES_DETAIL = 'a standard citation'

/** The `contrib` guard of a contributor: refused without a green record of the tree, or naming the failed rows. */
export const CONTRIB_GUARD_NAME = 'contrib'
export const NO_GREEN_CONTRIB_DETAIL =
	'no green dialecte contrib of this tree: run dialecte contrib'
export const FAILED_CONTRIB_DETAIL =
	'dialecte contrib failed at {rows} on this tree: fix them, then run it again'
export const GREEN_CONTRIB_DETAIL = 'green on this tree at {at}'
/** A rehearsal never stops at the `contrib` guard: it says what the real run would refuse. */
export const REHEARSAL_CONTRIB_DETAIL = '{detail} (the real run refuses; the rehearsal goes on)'

/**
 * The script a hand-over writes. People run it with `sh` (macOS: bash 3.2 in posix mode), so its second
 * line re-executes it with bash when the shell is not bash or is bash in posix mode, `POSIXLY_CORRECT`
 * unset (it would put the new bash back in posix mode, re-executing forever). It runs the cli the
 * repository installs; a cli without `handover run` (missing, or older) gets one line saying how to run
 * the hand-over anyway.
 *
 * Placeholders: `__HEADER__`, `__REPOSITORY__`, `__FALLBACK__` (the command with the cli that wrote the
 * script).
 */
export const COMMIT_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
if [ -z "\${BASH_VERSION:-}" ] || shopt -oq posix 2>/dev/null; then exec env -u POSIXLY_CORRECT bash "$0" "$@"; fi
__HEADER__
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

/** How long the repository's cli gets to answer the probe: wide, a loaded machine must not read as no repository cli. */
export const HANDOVER_PROBE_TIMEOUT_MILLISECONDS = 60_000

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
export const TO_READ_LABELS = {
	revised: 'revised',
	gone: 'gone',
	unused: 'unused',
	/** A case of the change whose receipts the read rule skips (a stale acceptance or revision). */
	skipped: 'skipped',
} as const

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

/** The command a READY card's `review` row names; `{id}` the hand-over's name, else its folder, as one shell word. */
export const HANDOVER_REVIEW_COMMAND = 'dialecte handover review {id}'

/** The card's `review` row: the command, two spaces, the editor it opens. */
export const HANDOVER_REVIEW_ROW = '{command}  (opens {editor})'

/** The row when no editor is found: `{key}` the git config key that names one. */
export const HANDOVER_REVIEW_NO_EDITOR_ROW = '{command}  (no editor found: set git config {key})'

/** Where `handover review` writes a merge hand-over's own change, under the hand-over folder. */
export const REVIEW_DIFF_FOLDER = 'review'
export const REVIEW_DIFF_FILE = 'lot.diff'

/** The prefix of the scratch folder holding the index the review diff is read through. */
export const REVIEW_INDEX_FOLDER_PREFIX = 'dialecte-review-index-'

/**
 * The git options the review diff is read with, whatever the person's git config: no colour, no external diff
 * nor text conversion, the `a/` `b/` prefixes, paths from the repository's top, no rename folding.
 */
export const REVIEW_DIFF_CONFIG = [
	'-c',
	'color.ui=never',
	'-c',
	'diff.noprefix=false',
	'-c',
	'diff.mnemonicPrefix=false',
	'-c',
	'diff.relative=false',
] as const
export const REVIEW_DIFF_OPTIONS = [
	'--no-color',
	'--no-ext-diff',
	'--no-textconv',
	'--no-renames',
	'--src-prefix=a/',
	'--dst-prefix=b/',
] as const

/**
 * The closing rule of the card of a known hand-over: `{id}` its registered name, or its folder without an entry
 * (shell-quoted when it needs it), so a partial copy of the card still says which hand-over it is.
 */
export const HANDOVER_CARD_NAMED_FOOTER =
	'dialecte handover show {id} · run {id} · --legend · details: dialecte tdd status'

/** The card's title: `{repository}` the repository's folder name, `{branch}` the branch. */
export const HANDOVER_CARD_TITLE = 'hand-over: {repository} {branch}'

/** The card's title from a numbered worktree: `{index}` its index, then as `HANDOVER_CARD_TITLE`. */
export const HANDOVER_CARD_NUMBERED_TITLE = 'hand-over: {index} {repository} {branch}'

/** The commit section's line naming the worktree the lots are committed in. */
export const WORKTREE_LINE_LABEL = 'worktree '

/** The card's sections, in order, each opened by its rule. */
export const HANDOVER_CARD_SECTIONS = {
	commit: 'commit',
	gates: 'gates',
	contrib: 'contrib',
	review: 'review',
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

/** A commit hook that stages files of its own: its commit may hold another tree than any record checked. */
export const HOOK_STAGES_PATTERN =
	/\bgit\s+add\b|\bgit\s+stage\b|\blint-staged\b|\bgit\s+update-index\b/

/** The decisions of a rehearsal, per lot, in the hand-over folder. */
export const REHEARSAL_DECISIONS_FILE = 'rehearsal.json'

/** A rehearsal's line per lot: `lot <n>/<N>  reused  <reason>` or `lot <n>/<N>  rehearse  <reason>`. */
export const REHEARSAL_DECISION_LINE = 'lot {number}/{count}  {decision}  {reason}'

/** How a decision reads on its line. */
export const REHEARSAL_DECISION_WORDS = { reused: 'reused', rehearsed: 'rehearse' } as const

/** Under a reused merge lot: the tree its commit will hold, to record in the lot as `tree`. */
export const REUSED_MERGE_TREE_LINE = '  tree {tree}'

/** A contributor's lot whose tree has no green contrib record: `dialecte contrib` runs in the clone first. */
export const REHEARSAL_CONTRIB_LINE =
	'lot {number}/{count}  contrib  no green dialecte contrib of tree {tree}: run in the clone, on the tree the lots leave'

/**
 * The rehearsal's contrib run cannot answer the real run: the key the clone would record differs from the one the
 * `contrib` guard asks for, in these parts.
 */
export const REHEARSAL_CONTRIB_UNANSWERABLE =
	"not run: the lots change the {parts}, so no contrib record of this hand-over can answer the real run's guard"

/** The parts of a contrib key, named as a person changes them. */
export const CONTRIB_KEY_PARTS = [
	{ field: 'commandHash', name: 'contrib steps' },
	{ field: 'lockHash', name: 'install' },
	{ field: 'linked', name: 'linked dependencies' },
	{ field: 'tree', name: 'tree' },
] as const

/** The rehearsal's step that runs `dialecte contrib` in the clone. */
export const REHEARSAL_CONTRIB_STEP = 'rehearsal contrib'

/** When no lot needs rehearsing: no clone is made. */
export const REHEARSAL_SKIPPED_LINE = "rehearsal skipped: every lot's tree has a green record"

/** Why a lot is reused or rehearsed; `{tree}`, `{tip}` are short tree ids. */
export const REHEARSAL_REASONS = {
	fullGate: 'green gate --full on tree {tree}',
	releaseGate: 'green gate --release on tree {tree}',
	baseChanged: 'the base moved: record {record}, hand-over {handover}',
	tipRecord: "green {mode} record of the tip's tree {tree}",
	noFullGate: 'no green gate --full on tree {tree}',
	noTipRecord: "no green record of the tip's tree {tree}",
	lotChangesLock: 'the lot changes package-lock.json',
	mergeChangesLock: 'the merge changes package-lock.json',
	hookStages: 'the hook stages files ({match})',
	branchMoved: '{branch} moved: the merge leaves tree {tree}, the tip holds {tip}',
	installChanged: 'node_modules changed since the record',
	linkedChanged: 'a linked dependency changed since the record',
	commandChanged: 'the {mode} command changed since the record',
	full: '--full',
	noPlan: 'no plan: {error}',
} as const
