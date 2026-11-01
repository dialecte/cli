/**
 * What `dialecte gate` and `dialecte rules` record in the worktree's git folder (`git rev-parse --git-path
 * <file>`), and the gate lines the hand-over card prints from those records.
 */
import type { GateMode, StepCounts, StepStatus } from '../gate/gate.types.ts'
import type { JudgedCase } from '../tdd/tdd.types.ts'

/** One step of a gate run as recorded: the hygiene and the machine lock are no steps, never recorded. */
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
}

/** What wrote a gate record: `dialecte gate --fast` / `--full`, or a commit's hook during `handover run`. */
export type GateRecordMode = GateMode | 'hook'

/**
 * `dialecte-gate-fast.json` / `dialecte-gate-full.json`: the last gate run of that mode that reached its
 * steps (a run refused at the hygiene or the machine lock leaves the file as it was).
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
}
