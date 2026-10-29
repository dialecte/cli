/**
 * Where a test case stands, from the ledger of its worktree, its test file and its own test call now:
 * - missing receipt: no red (nor unchanged) receipt;
 * - test edited after red: its file differs from the last red run that froze it (or none froze it), or
 *   its own test call differs from its receipt's;
 * - unchanged: it passed at a red run and is the same case as at the base;
 * - accepted: it passed at a red run and the lot accepts it;
 * - green: a green receipt of this very case later than its red and than the last freeze of any test code;
 * - red: otherwise.
 */
import type {
	CaseStatus,
	ReceiptFlag,
	TddEntry,
	TddFreeze,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

export function caseStatusOf(params: {
	ledger: TddLedger
	testCase: TestCaseId
	/** sha256 of the case's test file now. */
	testFileHash: string
	/** sha256 of the case's name and test call now. */
	caseHash: string
}): CaseStatus {
	const { entries } = params.ledger
	const { testCase } = params
	const proof = lastIndexOf({
		entries,
		matches: (entry) =>
			isReceiptOf({ entry, testCase }) &&
			(entry.kind === 'red' || entry.kind === 'unchanged' || entry.kind === 'accepted'),
	})
	if (proof < 0) return 'missing receipt'
	const proofReceipt = entries[proof] as TddReceipt
	if (frozenHashOf({ ledger: params.ledger, file: testCase.file }) !== params.testFileHash)
		return 'test edited after red'
	if (proofReceipt.caseHash !== params.caseHash) return 'test edited after red'
	if (proofReceipt.kind === 'unchanged') return 'unchanged'
	if (proofReceipt.kind === 'accepted') return 'accepted'
	const lastFreeze = lastIndexOf({ entries, matches: (entry) => entry.kind === 'freeze' })
	const lastGreen = lastIndexOf({
		entries,
		matches: (entry) =>
			isReceiptOf({ entry, testCase }) &&
			entry.kind === 'green' &&
			entry.caseHash === params.caseHash,
	})
	return lastGreen > proof && lastGreen > lastFreeze ? 'green' : 'red'
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

/** Every flag the receipts of the case carry. */
export function flagsOf(params: { ledger: TddLedger; testCase: TestCaseId }): ReceiptFlag[] {
	return [...new Set(receiptsOf(params).flatMap((receipt) => receipt.flags ?? []))]
}

/** The receipts of a case, oldest first. */
export function receiptsOf(params: { ledger: TddLedger; testCase: TestCaseId }): TddReceipt[] {
	return params.ledger.entries.filter(
		(entry): entry is TddReceipt =>
			entry.kind !== 'freeze' && isReceiptOf({ entry, testCase: params.testCase }),
	)
}

function isReceiptOf(params: { entry: TddEntry; testCase: TestCaseId }): boolean {
	const { entry, testCase } = params
	return (
		entry.kind !== 'freeze' &&
		entry.file === testCase.file &&
		entry.name === testCase.name &&
		entry.project === testCase.project
	)
}

function lastIndexOf(params: {
	entries: readonly TddEntry[]
	matches: (entry: TddEntry) => boolean
}): number {
	for (let index = params.entries.length - 1; index >= 0; index--)
		if (params.matches(params.entries[index])) return index
	return -1
}
