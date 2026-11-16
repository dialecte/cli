/**
 * A lot's `tests.json` (33CI CI2a): the public record of its tests, what a pull request may show. Its tdd part is the
 * cases of the change with their status (`tdd status`), written by `tdd green`; its gate part the newest gate run of
 * the worktree that counted tests, written by the gate. Each writer replaces its own part and keeps the other; the
 * file is written whole. Never a receipt's reason or message, nor a skipped receipt; a part with no source is absent.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readGateRecords } from '../gate-records/gate-records.ts'
import { replaceWhole } from '../store/publish.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { TESTS_RECORD_SCHEMA } from './tests-record.constants.ts'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { CaseStatusLine } from './tdd.types.ts'
import type {
	TestsRecord,
	TestsRecordCase,
	TestsRecordGate,
	TestsRecordTdd,
} from './tests-record.types.ts'

/**
 * Writes the folder's `tests.json` whole: the tdd part from `tdd` when given, the gate part from `gateRecords` when
 * given (none when no record counted tests), each part not given kept as the file holds it. A record with no part and
 * no file yet is not written.
 */
export function writeTestsRecord(params: {
	folder: string
	tdd?: { at: string; cases: readonly CaseStatusLine[] }
	gateRecords?: readonly GateRecord[]
}): void {
	const path = join(params.folder, STORE_FILES.tests)
	const previous = readTestsRecord({ folder: params.folder })
	const tdd = params.tdd === undefined ? previous?.tdd : tddPartOf(params.tdd)
	const gate = params.gateRecords === undefined ? previous?.gate : gatePartOf(params.gateRecords)
	if (tdd === undefined && gate === undefined && !existsSync(path)) return
	const record: TestsRecord = {
		schema: TESTS_RECORD_SCHEMA,
		...(tdd !== undefined && { tdd }),
		...(gate !== undefined && { gate }),
	}
	replaceWhole({ path, text: `${JSON.stringify(record, null, 2)}\n` })
}

/**
 * After a gate run in `cwd`: the gate part of the `tests.json` of the lot whose worktree holds `cwd`, from the
 * worktree's gate records. The `!` line a run adds when it could not be written (the run's own record stands);
 * undefined when it was, or when `cwd` is in no lot's worktree.
 */
export function refreshGatePart(params: { cwd: string }): string | undefined {
	try {
		const folder = lotOfWorktree({ cwd: params.cwd })
		if (folder === undefined) return undefined
		writeTestsRecord({ folder, gateRecords: readGateRecords(params.cwd) })
		return undefined
	} catch (error) {
		return `! ${STORE_FILES.tests} not written: ${(error as Error).message}`
	}
}

/** The folder's `tests.json`; undefined without one, or when it is no record of schema 1. */
export function readTestsRecord(params: { folder: string }): TestsRecord | undefined {
	const path = join(params.folder, STORE_FILES.tests)
	if (!existsSync(path)) return undefined
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		const isRecord = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
		return isRecord && (parsed as TestsRecord).schema === TESTS_RECORD_SCHEMA
			? (parsed as TestsRecord)
			: undefined
	} catch {
		return undefined
	}
}

/** The tdd part of the cases of the change: each as a public row, in the given order, and the count of each status. */
function tddPartOf(params: { at: string; cases: readonly CaseStatusLine[] }): TestsRecordTdd {
	const counts: TestsRecordTdd['counts'] = {}
	for (const line of params.cases) counts[line.status] = (counts[line.status] ?? 0) + 1
	return { at: params.at, cases: params.cases.map(publicCaseOf), counts }
}

/** A case status line without what stays private (its skipped receipts and their reasons). */
function publicCaseOf(line: CaseStatusLine): TestsRecordCase {
	return {
		file: line.file,
		name: line.name,
		...(line.project !== '' && { project: line.project }),
		status: line.status,
		...(line.flags.length > 0 && { flags: [...line.flags] }),
	}
}

/** The gate part: the newest record one of whose steps counted tests; undefined when none did. */
function gatePartOf(records: readonly GateRecord[]): TestsRecordGate | undefined {
	let newest: { record: GateRecord; counts: GateRecord['steps'][number]['counts'] } | undefined
	for (const record of records) {
		// the step that counted tests, whatever the package named it
		const step = record.steps.find(function countedTests(candidate) {
			return candidate.counts.tests !== undefined
		})
		if (step?.counts.tests === undefined) continue
		if (newest === undefined || record.at > newest.record.at)
			newest = { record, counts: step.counts }
	}
	if (newest === undefined) return undefined
	const { record, counts } = newest
	return {
		mode: record.mode,
		at: record.at,
		head: record.head,
		stateHash: record.stateHash,
		tests: counts.tests,
		...(counts.testFiles !== undefined && { testFiles: counts.testFiles }),
	}
}
