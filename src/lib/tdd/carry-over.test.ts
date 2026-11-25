/**
 * `lotCarryOf`: a passing case of a rebuilt lot carries the red of the same case in the lot it was rebuilt from when
 * its test call, test file and test code, and the production slice of the source's green, are the ones it has now.
 * Pure: the source's ledger and the base's files are given.
 */
import { sha256Of } from '../corpus/corpus-lock.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { NOT_CARRIED, NOT_CARRIED_REASONS } from './carry-over.constants.ts'
import { lotCarryOf } from './carry-over.ts'
import { hashTestCodeText } from './tdd-files.ts'
import { DELETED_PRODUCTION_FILE } from './tdd.constants.ts'

import { describe, expect, it } from 'vitest'

import type { LotCarryParams } from './carry-over.types.ts'
import type { LotCaseEntry, TddEntry, TddReceipt } from './tdd.types.ts'

const LOT = '0005-repo-source'
const ROOT = '/scratch/package'
const FILE = 'src/a.test.ts'
const NAME = 'one plus two'
const LABEL = `${FILE}::${NAME}`
const PYTEST_FILE = 'tests/test_a.py'
const CONFTEST = 'tests/conftest.py'
const HELPER = 'test/helper.ts'
const SIBLING = 'src/b.test.ts'
const OTHER_HELPER = 'test/other.ts'
const BASE_ZERO = 'b0'.repeat(20)
const BASE_PARENT = 'b1'.repeat(20)
const BASE_NOW = 'c1'.repeat(20)
const CASE_HASH = '1'.repeat(64)
const FILE_HASH = '2'.repeat(64)
const RED_STATE = '3'.repeat(64)
const GREEN_STATE = '4'.repeat(64)
const LATER_GREEN_STATE = '5'.repeat(64)
const FIRST_TIME = '2026-11-20T10:00:00.000Z'
const SECOND_TIME = '2026-11-20T11:00:00.000Z'
const THIRD_TIME = '2026-11-20T12:00:00.000Z'
const PRODUCTION_FILE = 'src/a.ts'
const PRODUCTION_TEXT = 'export const a = 1\n'

const HELPER_TEXT = 'export const EXPECTED = 3\n'
const HELPER_EDITED_TEXT = 'export const EXPECTED = 4\n'
const HELPER_HASH = hashTestCodeText({ file: HELPER, text: HELPER_TEXT })
const HELPER_EDITED_HASH = hashTestCodeText({ file: HELPER, text: HELPER_EDITED_TEXT })

/** The id of the case in every receipt. */
const ID = { file: FILE, name: NAME, project: '' }

function receiptOf(params: {
	file?: string
	kind: TddReceipt['kind']
	at: string
	productionHash: string
	flags?: TddReceipt['flags']
}): TddReceipt {
	return {
		...ID,
		...(params.file !== undefined && { file: params.file }),
		kind: params.kind,
		testFileHash: FILE_HASH,
		caseHash: CASE_HASH,
		productionHash: params.productionHash,
		...(params.kind === 'red' && { message: 'expected 1 to be 3' }),
		...(params.flags && { flags: params.flags }),
		at: params.at,
	}
}

function freezeOf(params: {
	at: string
	files: Record<string, string>
	conftests?: Record<string, string[]>
}): TddEntry {
	return {
		kind: 'freeze',
		files: params.files,
		...(params.conftests && { conftests: params.conftests }),
		at: params.at,
	}
}

/** The ledger entries of a source lot that proved the case: its red, the freeze of that run, a green. */
const PROVEN: TddEntry[] = [
	receiptOf({ kind: 'red', at: FIRST_TIME, productionHash: RED_STATE }),
	freezeOf({ at: FIRST_TIME, files: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH } }),
	receiptOf({ kind: 'green', at: SECOND_TIME, productionHash: GREEN_STATE }),
]

/** Everything a row may change of the scenario: the source's records, the case now, and the base's files. */
type Parts = {
	/** The case's test file; the default's `.ts` file. */
	file: string
	/** The conftests a pytest file runs under now. */
	conftests: string[]
	entries: TddEntry[]
	production: Record<string, Record<string, Record<string, string>>> | undefined
	acceptances: LotCaseEntry[]
	revisions: LotCaseEntry[]
	caseHash: string
	testFileHash: string
	dependencies: string[]
	/** The hash of each test-code file now. */
	hashes: Record<string, string>
	/** The production files of today's state (path to sha256). */
	files: Record<string, string>
	/** The files of each commit: `<commit>:<path>` to text. */
	blobs: Record<string, string>
	/** The commits git cannot read. */
	unreadable: string[]
}

/** A row of a table: what changes of the scenario and what `lotCarryOf` answers. */
type Row = { row: string; parts: Partial<Parts>; expected: object }

const DEFAULT_PARTS: Parts = {
	file: FILE,
	conftests: [],
	entries: PROVEN,
	production: {
		[BASE_ZERO]: { [GREEN_STATE]: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT) } },
	},
	acceptances: [],
	revisions: [],
	caseHash: CASE_HASH,
	testFileHash: FILE_HASH,
	dependencies: [HELPER],
	hashes: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH },
	files: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT) },
	blobs: {},
	unreadable: [],
}

/** The parameters of `lotCarryOf` for the default scenario with `changes` over it. */
function paramsOf(changes: Partial<Parts> = {}): LotCarryParams {
	const parts: Parts = { ...DEFAULT_PARTS, ...changes }
	return {
		carry: {
			from: LOT,
			ledger: {
				version: 3,
				entries: parts.entries,
				...(parts.production !== undefined && { production: parts.production }),
			},
			acceptances: parts.acceptances,
			revisions: parts.revisions,
		},
		root: ROOT,
		testCase: { ...ID, file: parts.file },
		conftests: parts.conftests,
		caseHash: parts.caseHash,
		testFileHash: parts.testFileHash,
		dependencies: parts.dependencies,
		hashNow: (file) => parts.hashes[file],
		production: { hash: 'now', base: BASE_NOW, files: parts.files },
		readBaseBlob: ({ base, path }) => {
			if (parts.unreadable.includes(base)) throw new Error(`the commit ${base} is not readable`)
			return parts.blobs[`${base}:${path}`]
		},
		isBaseReadable: ({ base }) => !parts.unreadable.includes(base),
	}
}

/** The refusal `lotCarryOf` answers for `reason` (its `{file}` and `{kind}` filled). */
function refusedFor(params: { reason: string; file?: string; kind?: string; files?: string }): {
	kind: 'refused'
	reason: string
} {
	const why = fillMessage({
		template: params.reason,
		values: { file: params.file ?? '', kind: params.kind ?? '', files: params.files ?? '' },
	})
	return {
		kind: 'refused',
		reason: fillMessage({ template: NOT_CARRIED, values: { lot: LOT, why } }),
	}
}

const CARRIED = {
	kind: 'carry',
	from: ID,
	red: PROVEN[0],
	lot: LOT,
}

describe('lotCarryOf: the test code of the case', () => {
	it.each<Row>([
		{
			row: '1 · the case, its file, its helper and the slice as the source green had them',
			parts: {},
			expected: CARRIED,
		},
		{
			row: '2 · the test call changed',
			parts: { caseHash: '9'.repeat(64) },
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.callDiffers }),
		},
		{
			row: '3 · the test file differs from the source freeze',
			parts: {
				testFileHash: '8'.repeat(64),
				hashes: { [FILE]: '8'.repeat(64), [HELPER]: HELPER_HASH },
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.fileDiffers, file: FILE }),
		},
		{
			row: '4 · a helper the source freeze holds differs now',
			parts: { hashes: { [FILE]: FILE_HASH, [HELPER]: HELPER_EDITED_HASH } },
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.helperDiffers, file: HELPER }),
		},
		{
			row: '5 · a helper the source never froze, edited since its base',
			parts: {
				dependencies: [HELPER, OTHER_HELPER],
				hashes: {
					[FILE]: FILE_HASH,
					[HELPER]: HELPER_HASH,
					[OTHER_HELPER]: hashTestCodeText({
						file: OTHER_HELPER,
						text: 'export const OTHER = 2\n',
					}),
				},
				blobs: { [`${BASE_ZERO}:${OTHER_HELPER}`]: 'export const OTHER = 1\n' },
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.helperDiffers, file: OTHER_HELPER }),
		},
		{
			row: '5b · a helper the source never froze, as its base holds it',
			parts: {
				dependencies: [HELPER, OTHER_HELPER],
				hashes: {
					[FILE]: FILE_HASH,
					[HELPER]: HELPER_HASH,
					[OTHER_HELPER]: hashTestCodeText({
						file: OTHER_HELPER,
						text: 'export const OTHER = 1\n',
					}),
				},
				blobs: { [`${BASE_ZERO}:${OTHER_HELPER}`]: 'export const OTHER = 1\n' },
			},
			expected: CARRIED,
		},
		{
			row: '14 · a helper neither lot touched that main changed between the two bases',
			parts: {
				dependencies: [HELPER, OTHER_HELPER],
				hashes: {
					[FILE]: FILE_HASH,
					[HELPER]: HELPER_HASH,
					[OTHER_HELPER]: hashTestCodeText({
						file: OTHER_HELPER,
						text: 'export const OTHER = 5\n',
					}),
				},
				blobs: {
					[`${BASE_ZERO}:${OTHER_HELPER}`]: 'export const OTHER = 1\n',
					[`${BASE_NOW}:${OTHER_HELPER}`]: 'export const OTHER = 5\n',
				},
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.helperDiffers, file: OTHER_HELPER }),
		},
		{
			row: '11d · a sibling test file frozen in the same red run, edited since',
			parts: {
				entries: [
					PROVEN[0],
					freezeOf({
						at: FIRST_TIME,
						files: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH, [SIBLING]: 'a'.repeat(64) },
					}),
					PROVEN[2],
				],
				hashes: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH, [SIBLING]: 'e'.repeat(64) },
			},
			expected: CARRIED,
		},
		{
			row: '11e · a helper the source re-froze after its red, its green after that freeze, as the newer freeze holds it',
			parts: {
				entries: [
					PROVEN[0],
					freezeOf({ at: FIRST_TIME, files: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH } }),
					freezeOf({ at: SECOND_TIME, files: { [HELPER]: HELPER_EDITED_HASH } }),
					receiptOf({ kind: 'green', at: THIRD_TIME, productionHash: GREEN_STATE }),
				],
				hashes: { [FILE]: FILE_HASH, [HELPER]: HELPER_EDITED_HASH },
			},
			expected: CARRIED,
		},
	])('$row', ({ parts, expected }) => {
		expect(lotCarryOf(paramsOf(parts))).toMatchObject(expected)
	})
})

describe('lotCarryOf: what the source proved', () => {
	it.each([
		{ kind: 'accepted' as const, parts: { acceptances: [{ case: LABEL, reason: 'a reason' }] } },
		{ kind: 'revised' as const, parts: { revisions: [{ case: LABEL, reason: 'a reason' }] } },
		{ kind: 'unchanged' as const, parts: {} },
	])('6 · the source proof is $kind → refused: only a red carries', ({ kind, parts }) => {
		const entries: TddEntry[] = [
			receiptOf({ kind, at: FIRST_TIME, productionHash: RED_STATE }),
			freezeOf({ at: FIRST_TIME, files: { [FILE]: FILE_HASH, [HELPER]: HELPER_HASH } }),
			receiptOf({ kind: 'green', at: SECOND_TIME, productionHash: GREEN_STATE }),
		]

		expect(lotCarryOf(paramsOf({ ...parts, entries }))).toEqual(
			refusedFor({ reason: NOT_CARRIED_REASONS.notRed, kind }),
		)
	})

	it('7 · the source case is red and has no green → refused: no green to compare', () => {
		expect(lotCarryOf(paramsOf({ entries: PROVEN.slice(0, 2) }))).toEqual(
			refusedFor({ reason: NOT_CARRIED_REASONS.noGreen }),
		)
	})

	it('17 · the source red flagged rollback and red on base → carried, its flags kept', () => {
		const flagged = receiptOf({
			kind: 'red',
			at: FIRST_TIME,
			productionHash: RED_STATE,
			flags: ['rollback', 'red on base'],
		})

		expect(lotCarryOf(paramsOf({ entries: [flagged, PROVEN[1], PROVEN[2]] }))).toMatchObject({
			kind: 'carry',
			red: { flags: ['rollback', 'red on base'] },
		})
	})
})

describe('lotCarryOf: the production slice', () => {
	it.each<Row>([
		{
			row: '8 · a production file of the source state differs now',
			parts: { files: { [PRODUCTION_FILE]: sha256Of('export const a = 2\n') } },
			expected: refusedFor({
				reason: NOT_CARRIED_REASONS.productionDiffers,
				file: PRODUCTION_FILE,
			}),
		},
		{
			row: '9 · a file only today names (new production since), its base holding none',
			parts: {
				files: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT), 'src/new.ts': sha256Of('new\n') },
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.productionDiffers, file: 'src/new.ts' }),
		},
		{
			row: "10 · a parent's file the source state names, absent from today's state, as the new base holds it",
			parts: {
				production: {
					[BASE_ZERO]: {
						[GREEN_STATE]: {
							[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
							'src/parent.ts': sha256Of('parent\n'),
						},
					},
				},
				blobs: { [`${BASE_NOW}:src/parent.ts`]: 'parent\n' },
			},
			expected: CARRIED,
		},
		{
			row: '11 · a file the source state lacks, in today state, its base blob differing from now',
			parts: {
				files: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT), 'src/c.ts': sha256Of('now\n') },
				blobs: { [`${BASE_ZERO}:src/c.ts`]: 'before\n' },
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.productionDiffers, file: 'src/c.ts' }),
		},
		{
			row: '11b · a file the source state lacks, its blob at the source base equal to now, the new base holding another',
			parts: {
				files: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT), 'src/d.ts': sha256Of('same\n') },
				blobs: {
					[`${BASE_ZERO}:src/d.ts`]: 'same\n',
					[`${BASE_NOW}:src/d.ts`]: 'main moved this\n',
				},
			},
			expected: CARRIED,
		},
		{
			row: "15 · stacked on an open parent: a parent file only in today's state, as the parent tip holds it",
			parts: {
				files: {
					[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
					'src/parent.ts': sha256Of('parent\n'),
				},
				blobs: {
					[`${BASE_ZERO}:src/parent.ts`]: 'parent\n',
					[`${BASE_NOW}:src/parent.ts`]: 'the parent moved on\n',
				},
			},
			expected: CARRIED,
		},
		{
			row: 'package · a source of another package: its state names a file this package does not hold',
			parts: {
				production: {
					[BASE_ZERO]: { [GREEN_STATE]: { 'src/elsewhere.ts': sha256Of('elsewhere\n') } },
				},
				files: {},
			},
			expected: refusedFor({
				reason: NOT_CARRIED_REASONS.productionDiffers,
				file: 'src/elsewhere.ts',
			}),
		},
	])('$row', ({ parts, expected }) => {
		expect(lotCarryOf(paramsOf(parts))).toMatchObject(expected)
	})
})

describe('lotCarryOf: which green and which base', () => {
	/** The source's ledger with a second green after the first, at `LATER_GREEN_STATE`. */
	const TWO_GREENS: TddEntry[] = [
		...PROVEN,
		receiptOf({ kind: 'green', at: THIRD_TIME, productionHash: LATER_GREEN_STATE }),
	]
	const A_NOW = sha256Of(PRODUCTION_TEXT)
	const A_OTHER = sha256Of('export const a = 2\n')
	const A_LATER = sha256Of('export const a = 3\n')

	it.each([
		{
			row: 'the last green at a slice that differs now, the earlier at one that matches',
			states: {
				[GREEN_STATE]: { [PRODUCTION_FILE]: A_NOW },
				[LATER_GREEN_STATE]: { [PRODUCTION_FILE]: A_LATER },
			},
		},
		{
			row: 'the earlier green at a slice that differs now, the last at one that matches',
			states: {
				[GREEN_STATE]: { [PRODUCTION_FILE]: A_OTHER },
				[LATER_GREEN_STATE]: { [PRODUCTION_FILE]: A_NOW },
			},
		},
	])('11c · two counted greens, $row → carried', ({ states }) => {
		expect(
			lotCarryOf(paramsOf({ entries: TWO_GREENS, production: { [BASE_ZERO]: states } })),
		).toMatchObject({ kind: 'carry', lot: LOT })
	})

	it('11c · two counted greens, none at a slice that matches, differing on different files → refused naming the file of the last', () => {
		const B_NOW = sha256Of('b now\n')
		const production = {
			[BASE_ZERO]: {
				[GREEN_STATE]: { [PRODUCTION_FILE]: A_OTHER, 'src/b.ts': B_NOW },
				[LATER_GREEN_STATE]: { [PRODUCTION_FILE]: A_NOW, 'src/b.ts': sha256Of('b later\n') },
			},
		}

		expect(
			lotCarryOf(
				paramsOf({
					entries: TWO_GREENS,
					production,
					files: { [PRODUCTION_FILE]: A_NOW, 'src/b.ts': B_NOW },
				}),
			),
		).toEqual(refusedFor({ reason: NOT_CARRIED_REASONS.productionDiffers, file: 'src/b.ts' }))
	})

	it.each([
		{ row: 'a ledger without production', production: undefined },
		{
			row: 'no state holding the green hash',
			production: { [BASE_ZERO]: { [RED_STATE]: { [PRODUCTION_FILE]: 'x' } } },
		},
	])('12 · $row → refused: unrecorded', ({ production }) => {
		expect(lotCarryOf(paramsOf({ production }))).toEqual(
			refusedFor({ reason: NOT_CARRIED_REASONS.unrecorded }),
		)
	})

	it('13 · the base the state sits under cannot be read → refused: base unreadable', () => {
		expect(lotCarryOf(paramsOf({ unreadable: [BASE_ZERO] }))).toEqual(
			refusedFor({ reason: NOT_CARRIED_REASONS.baseUnreadable }),
		)
	})

	it('16 · the green hash under two bases, the first unreadable → carried from the second', () => {
		const state = { [GREEN_STATE]: { [PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT) } }

		expect(
			lotCarryOf(
				paramsOf({
					production: { [BASE_PARENT]: state, [BASE_ZERO]: state },
					unreadable: [BASE_PARENT],
				}),
			),
		).toMatchObject({ kind: 'carry', lot: LOT })
	})
})

describe('lotCarryOf: deleted and missing files', () => {
	it.each<Row>([
		{
			row: "4a · the source state and today's state both name a file deleted",
			parts: {
				production: {
					[BASE_ZERO]: {
						[GREEN_STATE]: {
							[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
							'src/gone.ts': DELETED_PRODUCTION_FILE,
						},
					},
				},
				files: {
					[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
					'src/gone.ts': DELETED_PRODUCTION_FILE,
				},
			},
			expected: CARRIED,
		},
		{
			row: "4a · a file today's state names deleted, the source base never holding it",
			parts: {
				files: {
					[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
					'src/gone.ts': DELETED_PRODUCTION_FILE,
				},
			},
			expected: CARRIED,
		},
		{
			row: "4b · the source state names a file deleted, today's state does not and the new base holds it",
			parts: {
				production: {
					[BASE_ZERO]: {
						[GREEN_STATE]: {
							[PRODUCTION_FILE]: sha256Of(PRODUCTION_TEXT),
							'src/gone.ts': DELETED_PRODUCTION_FILE,
						},
					},
				},
				blobs: { [`${BASE_NOW}:src/gone.ts`]: 'still here\n' },
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.productionDiffers, file: 'src/gone.ts' }),
		},
		{
			row: '4c · a helper the source never froze, missing at its base and present now',
			parts: {
				dependencies: [HELPER, OTHER_HELPER],
				hashes: {
					[FILE]: FILE_HASH,
					[HELPER]: HELPER_HASH,
					[OTHER_HELPER]: hashTestCodeText({
						file: OTHER_HELPER,
						text: 'export const OTHER = 1\n',
					}),
				},
			},
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.helperDiffers, file: OTHER_HELPER }),
		},
	])('$row', ({ parts, expected }) => {
		expect(lotCarryOf(paramsOf(parts))).toMatchObject(expected)
	})
})

describe('lotCarryOf: the conftests of a pytest file', () => {
	const PYTEST_ENTRIES: TddEntry[] = [
		receiptOf({ file: PYTEST_FILE, kind: 'red', at: FIRST_TIME, productionHash: RED_STATE }),
		freezeOf({
			at: FIRST_TIME,
			files: { [PYTEST_FILE]: FILE_HASH },
			conftests: { [PYTEST_FILE]: [CONFTEST] },
		}),
		receiptOf({ file: PYTEST_FILE, kind: 'green', at: SECOND_TIME, productionHash: GREEN_STATE }),
	]
	const PYTEST_PARTS: Partial<Parts> = {
		file: PYTEST_FILE,
		entries: PYTEST_ENTRIES,
		dependencies: [],
		hashes: { [PYTEST_FILE]: FILE_HASH },
	}

	it.each<Row>([
		{
			row: 'the conftests the freeze lists still apply',
			parts: { ...PYTEST_PARTS, conftests: [CONFTEST] },
			expected: { kind: 'carry', lot: LOT },
		},
		{
			row: 'a conftest the freeze lists no longer applies',
			parts: { ...PYTEST_PARTS, conftests: [] },
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.conftestsDiffer, files: CONFTEST }),
		},
		{
			row: 'a conftest the freeze does not list applies now',
			parts: { ...PYTEST_PARTS, conftests: [CONFTEST, 'conftest.py'] },
			expected: refusedFor({ reason: NOT_CARRIED_REASONS.conftestsDiffer, files: 'conftest.py' }),
		},
	])('5 · a pytest file: $row', ({ parts, expected }) => {
		expect(lotCarryOf(paramsOf(parts))).toMatchObject(expected)
	})
})
