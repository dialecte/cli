/**
 * What `dialecte gate` and `dialecte rules` record in the worktree's git folder (`git rev-parse --git-path
 * <file>`), and the gate lines the hand-over card prints from those records.
 */
import type { UsedGateBase } from '../gate/gate-base.types.ts'
import type { GateMode, StepCounts, StepSelection, StepStatus } from '../gate/gate.types.ts'
import type { JudgedCase } from '../tdd/tdd.types.ts'
import type { ModeCommandHashes } from './mode-command-hashes.types.ts'

/** One step of a gate run as recorded: the hygiene is no step, never recorded. */
export type RecordedStep = {
	name: string
	status: StepStatus
	/** What the step's own summary lines said (`readStepCounts`); `{}` when it printed none. */
	counts: StepCounts
	/** Why a passed step ran no test, or what an exemption covers. */
	note?: string
	/** Why the step failed or was skipped. */
	reason?: string
	/** The tdd step: the cases of the change it judged, what the card counts (`TddCheck.cases`). */
	cases?: JudgedCase[]
	/** A hook's test step `gate --hook` answered from the green `gate --full` record of this time and short HEAD. */
	reused?: RecordOrigin
	/** A scoped step that wrote a valid selection: what it recorded. */
	selection?: StepSelection
	/** The configured step is heavy (true only, never false). */
	heavy?: true
	/** A failed or flaky step: every file it named as failing, sorted, unique. */
	failing?: string[]
}

/** The run a record names: when it ran (ISO 8601) and its HEAD (full, or the short sha a hook's line printed). */
export type RecordOrigin = { at: string; head: string }

/** What wrote a gate record: `dialecte gate --fast` / `--full`, `dialecte contrib`, or a commit's hook during `handover run`. */
export type GateRecordMode = GateMode | 'hook' | 'contrib'

/**
 * What a check ran on, as a record names it: the tree it ran on, what npm had installed, what ran, and the
 * folders of the `file:` dependencies as they were. Two records with the same key checked the same thing.
 */
export type CheckKey = {
	/** The git tree id of the state it ran on. */
	tree: string
	/** sha256 (hex) of `node_modules/.package-lock.json`, `none` when absent. */
	lockHash: string
	/** sha256 (hex) of what ran: the gate's resolved steps and `--base`, or the commit hook's files. */
	commandHash: string
	/** sha256 (hex) over the folders of the `file:` dependencies (paths, sizes, mtimes). */
	linked: string
}

/**
 * `dialecte-gate-fast.json` / `dialecte-gate-full.json`: the last gate run of that mode that reached its
 * steps (a run refused at the hygiene leaves the file as it was).
 * `dialecte-gate-hook.json`: the last commit hook `handover run` saw end (a stalled one records nothing).
 */
export type GateRecord = {
	mode: GateRecordMode
	/** When it ran, ISO 8601. */
	at: string
	/** HEAD as a full sha: for a hook, the commit it let through, or HEAD when it failed. */
	head: string
	/**
	 * sha256 (hex) of the tree the worktree would commit (for a hook, taken before the commit): HEAD's tree
	 * with the changed and untracked files on top and the deleted ones removed, `.dialecte/` left out.
	 * Committing those changes leaves it as it was (HEAD moves, the tree is the same); a gate record and a
	 * rules record of one tree hold the same hash.
	 */
	stateHash: string
	/** The tdd step, then the configured steps, in run order; for a hook, the steps its summary names. */
	steps: RecordedStep[]
	/** What the run checked; absent on a record written by an older cli, which is never reused. */
	key?: CheckKey
	/** The run answered from the record of `at` and `head` (full sha) instead of running its steps. */
	reused?: RecordOrigin
	/** The gate base the run resolved; absent when no scoped step was configured. */
	base?: UsedGateBase
	/** A rehearsal's hook record: it ran in a scratch clone of the repository. */
	origin?: 'rehearsal'
}

/** `dialecte-rules.json`: the last `dialecte rules` run on the changed files (a run on named files records nothing). */
export type RulesRecord = {
	/** When it ran, ISO 8601. */
	at: string
	/** HEAD as a full sha. */
	head: string
	/** As `GateRecord.stateHash`. */
	stateHash: string
	files: string[]
	errors: number
	warnings: number
}

/** `✓` passed, `!` to look at (skipped, not run, from an older tree, only nits open), `✗` failed. */
export type CardGateStatus = 'passed' | 'warning' | 'failed'

/**
 * One line of the card's `gates` section (`--json`: the card's `gates` array): `<mark> <name>  <detail>`.
 * The lots file's `gates` text is no gate: it is the card's `notes` (absent when the lots file has none).
 */
export type CardGateLine = {
	/** A gate step (`check`, `tdd`), `rules`, `review`, or `gate` when no gate record exists. */
	name: string
	status: CardGateStatus
	/**
	 * After the name: the counts (`1056 passed · 4 skipped`, `397/397`, `0 errors · 0 warnings`), or why it
	 * is not green (`not run here (no skills:check script)`, `never run on this tree`), with
	 * ` (the tree changed since)` when the record's state hash is not the worktree's; empty when nothing
	 * more is said (`✓ build`).
	 */
	detail: string
	/**
	 * The record is of another tree than the worktree's now (` (the tree changed since)`): such a line blocks
	 * the hand-over unless it failed (then it counts as failed). Absent on a record of this tree.
	 */
	stale?: true
	/**
	 * A contrib row's record source, as its detail ends (`rehearsal`, `from <commit>`): the card's one contrib line
	 * says it once. Absent on a gate line, a live row, and a record made at HEAD or a commit HEAD holds.
	 */
	source?: string
	/** A scoped step's line: the selection its record holds (`--json`). */
	selection?: StepSelection
	/** A failed step's line: the whole list of files it named as failing (`--json`). */
	failing?: string[]
}

/**
 * What the card reads of the package's gate config once: the base it reads records at (absent without a scoped
 * step), the command hash of each mode there, or the message of a config the cli cannot run.
 */
export type CardGateConfig = {
	base?: UsedGateBase
	/** Absent when the config cannot be read: no stored record can be told current then. */
	hashes?: ModeCommandHashes
	/** The `GateConfigError` message of a config the cli cannot run. */
	invalid?: string
}

/** How a record's gate base reads against the card's: the same, an ancestor of it, or neither. */
export type RecordBaseCheck = 'same' | 'older' | 'moved'
