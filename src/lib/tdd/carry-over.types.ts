import type {
	LotCaseEntry,
	ProductionState,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

/**
 * What `tdd red` carries receipts from: the canceled lot's name, its ledger as `lot start --from` copied it, and the
 * lot file entries (`accept`, `revised`) that copy counted with.
 */
export type Carry = {
	from: string
	ledger: TddLedger
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
}

/** Why `carry.json` or one of its copies is no carry: the file named, the reason in one line. */
export type CarryFailure = { failure: string }

/**
 * What `lotCarryOf` reads of one passing case, all of it injected: the source's records, the case as it stands now,
 * and git behind two readers so that the rule stays a pure function.
 */
export type LotCarryParams = {
	carry: Carry
	/** The package root: tells a test file from a helper (`isTestFile`). */
	root: string
	testCase: TestCaseId
	/** sha256 of the case's name and test call now. */
	caseHash: string
	/** The hash of the case's test file now (`hashTestCodeText`). */
	testFileHash: string
	/**
	 * The test code the case's own file depends on now (its helpers and fixtures; never another test file's). Only
	 * these are compared with what the source froze or, never frozen there, with their blob at the source's base.
	 */
	dependencies: readonly string[]
	/** The conftests (sorted, relative to the root) a pytest case's file runs under now; empty for any other file. */
	conftests: readonly string[]
	/** The hash of a test-code file now (`hashTestCodeText` of its text); undefined when the file is gone. */
	hashNow: (file: string) => string | undefined
	/**
	 * The production state of the package now, measured from the new lot's base `production.base`. A production path
	 * today's state does not name is unchanged since that base, so its content now is its blob there (`readBaseBlob`
	 * at `production.base`): the worktree bytes are not injected, and a file that blob lacks is deleted. The source's
	 * side of a path its state does not name is its blob at the base the state was recorded under, never this one.
	 */
	production: ProductionState
	/**
	 * The text of `path` in the commit `base` (the package-relative path); undefined when the commit holds no such
	 * file, which counts as deleted for a production path and as a difference for a test-code dependency.
	 */
	readBaseBlob: (params: { base: string; path: string }) => string | undefined
	/** Whether git can read the commit `base`. */
	isBaseReadable: (params: { base: string }) => boolean
}

/** A counted green of the source's case after its proof: the receipt and its index in the source's ledger. */
export type CarryGreen = { receipt: TddReceipt; index: number }

/** The source's red of a case and the greens of it a carry may name, in ledger order. */
export type CarryProof = { proof: TddReceipt; greens: CarryGreen[] }
