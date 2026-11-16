/**
 * A lot's `tests.json` (33CI CI2a): what a pull request may show of its tests - the cases of the change with their tdd
 * status, written at `tdd green`, and the counts of the newest gate run that counted tests, written by the gate. Each
 * writer replaces its own part and keeps the other; never a reason, a message or a skipped receipt.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { readTestsRecord, writeTestsRecord } from './tests-record.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../gate-records/gate-records.types.ts'
import type { CaseStatusLine } from './tdd.types.ts'

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
	it('the cases of tdd green -> each case with its status, the counts by status; no reason, no skipped receipt', () => {
		const folder = temporaryFolder('tests-record-')

		writeTestsRecord({ folder, tdd: { at: TDD_PART.at, cases: CASES } })

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

		writeTestsRecord({ folder, tdd: { at: TDD_PART.at, cases: CASES } })

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
		writeTestsRecord({ folder, tdd: { at: TDD_PART.at, cases: CASES } })

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
		writeTestsRecord({ folder, tdd: { at: TDD_PART.at, cases: CASES } })

		expect(readTestsRecord({ folder })).toEqual({ schema: 1, tdd: TDD_PART })
	})
})
