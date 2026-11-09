/**
 * The receipts of a case that count, and the ones the read rule skips: an `accepted` receipt whose `accept`
 * entry the lot file no longer holds, or that a red then a green of the same case hash precede (an acceptance
 * never overrides a proof); a `revised` receipt whose `revised` entry the lot file no longer holds. Every other
 * receipt counts. Nothing of the ledger is rewritten.
 */
import { counted } from '../counted.ts'
import { findCaseEntry } from './lot-declaration.ts'
import { SKIPPED_RECEIPT_REASONS } from './tdd.constants.ts'

import type {
	CountingReceipts,
	LotCaseEntry,
	SkippedReceipt,
	SkippedReceiptReason,
	TddEntry,
	TddLedger,
	TddReceipt,
	TestCaseId,
} from './tdd.types.ts'

/** The receipts of the case split by the read rule, oldest first: those that count and those skipped, with why. */
export function countingReceipts(params: {
	ledger: TddLedger
	testCase: TestCaseId
	/** The lot file's `accept` entries now. */
	acceptances: readonly LotCaseEntry[]
	/** The lot file's `revised` entries now. */
	revisions: readonly LotCaseEntry[]
}): CountingReceipts {
	const receipts = receiptsOf(params)
	const counting: TddReceipt[] = []
	const skipped: SkippedReceipt[] = []
	for (const [index, receipt] of receipts.entries()) {
		const reason = skipReasonOf({ ...params, receipt, earlier: receipts.slice(0, index) })
		if (reason) skipped.push({ receipt, reason })
		else counting.push(receipt)
	}
	return { counting, skipped }
}

/** Why the read rule skips the receipt, or undefined when it counts. */
function skipReasonOf(params: {
	receipt: TddReceipt
	/** The receipts of the case before it. */
	earlier: readonly TddReceipt[]
	testCase: TestCaseId
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
}): SkippedReceiptReason | undefined {
	const { receipt, testCase } = params
	if (receipt.kind === 'accepted') {
		if (!findCaseEntry({ entries: params.acceptances, testCase, list: 'accept' }))
			return SKIPPED_RECEIPT_REASONS.undeclared
		if (isProvenRedThenGreen({ receipts: params.earlier, caseHash: receipt.caseHash }))
			return SKIPPED_RECEIPT_REASONS.proven
	}
	if (
		receipt.kind === 'revised' &&
		!findCaseEntry({ entries: params.revisions, testCase, list: 'revised' })
	)
		return SKIPPED_RECEIPT_REASONS.undeclared
	return undefined
}

/**
 * The receipts hold a red of the case hash and, after its last red, a green of the same case hash: a red
 * after a green owes its green again.
 */
export function isProvenRedThenGreen(params: {
	receipts: readonly TddReceipt[]
	caseHash: string
}): boolean {
	const { receipts, caseHash } = params
	const red = receipts
		.map((receipt) => receipt.kind === 'red' && receipt.caseHash === caseHash)
		.lastIndexOf(true)
	return (
		red >= 0 &&
		receipts
			.slice(red + 1)
			.some((receipt) => receipt.kind === 'green' && receipt.caseHash === caseHash)
	)
}

/**
 * The skipped receipts of a case in one text, a count per kind and reason in ledger order:
 * `1 accepted receipt (no longer declared)`, `2 revised receipts (no longer declared)`.
 */
export function describeSkippedReceipts(skipped: readonly SkippedReceipt[]): string {
	const groups = new Map<string, { kind: string; reason: SkippedReceiptReason; count: number }>()
	for (const { receipt, reason } of skipped) {
		const key = `${receipt.kind}\0${reason}`
		const group = groups.get(key) ?? { kind: receipt.kind, reason, count: 0 }
		group.count++
		groups.set(key, group)
	}
	return [...groups.values()]
		.map(
			(group) =>
				`${counted({ count: group.count, noun: `${group.kind} receipt` })} (${group.reason})`,
		)
		.join(', ')
}

/** The receipts of a case, oldest first, every one of them (the read rule left aside). */
export function receiptsOf(params: { ledger: TddLedger; testCase: TestCaseId }): TddReceipt[] {
	return params.ledger.entries.filter((entry): entry is TddReceipt =>
		isReceiptOf({ entry, testCase: params.testCase }),
	)
}

/** The entry is a receipt of the case (its file, name and project). */
export function isReceiptOf(params: { entry: TddEntry; testCase: TestCaseId }): boolean {
	const { entry, testCase } = params
	return (
		entry.kind !== 'freeze' &&
		entry.file === testCase.file &&
		entry.name === testCase.name &&
		entry.project === testCase.project
	)
}
