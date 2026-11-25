/**
 * A lot's `tests.json` (33CI CI2a): what a pull request may show of its tests - the cases of the change with their tdd
 * status, written at `tdd green`, and the counts of the newest gate run that counted tests, written by the gate. Each
 * writer replaces its own part and keeps the other; never a reason, a message or a skipped receipt.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import {
	readTestsFile,
	readTestsRecord,
	testsRecordFault,
	writeTestsRecord,
} from './tests-record.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { CaseStatusLine } from './tdd.types.ts'
import type { TestsRecord } from './tests-record.types.ts'

/** A case proven red then green, one accepted, one revised in another project, one red with a flag. */
const CASES: CaseStatusLine[] = [
	{ file: 'src/a.test.ts', name: 'a -> b', project: '', status: 'green', flags: [] },
	{ file: 'src/a.test.ts', name: 'c -> d', project: '', status: 'accepted', flags: [] },
	{ file: 'src/e.test.ts', name: 'e -> f', project: 'node', status: 'revised', flags: [] },
	{
		file: 'src/e.test.ts',
		name: 'g -> h',
		project: '',
		status: 'red',
		flags: ['rollback'],
		skipped: [
			{
				reason: 'no longer declared',
				receipt: {
					file: 'src/e.test.ts',
					name: 'g -> h',
					project: '',
					kind: 'accepted',
					testFileHash: 'a'.repeat(64),
					caseHash: 'b'.repeat(64),
					productionHash: 'c'.repeat(64),
					reason: 'a private reason',
					at: '2026-11-17T09:00:00.000Z',
				},
			},
		],
	},
]

/** The tdd part those cases give. */
const TDD_PART = {
	at: '2026-11-17T10:00:00.000Z',
	head: 'f'.repeat(40),
	stateHash: '0'.repeat(64),
	cases: [
		{ file: 'src/a.test.ts', name: 'a -> b', status: 'green' },
		{ file: 'src/a.test.ts', name: 'c -> d', status: 'accepted' },
		{ file: 'src/e.test.ts', name: 'e -> f', project: 'node', status: 'revised' },
		{ file: 'src/e.test.ts', name: 'g -> h', status: 'red', flags: ['rollback'] },
	],
	counts: { green: 1, accepted: 1, revised: 1, red: 1 },
}

/** A gate record of `mode` at `at`; with test counts unless `counted` is false. */
function gateRecord(params: { mode: 'fast' | 'full'; at: string; counted?: false }): GateRecord {
	return {
		mode: params.mode,
		at: params.at,
		head: 'd'.repeat(40),
		stateHash: 'e'.repeat(64),
		steps: [
			{ name: 'check', status: 'passed', counts: { errors: 0, warnings: 0 } },
			...(params.counted === false
				? []
				: [
						{
							name: 'tests',
							status: 'passed' as const,
							counts: {
								tests: { passed: 40, failed: 0, skipped: 2, total: 42 },
								testFiles: { passed: 5, failed: 0, total: 5 },
							},
						},
					]),
		],
	}
}

/** The gate part the full record of `at` gives. */
function gatePart(at: string) {
	return {
		mode: 'full',
		at,
		head: 'd'.repeat(40),
		stateHash: 'e'.repeat(64),
		tests: { passed: 40, failed: 0, skipped: 2, total: 42 },
		testFiles: { passed: 5, failed: 0, total: 5 },
		failures: [],
	}
}

/** The folder's `tests.json` read as JSON; undefined without the file. */
function fileOf(folder: string): unknown {
	const file = join(folder, STORE_FILES.tests)
	return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
}

/** The text of the folder's `tests.json`; empty without the file. */
function textOf(folder: string): string {
	const file = join(folder, STORE_FILES.tests)
	return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

describe('writeTestsRecord - the tdd part', () => {
	it('the cases of tdd green -> each case with its status, the counts by status, the tree; no reason, no skipped receipt', () => {
		const folder = temporaryFolder('tests-record-')

		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		expect({
			file: fileOf(folder),
			leaks: textOf(folder).includes('private'),
		}).toEqual({ file: { schema: 1, tdd: TDD_PART }, leaks: false })
	})

	it('a tdd part written after a gate part -> the gate part kept', () => {
		const folder = temporaryFolder('tests-record-')
		writeTestsRecord({
			folder,
			gateRecords: [gateRecord({ mode: 'full', at: '2026-11-17T09:00:00.000Z' })],
		})

		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		expect(fileOf(folder)).toEqual({
			schema: 1,
			tdd: TDD_PART,
			gate: gatePart('2026-11-17T09:00:00.000Z'),
		})
	})
})

describe('writeTestsRecord - the gate part', () => {
	it('records of fast and full -> the newest that counted tests, the tdd part kept', () => {
		const folder = temporaryFolder('tests-record-')
		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		writeTestsRecord({
			folder,
			gateRecords: [
				gateRecord({ mode: 'fast', at: '2026-11-17T08:00:00.000Z' }),
				gateRecord({ mode: 'full', at: '2026-11-17T09:00:00.000Z' }),
				gateRecord({ mode: 'fast', at: '2026-11-17T11:00:00.000Z', counted: false }),
			],
		})

		expect(fileOf(folder)).toEqual({
			schema: 1,
			tdd: TDD_PART,
			gate: gatePart('2026-11-17T09:00:00.000Z'),
		})
	})

	it('no record counted tests and no tests.json yet -> no file', () => {
		const folder = temporaryFolder('tests-record-')

		writeTestsRecord({
			folder,
			gateRecords: [gateRecord({ mode: 'fast', at: '2026-11-17T11:00:00.000Z', counted: false })],
		})

		expect(existsSync(join(folder, STORE_FILES.tests))).toBe(false)
	})
})

describe('readTestsRecord', () => {
	it('a folder without tests.json -> no record', () => {
		expect(readTestsRecord({ folder: temporaryFolder('tests-record-') })).toBeUndefined()
	})

	for (const [what, text] of [
		['a torn file', '{"schema":1,"td'],
		['another schema', '{"schema":2,"tdd":{}}'],
		['no object', '[1,2]'],
	])
		it(`${what} -> no record`, () => {
			const folder = temporaryFolder('tests-record-')
			writeFileSync(join(folder, STORE_FILES.tests), text)

			expect(readTestsRecord({ folder })).toBeUndefined()
		})

	it('a written record -> read back as written', () => {
		const folder = temporaryFolder('tests-record-')
		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		expect(readTestsRecord({ folder })).toEqual({ schema: 1, tdd: TDD_PART })
	})
})

/** A new cli's fast record at `at` whose scoped test step failed `|node| src/a.test.ts` (one case), or passed it. */
function keyedRecord(params: {
	at: string
	failed: boolean
	selects?: 'scoped' | 'all'
}): GateRecord {
	const key = '|node| src/a.test.ts'
	return {
		mode: params.selects === 'all' ? 'full' : 'fast',
		at: params.at,
		head: 'd'.repeat(40),
		stateHash: 'e'.repeat(64),
		steps: [
			{
				name: 'tests',
				status: params.failed ? 'failed' : 'passed',
				counts: { tests: { passed: 3, failed: params.failed ? 1 : 0, skipped: 0, total: 4 } },
				testStep: true,
				selects: params.selects ?? 'scoped',
				ranFiles: [key],
				...(params.failed && { failingKeys: [key], failingCases: [`${key} > group > one`] }),
			},
		],
	}
}

/** The failures of the folder's gate part, as their keys (`unknown` for an unknown entry). */
function openKeysOf(folder: string): unknown {
	const gate = readTestsRecord({ folder })?.gate
	return gate?.failures?.map(
		(failure) => failure.key ?? ('unknown' in failure ? 'unknown' : 'nameless'),
	)
}

describe('writeTestsRecord - the ledger of the gate part', () => {
	it('a gate refresh after a run whose test step failed -> one named entry with its case', () => {
		const folder = temporaryFolder('tests-record-')

		writeTestsRecord({
			folder,
			gateRecords: [keyedRecord({ at: '2026-11-24T10:00:00.000Z', failed: true })],
		})

		expect(readTestsRecord({ folder })?.gate?.failures).toEqual([
			{
				key: '|node| src/a.test.ts',
				cases: ['|node| src/a.test.ts > group > one'],
				mode: 'fast',
				head: 'd'.repeat(40),
				stateHash: 'e'.repeat(64),
				at: '2026-11-24T10:00:00.000Z',
			},
		])
	})

	it('a tests.json that is not JSON, then a gate refresh of a scoped pass -> an unknown entry, never cleared by it', () => {
		const folder = temporaryFolder('tests-record-')
		writeFileSync(join(folder, STORE_FILES.tests), '{"schema":1,"ga')

		writeTestsRecord({
			folder,
			gateRecords: [keyedRecord({ at: '2026-11-24T10:00:00.000Z', failed: false })],
		})

		expect(openKeysOf(folder)).toEqual(['unknown'])
	})

	it('a tests.json that is not JSON, then a tdd refresh -> a seeded gate part: no mode, the refresh’s tree and time, one unknown entry', () => {
		const folder = temporaryFolder('tests-record-')
		writeFileSync(join(folder, STORE_FILES.tests), 'not json')

		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		const gate = readTestsRecord({ folder })?.gate
		expect({
			gate,
			fault: testsRecordFault({ record: readTestsRecord({ folder }) as TestsRecord }),
		}).toEqual({
			gate: {
				mode: null,
				at: TDD_PART.at,
				head: TDD_PART.head,
				stateHash: TDD_PART.stateHash,
				failures: [{ key: null, unknown: expect.stringContaining('tests.json'), at: TDD_PART.at }],
			},
			fault: undefined,
		})
	})

	it('a faulty field, then a whole-suite pass -> no failure left', () => {
		const folder = temporaryFolder('tests-record-')
		writeFileSync(
			join(folder, STORE_FILES.tests),
			JSON.stringify({ schema: 1, gate: { mode: 'fast', at: 'x', head: 'h', stateHash: 7 } }),
		)

		writeTestsRecord({
			folder,
			gateRecords: [keyedRecord({ at: '2026-11-24T10:00:00.000Z', failed: false, selects: 'all' })],
		})

		expect(openKeysOf(folder)).toEqual([])
	})
})

describe('readTestsFile', () => {
	it('a folder without tests.json -> absent', () => {
		expect(readTestsFile({ folder: temporaryFolder('tests-record-') })).toEqual({ absent: true })
	})

	for (const [what, text] of [
		['a torn file', '{"schema":1,"td'],
		['another schema', '{"schema":2,"tdd":{}}'],
		['no object', '[1,2]'],
	])
		it(`${what} -> unreadable, with why`, () => {
			const folder = temporaryFolder('tests-record-')
			writeFileSync(join(folder, STORE_FILES.tests), text)

			expect(readTestsFile({ folder })).toEqual({ unreadable: expect.any(String) })
		})

	it('a written record -> the record', () => {
		const folder = temporaryFolder('tests-record-')
		writeTestsRecord({
			folder,
			tdd: { at: TDD_PART.at, head: TDD_PART.head, stateHash: TDD_PART.stateHash, cases: CASES },
		})

		expect(readTestsFile({ folder })).toEqual({ record: { schema: 1, tdd: TDD_PART } })
	})
})

/** A gate part that holds, with `fields` over it. */
function recordWithGate(fields: Record<string, unknown>): TestsRecord {
	return {
		schema: 1,
		gate: { ...gatePart('2026-11-24T10:00:00.000Z'), ...fields },
	} as TestsRecord
}

describe('testsRecordFault', () => {
	it.each([
		{ what: 'a stateHash that is no string', fields: { stateHash: 7 }, field: 'stateHash' },
		{ what: 'a mode no gate writes', fields: { mode: 'nightly' }, field: 'mode' },
		{ what: 'no mode on a part without an unknown entry', fields: { mode: null }, field: 'mode' },
		{ what: 'failures that are no list', fields: { failures: {} }, field: 'failures' },
		{
			what: 'an entry of a mode no gate writes',
			fields: {
				failures: [
					{ key: 'src/a.test.ts', cases: [], mode: 'nightly', head: 'h', stateHash: 's', at: 'a' },
				],
			},
			field: 'failures',
		},
		{
			what: 'a nameless entry without its ran keys',
			fields: {
				failures: [{ key: null, mode: 'fast', head: 'h', stateHash: 's', at: 'a', failed: 1 }],
			},
			field: 'failures',
		},
		{ what: 'counts that are no numbers', fields: { tests: { passed: 'many' } }, field: 'tests' },
	])('$what -> the field $field', ({ fields, field }) => {
		expect(testsRecordFault({ record: recordWithGate(fields) })).toBe(field)
	})

	it('a record as the writers write it -> no fault', () => {
		expect(testsRecordFault({ record: recordWithGate({}) })).toBeUndefined()
	})
})
