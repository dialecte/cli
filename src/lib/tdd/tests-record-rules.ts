/**
 * The rules a `tests.json` is read by, with no file, git or process read: the one rule per field its writers follow
 * (`testsRecordFault`), the verdict of a gate part (`gateVerdictOf`) and the text of its unknown failures. Every
 * reader of the record (the change request, the evidence, `lot review`) judges by these.
 */
import {
	RECORD_CASE_STATUSES,
	RECORD_GATE_MODES,
} from '../change-request/change-request.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { TEST_EVIDENCE_TEXTS } from './test-evidence.constants.ts'
import { GATE_COUNT_FIELDS, PART_STRING_FIELDS } from './tests-record.constants.ts'

import type { TestsRecord, TestsRecordGate } from './tests-record.types.ts'

/**
 * The first field of `record` its writers never write so, by one rule per field: the types the judgement reads and
 * their values (a gate mode, a case status); undefined when every field holds. The gate part first, then the tdd part.
 */
export function testsRecordFault(params: { record: TestsRecord }): string | undefined {
	const { gate, tdd } = params.record as { gate?: unknown; tdd?: unknown }
	return (
		(gate === undefined ? undefined : gatePartFault(gate)) ??
		(tdd === undefined ? undefined : tddPartFault(tdd))
	)
}

/** Whether a gate part fails: an open entry, or, on a part an older cli wrote, a failed test or file counted. */
export function gateVerdictOf(gate: TestsRecordGate): 'failing' | 'passing' {
	if (gate.failures !== undefined) return gate.failures.length > 0 ? 'failing' : 'passing'
	return (gate.tests?.failed ?? 0) > 0 || (gate.testFiles?.failed ?? 0) > 0 ? 'failing' : 'passing'
}

/** The unknown failures of a gate part, as the refusal names them (a part seeded over a damaged `tests.json`). */
export function unknownFailuresText(gate: TestsRecordGate): string {
	return (gate.failures ?? [])
		.flatMap((failure) => (failure.key === null && 'unknown' in failure ? [failure.unknown] : []))
		.map((why) => fillMessage({ template: TEST_EVIDENCE_TEXTS.unknown, values: { why } }))
		.join(TEST_EVIDENCE_TEXTS.itemSeparator)
}

/** The gate part's first faulty field. */
function gatePartFault(gate: unknown): string | undefined {
	if (!isObject(gate)) return 'gate'
	const failures = gate.failures
	if (failures !== undefined && (!Array.isArray(failures) || !failures.every(isFailureEntry)))
		return 'failures'
	const holdsUnknown =
		Array.isArray(failures) && failures.some((entry) => isObject(entry) && 'unknown' in entry)
	if (gate.mode === null ? !holdsUnknown : !isGateMode(gate.mode)) return 'mode'
	for (const field of PART_STRING_FIELDS) if (typeof gate[field] !== 'string') return field
	for (const field of GATE_COUNT_FIELDS)
		if (gate[field] !== undefined && !isCounts(gate[field])) return field
	return undefined
}

/** The tdd part's first faulty field. */
function tddPartFault(tdd: unknown): string | undefined {
	if (!isObject(tdd)) return 'tdd'
	if (isObject(tdd.counts) && Object.keys(tdd.counts).some((status) => !isCaseStatus(status)))
		return 'status'
	for (const field of PART_STRING_FIELDS) if (typeof tdd[field] !== 'string') return field
	if (!Array.isArray(tdd.cases)) return 'cases'
	for (const testCase of tdd.cases) {
		if (
			!isObject(testCase) ||
			typeof testCase.file !== 'string' ||
			typeof testCase.name !== 'string'
		)
			return 'cases'
		if (!isCaseStatus(testCase.status)) return 'status'
	}
	return undefined
}

/** An entry of the ledger as `foldGateRecords` writes it: named, nameless or unknown. */
function isFailureEntry(entry: unknown): boolean {
	if (!isObject(entry)) return false
	if (entry.key === null && 'unknown' in entry)
		return typeof entry.unknown === 'string' && typeof entry.at === 'string'
	const run =
		isGateMode(entry.mode) &&
		typeof entry.head === 'string' &&
		typeof entry.stateHash === 'string' &&
		typeof entry.at === 'string'
	if (!run) return false
	if (typeof entry.key === 'string') return isStringList(entry.cases)
	return (
		entry.key === null &&
		isStringList(entry.ranFiles) &&
		(entry.failed === null || typeof entry.failed === 'number')
	)
}

function isGateMode(value: unknown): boolean {
	return (RECORD_GATE_MODES as readonly unknown[]).includes(value)
}

function isCaseStatus(value: unknown): boolean {
	return (RECORD_CASE_STATUSES as readonly unknown[]).includes(value)
}

function isCounts(value: unknown): boolean {
	return isObject(value) && Object.values(value).every((count) => typeof count === 'number')
}

function isStringList(value: unknown): boolean {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
