/** What `dialecte lot recap` reads from the records of a hand-over, before it prints a line. */
import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { KeyedLedgerItem, RunEntry } from '../mutation/mutation.types.ts'
import type { DecisionRow } from '../review-rounds/review-rounds.types.ts'
import type { CaseStatus, LotCaseEntry } from '../tdd/tdd.types.ts'

/** A finding's state, as the recap groups the ledger's states. */
export type FindingOutcome = 'fixed' | 'accepted' | 'logged' | 'open'

/** One row of the findings ledger, its pipes unescaped. */
export type RecapFinding = {
	/** As written: `R<round>-<k>` as `lot finding` writes it, or any hand-written id (`TR3-1`, `F-a`). */
	id: string
	/** The round cell's round, else the one an `R<round>-` id names. */
	round: number
	/** As `lot finding` writes it: `blocking`, `should fix`, `nit`. */
	severity: string
	/** `file:line`, an absolute path made relative to the repository or the workspace folder. */
	at: string
	/** The finding's text, one leading reviewer tag `[...]` dropped. */
	finding: string
	outcome: FindingOutcome
	/** For an accepted finding: `accepted (<reason>)`'s text inside the outer parentheses, else the rest. */
	reason?: string
}

/** A lot of the hand-over: its subject, and its commit once committed. */
export type RecapCommit = {
	subject: string
	commit?: string
}

/** Every record the recap prints from. */
export type RecapRecords = {
	commits: RecapCommit[]
	/** The branch no longer holds the lots on top of the recorded HEAD: no lot is listed as committed. */
	branchRewritten: boolean
	/** The cases the newest gate record of the current tree judged; undefined when none did. */
	judgedCases: ReadonlyMap<string, CaseStatus> | undefined
	/** The gate and rules lines, without the review line; empty when nothing was recorded. */
	checks: CardGateLine[]
	mutation: RecapMutation
	/** The ledger's rows; undefined when the folder holds no ledger. */
	findings: RecapFinding[] | undefined
	accepted: LotCaseEntry[]
	revised: LotCaseEntry[]
	decisions: DecisionRow[]
	user: string
}

/** Each lot's subject and commit, and whether the branch was rewritten under them. */
export type RecapCommits = {
	commits: RecapCommit[]
	branchRewritten: boolean
}

/** Where a `file:line` cell's absolute paths may point: the repository, then the workspace folder. */
export type RecapPathBases = {
	/** The lot's repository, each spelling of it (as recorded, its real path). */
	repository: string[]
	/** The parent folder of the repository's main checkout, each spelling of it. */
	workspace: string[]
}

/**
 * The mutation runs of the lot (its branch and the branches it merges): `undeclared` when the package declares no
 * mutation scope; else the runs, oldest first, the survivors they killed or recorded and the lot's scheduled
 * survivors (all empty when the repository is gone).
 */
export type RecapMutation =
	| { kind: 'undeclared' }
	| { kind: 'declared'; runs: RunEntry[]; moved: KeyedLedgerItem[]; scheduled: KeyedLedgerItem[] }
