import { duplicateReasonOf, findDuplicateCaseIds, isDuplicateMember } from './duplicate-case-ids.ts'

import { describe, expect, it } from 'vitest'

import type { DuplicateCaseId, ReportedCaseState, RunCase } from './tdd.types.ts'

/** A run case of `name` in `file`, in `project`, declared on `line` (no location when the line is undefined). */
function runCase(params: {
	name: string
	line?: number
	file?: string
	project?: string
	state?: ReportedCaseState
}): RunCase {
	return {
		file: params.file ?? 'src/a.test.ts',
		name: params.name,
		project: params.project ?? '',
		state: params.state ?? 'failed',
		caseHash: 'hash',
		ofChange: true,
		ofBase: false,
		...(params.line !== undefined && { location: { line: params.line, column: 1 } }),
	}
}

describe('findDuplicateCaseIds', () => {
	const CASES: Record<string, { cases: RunCase[]; duplicates: DuplicateCaseId[] }> = {
		'two cases of one file, one project and one name → one group holding both lines': {
			cases: [runCase({ name: 'same', line: 3 }), runCase({ name: 'same', line: 4 })],
			duplicates: [{ file: 'src/a.test.ts', project: '', name: 'same', lines: [3, 4] }],
		},
		'the same name under two describes (two full names) → no group': {
			cases: [runCase({ name: 'one > same', line: 3 }), runCase({ name: 'two > same', line: 6 })],
			duplicates: [],
		},
		'the same name in two projects of one file → no group': {
			cases: [
				runCase({ name: 'same', line: 3, project: 'one' }),
				runCase({ name: 'same', line: 3, project: 'two' }),
			],
			duplicates: [],
		},
		'the same name in two files → no group': {
			cases: [
				runCase({ name: 'same', line: 3, file: 'src/a.test.ts' }),
				runCase({ name: 'same', line: 3, file: 'src/b.test.ts' }),
			],
			duplicates: [],
		},
		'a skipped member still counts → a group': {
			cases: [
				runCase({ name: 'same', line: 3, state: 'failed' }),
				runCase({ name: 'same', line: 4, state: 'skipped' }),
			],
			duplicates: [{ file: 'src/a.test.ts', project: '', name: 'same', lines: [3, 4] }],
		},
		'a pending member and a passed one count too → a group': {
			cases: [
				runCase({ name: 'same', line: 3, state: 'pending' }),
				runCase({ name: 'same', line: 4, state: 'passed' }),
			],
			duplicates: [{ file: 'src/a.test.ts', project: '', name: 'same', lines: [3, 4] }],
		},
		'three members → one group of three lines': {
			cases: [
				runCase({ name: 'same', line: 3 }),
				runCase({ name: 'same', line: 4 }),
				runCase({ name: 'same', line: 5 }),
			],
			duplicates: [{ file: 'src/a.test.ts', project: '', name: 'same', lines: [3, 4, 5] }],
		},
		'two groups → ordered by the first member of each, not by the second': {
			cases: [
				runCase({ name: 'second', line: 3 }),
				runCase({ name: 'first', line: 4 }),
				runCase({ name: 'first', line: 5 }),
				runCase({ name: 'second', line: 6 }),
			],
			duplicates: [
				{ file: 'src/a.test.ts', project: '', name: 'second', lines: [3, 6] },
				{ file: 'src/a.test.ts', project: '', name: 'first', lines: [4, 5] },
			],
		},
		'a member without a location → undefined in the lines, at its place': {
			cases: [runCase({ name: 'same' }), runCase({ name: 'same', line: 5 })],
			duplicates: [{ file: 'src/a.test.ts', project: '', name: 'same', lines: [undefined, 5] }],
		},
		'two describes of an each-table cut to the same title, one case each → one group': {
			cases: [
				runCase({ name: "rows 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…' > plain", line: 6 }),
				runCase({ name: "rows 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…' > plain", line: 6 }),
			],
			duplicates: [
				{
					file: 'src/a.test.ts',
					project: '',
					name: "rows 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…' > plain",
					lines: [6, 6],
				},
			],
		},
		'the same id twice in two projects → one group per project': {
			cases: [
				runCase({ name: 'same', line: 3, project: 'one' }),
				runCase({ name: 'same', line: 4, project: 'one' }),
				runCase({ name: 'same', line: 3, project: 'two' }),
				runCase({ name: 'same', line: 4, project: 'two' }),
			],
			duplicates: [
				{ file: 'src/a.test.ts', project: 'one', name: 'same', lines: [3, 4] },
				{ file: 'src/a.test.ts', project: 'two', name: 'same', lines: [3, 4] },
			],
		},
		'no case → no group': { cases: [], duplicates: [] },
	}

	for (const [name, row] of Object.entries(CASES))
		it(name, () => {
			expect(findDuplicateCaseIds(row.cases)).toEqual(row.duplicates)
		})
})

describe('isDuplicateMember', () => {
	const GROUP: DuplicateCaseId = { file: 'src/a.test.ts', project: '', name: 'same', lines: [3, 4] }

	const CASES: Record<
		string,
		{ testCase: { file: string; name: string; project: string }; member: boolean }
	> = {
		'the id of a group → a member': {
			testCase: { file: 'src/a.test.ts', name: 'same', project: '' },
			member: true,
		},
		'the same name in another file → not a member': {
			testCase: { file: 'src/b.test.ts', name: 'same', project: '' },
			member: false,
		},
		'the same name in another project → not a member': {
			testCase: { file: 'src/a.test.ts', name: 'same', project: 'one' },
			member: false,
		},
		'another name in the same file → not a member': {
			testCase: { file: 'src/a.test.ts', name: 'other', project: '' },
			member: false,
		},
	}

	for (const [name, row] of Object.entries(CASES))
		it(name, () => {
			expect(isDuplicateMember({ testCase: row.testCase, duplicates: [GROUP] })).toBe(row.member)
		})

	it('no group at all → not a member', () => {
		expect(
			isDuplicateMember({
				testCase: { file: 'src/a.test.ts', name: 'same', project: '' },
				duplicates: [],
			}),
		).toBe(false)
	})
})

describe('duplicateReasonOf', () => {
	const CASES: Record<
		string,
		{ lines: (number | undefined)[]; tableTitled: boolean; reason: string }
	> = {
		'lines 12 and 12 of a table title → the count, both lines and the table hint': {
			lines: [12, 12],
			tableTitled: true,
			reason:
				"2 cases share this id (lines 12, 12): spell each title in full (a `$` field of an each-title is cut by vitest's truncateThreshold, or set it to 0)",
		},
		'a missing line → a question mark in its place, the plain hint': {
			lines: [12, undefined],
			tableTitled: false,
			reason: '2 cases share this id (lines 12, ?): rename one',
		},
		'three members → the count is three, the three lines, the plain hint': {
			lines: [1, 2, 3],
			tableTitled: false,
			reason: '3 cases share this id (lines 1, 2, 3): rename one',
		},
		'three members of a table title → the count is three and the table hint': {
			lines: [4, 4, 4],
			tableTitled: true,
			reason:
				"3 cases share this id (lines 4, 4, 4): spell each title in full (a `$` field of an each-title is cut by vitest's truncateThreshold, or set it to 0)",
		},
	}

	for (const [name, row] of Object.entries(CASES))
		it(name, () => {
			expect(
				duplicateReasonOf({
					duplicate: { file: 'src/a.test.ts', project: '', name: 'same', lines: row.lines },
					tableTitled: row.tableTitled,
				}),
			).toBe(row.reason)
		})
})
