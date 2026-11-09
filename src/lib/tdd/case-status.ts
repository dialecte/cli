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
import { PROOF_KINDS, TEST_FILE_PATTERN } from './tdd.constants.ts'

import type {
	CaseStatus,
	LotCaseEntry,
	ReceiptFlag,
	TddEntry,
	TddFreeze,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

/** Where the case stands now, from its receipts that count (see the module's JSDoc). */
export function caseStatusOf(params: {
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
 * same file at the same hash, does not.
 */
function lastInvalidatingFreeze(params: {
	entries: readonly TddEntry[]
	file: string
	dependencies: readonly string[] | undefined
}): number {
	const { entries, dependencies } = params
	const frozen = new Map<string, string>()
	let last = -1
	for (const [index, entry] of entries.entries()) {
		if (entry.kind !== 'freeze') continue
		// a re-freeze at the same hash (a red run that kept the file) changes nothing it proved
		const invalidates = Object.entries(entry.files).some(
			([file, hash]) =>
				(file === params.file ||
					(!TEST_FILE_PATTERN.test(file) &&
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

function lastIndexOf(params: {
	entries: readonly TddEntry[]
	matches: (entry: TddEntry) => boolean
}): number {
	for (let index = params.entries.length - 1; index >= 0; index--)
		if (params.matches(params.entries[index])) return index
	return -1
}
