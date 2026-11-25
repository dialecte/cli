/**
 * Where a test case stands, from the ledger of its worktree, its test file and its own test call now:
 * - missing receipt: no red (nor unchanged, accepted, revised) receipt;
 * - test edited after red: its file differs from the last red run that froze it (or none froze it), or
 *   its own test call differs from its receipt's (both compared by their tokens: a formatter pass is no
 *   edit);
 * - unchanged: it passed at a red run and is the same case as at the base;
 * - accepted: it passed at a red run and the lot accepts it;
 * - revised: edited at review, it passed at a red run and the lot declares the revision;
 * - green: a green receipt of this very case later than its red and than the last freeze of any test code;
 * - red: otherwise.
 * Only the receipts that count are read (`countingReceipts`): an acceptance or a revision the lot file no
 * longer declares, or an acceptance after a red then a green of the same case, stands for no proof.
 */
import { countingReceipts, receiptsOf } from './counting-receipts.ts'
import { modulesOf } from './select-cases.ts'
import { isTestFile } from './tdd-files.ts'
import { PASS_KINDS, PROOF_KINDS, PYTHON_FILE_PATTERN } from './tdd.constants.ts'
import { skippedAsWrittenReader } from './test-source.ts'

import type {
	CaseStatus,
	LotCaseEntry,
	ReceiptFlag,
	ReportedModule,
	RunCase,
	TddEntry,
	TddFreeze,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

/** Where the case stands now, from its receipts that count (see the module's JSDoc). */
export function caseStatusOf(params: {
	/** The package root: which frozen file is a test file and which a helper (`isTestFile`). */
	root: string
	ledger: TddLedger
	testCase: TestCaseId
	/** sha256 of the case's test file now. */
	testFileHash: string
	/** sha256 of the case's name and test call now. */
	caseHash: string
	/** The test code the case's file depends on (helpers, fixtures); unknown: any changed helper counts. */
	dependencies?: readonly string[]
	/** The lot file's `accept` entries now (see `countingReceipts`). */
	acceptances: readonly LotCaseEntry[]
	/** The lot file's `revised` entries now (see `countingReceipts`). */
	revisions: readonly LotCaseEntry[]
}): CaseStatus {
	const { entries } = params.ledger
	// the receipts the read rule counts: a stale acceptance or revision never stands for a proof
	const counting = new Set<TddEntry>(countingReceipts(params).counting)
	const proof = lastIndexOf({
		entries,
		matches: (entry) =>
			counting.has(entry) && entry.kind !== 'freeze' && PROOF_KINDS.includes(entry.kind),
	})
	if (proof < 0) return 'missing receipt'
	const proofReceipt = entries[proof] as TddReceipt
	if (frozenHashOf({ ledger: params.ledger, file: params.testCase.file }) !== params.testFileHash)
		return 'test edited after red'
	if (proofReceipt.caseHash !== params.caseHash) return 'test edited after red'
	if (proofReceipt.kind === 'unchanged') return 'unchanged'
	if (proofReceipt.kind === 'accepted') return 'accepted'
	if (proofReceipt.kind === 'revised') return 'revised'
	const lastFreeze = lastInvalidatingFreeze({
		root: params.root,
		entries,
		file: params.testCase.file,
		dependencies: params.dependencies,
	})
	const lastGreen = lastIndexOf({
		entries,
		matches: (entry) =>
			counting.has(entry) && entry.kind === 'green' && entry.caseHash === params.caseHash,
	})
	return lastGreen > proof && lastGreen > lastFreeze ? 'green' : 'red'
}

/**
 * The last freeze that can change what a green of the case proved: it froze the case's own file or a
 * helper the case depends on at a new hash. A freeze of another test file (the next step's), or of the
 * same file at the same hash, does not. Its index in `entries`, -1 for none.
 *
 * @intent find the freeze after which a green of a case still proves it
 * @internal
 */
export function lastInvalidatingFreeze(params: {
	root: string
	entries: readonly TddEntry[]
	file: string
	dependencies: readonly string[] | undefined
}): number {
	const { root, entries, dependencies } = params
	const frozen = new Map<string, string>()
	let last = -1
	for (const [index, entry] of entries.entries()) {
		if (entry.kind !== 'freeze') continue
		// a re-freeze at the same hash (a red run that kept the file) changes nothing it proved
		const invalidates = Object.entries(entry.files).some(
			([file, hash]) =>
				(file === params.file ||
					(!isTestFile({ root, file }) &&
						(dependencies === undefined || dependencies.includes(file)))) &&
				frozen.get(file) !== hash,
		)
		if (invalidates) last = index
		for (const [file, hash] of Object.entries(entry.files)) frozen.set(file, hash)
	}
	return last
}

/** The hash of a test-code file at the last red run that froze it; undefined before any. */
export function frozenHashOf(params: { ledger: TddLedger; file: string }): string | undefined {
	const { entries } = params.ledger
	const index = lastIndexOf({
		entries,
		matches: (entry) => entry.kind === 'freeze' && params.file in entry.files,
	})
	return index < 0 ? undefined : (entries[index] as TddFreeze).files[params.file]
}

/** Every flag the receipts of the case carry: a flag is evidence, read from every receipt, skipped or not. */
export function flagsOf(params: { ledger: TddLedger; testCase: TestCaseId }): ReceiptFlag[] {
	return [...new Set(receiptsOf(params).flatMap((receipt) => receipt.flags ?? []))]
}

/** The index of the last entry that `matches`; -1 for none. */
export function lastIndexOf(params: {
	entries: readonly TddEntry[]
	matches: (entry: TddEntry) => boolean
}): number {
	for (let index = params.entries.length - 1; index >= 0; index--)
		if (params.matches(params.entries[index])) return index
	return -1
}

/**
 * The newest receipt of the case that counts (`countingReceipts`), taken at its test file as it is now
 * (`testFileHash`), of a run that passed it (`PASS_KINDS`) or refused it; undefined when no run at these bytes of the
 * file judged it. A receipt taken at other bytes of the file (edited since, or edited then put back) proves nothing now.
 *
 * @intent read the last verdict on a case at the test code it holds now
 * @internal
 */
export function lastRunOf(params: {
	ledger: TddLedger
	testCase: TestCaseId
	/** The hash of the case's test file now, as tdd records it (`hashTestCodeText`). */
	testFileHash: string
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
}): TddReceipt | undefined {
	return countingReceipts(params)
		.counting.filter(
			(receipt) =>
				receipt.testFileHash === params.testFileHash &&
				(PASS_KINDS.includes(receipt.kind) || receipt.kind === 'refused'),
		)
		.at(-1)
}

/**
 * The case's last run at its test file now (`lastRunOf`) passed it at `productionHash`: one rule for `tdd green`,
 * which records a passing case when it is not, and for the hook, which refuses a commit holding a case that is not.
 *
 * @intent tell whether a case is proven passing at the production now
 * @internal
 */
export function isProvenNow(params: {
	ledger: TddLedger
	testCase: TestCaseId
	testFileHash: string
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
	productionHash: string
}): boolean {
	const last = lastRunOf(params)
	return (
		last !== undefined && last.kind !== 'refused' && last.productionHash === params.productionHash
	)
}

/**
 * A reader of whether a case of the run is skipped as written: a script case whose test call goes through `.skip` /
 * `.todo` / `.skipIf(true)` (`skippedAsWrittenReader`, each file parsed once), a pytest case its collect marks skipped
 * (a run that is no collect marks none). Such a case cannot fail anywhere: nothing judges or proves it.
 *
 * @intent tell a case no run can judge
 * @internal
 */
export function createSkippedAsWrittenReader(params: {
	root: string
	/** Each test file of the run, by its path, its text now. */
	texts: ReadonlyMap<string, string>
	/** What the run reported: a pytest case's skip mark. */
	modules: readonly ReportedModule[]
}): (testCase: RunCase) => boolean {
	const readers = new Map<string, (location: RunCase['location']) => boolean>()
	return function isSkippedAsWritten(testCase) {
		if (PYTHON_FILE_PATTERN.test(testCase.file))
			return modulesOf({ root: params.root, modules: params.modules, file: testCase.file }).some(
				(testModule) =>
					testModule.cases.some(
						(reported) =>
							reported.name === testCase.name &&
							reported.project === testCase.project &&
							reported.skipMarked === true,
					),
			)
		const reader =
			readers.get(testCase.file) ??
			skippedAsWrittenReader({ text: params.texts.get(testCase.file) ?? '', file: testCase.file })
		readers.set(testCase.file, reader)
		return reader(testCase.location)
	}
}
