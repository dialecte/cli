import {
	exactRange,
	hashLine,
	hashTests,
	judgeReport,
	needsJudging,
	parseTarget,
	rangesOf,
	recordSurvivors,
	survivorKey,
	withFullRun,
	withinTargets,
	withLoneTimeouts,
} from './judge.ts'
import { MUTATION_FAMILIES } from './mutation.constants.ts'

import { describe, expect, it } from 'vitest'

import type {
	MutationFamily,
	MutationRecord,
	MutationRecords,
	MutationReport,
	ReportedMutant,
} from './mutation.types.ts'

const FILE = 'src/a.ts'
const OTHER = 'src/b.ts'
const SOURCE = ['const a = x === 1', 'const a = x === 1', 'return x === 1'].join('\n')
const LINE_ONE_HASH_TEXT = 'const a = x === 1'

function mutant(params: {
	id: string
	status: string
	line: number
	column?: number
	original?: string
	coveredBy?: string[]
}): ReportedMutant {
	const { id, status, line, column = 11, original = 'x === 1', coveredBy } = params
	return {
		...(coveredBy === undefined ? {} : { coveredBy }),
		id,
		mutatorName: 'ConditionalExpression',
		replacement: 'true',
		status,
		location: { start: { line, column }, end: { line, column: column + original.length } },
	}
}

function report(params: {
	mutants: ReportedMutant[]
	source?: string
	testFiles?: MutationReport['testFiles']
}): MutationReport {
	const { mutants, source = SOURCE, testFiles } = params
	return {
		files: { [FILE]: { source, mutants } },
		...(testFiles === undefined ? {} : { testFiles }),
	}
}

const TEST_FILE = 'test/a.test.ts'
/** Stryker numbers the tests of a run: the ids differ from run to run, the file and name do not. */
function testFilesOf(params: { first: string; second: string }): MutationReport['testFiles'] {
	return {
		[TEST_FILE]: {
			tests: [
				{ id: params.first, name: 'one' },
				{ id: params.second, name: 'two' },
			],
		},
	}
}
const TESTS_HASH = hashTests({ tests: [`${TEST_FILE}#one`, `${TEST_FILE}#two`] })

function statuses(params: { report: MutationReport }): string[] {
	return params.report.files[FILE]?.mutants.map(({ status }) => status) ?? []
}

const FIRST = report({ mutants: [mutant({ id: '1', status: 'Survived', line: 1 })] })
/*
 * scl's own survivorKey (scl/scripts/mutants/judge.ts, read-only), file src/a.ts, mutator ConditionalExpression,
 * original `x === 1`, replacement `true`:
 *   cd scl && npx tsx -e "import { survivorKey } from './scripts/mutants/judge.ts'; ..."
 * FIRST_KEY: line 'const a = x === 1', column 10. THIRD_KEY: line 'return x === 1', column 7.
 */
const FIRST_KEY = 'c696abeef2e74731'
const THIRD_KEY = '86250001f434f359'

const BASE_RECORD = {
	line: 1,
	mutation: 'm',
	reason: 'x is always 1 here',
	lineHash: 'line-hash',
	testsHash: 'tests-hash',
}

/** A record of the given family: `removable` only for the two families that carry it. */
function record(params: { family?: MutationFamily; [key: string]: unknown } = {}): MutationRecord {
	const { family = 'invariant-guard', ...rest } = params
	return family === 'invariant-guard' || family === 'fallback-never-taken'
		? { ...BASE_RECORD, family, removable: false, ...rest }
		: ({ ...BASE_RECORD, family, ...rest } as MutationRecord)
}

function migrated(): MutationRecord {
	const { testsHash: _omitted, ...rest } = record()
	return rest as MutationRecord
}

function recorded(params: { keys: string[]; record?: MutationRecord }): MutationRecords {
	const { keys, record: one = record() } = params
	return { [FILE]: Object.fromEntries(keys.map((key) => [key, one])) }
}

describe('survivorKey', () => {
	it("equals scl's key for the same input", () => {
		expect(
			survivorKey({
				file: 'src/a.ts',
				mutatorName: 'ConditionalExpression',
				original: 'x === 1',
				replacement: 'true',
				line: 'const a = x === 1',
				column: 10,
			}),
		).toBe('c696abeef2e74731')
	})

	it('a survivor reported by the run → that key', () => {
		expect(judgeReport({ report: FIRST, records: {} }).survivors.map(({ key }) => key)).toEqual([
			FIRST_KEY,
		])
	})
})

describe('judgeReport', () => {
	it('a survivor no record lists → unlisted, with the range that re-mutates it and the hash of its line', () => {
		expect(judgeReport({ report: FIRST, records: {} }).unlisted).toEqual([
			{
				file: FILE,
				key: FIRST_KEY,
				line: 1,
				mutation: 'ConditionalExpression: x === 1 -> true',
				range: `${FILE}:1:10-1:17`,
				lineHash: hashLine({ text: LINE_ONE_HASH_TEXT }),
			},
		])
	})

	it('a survivor reported with the tests that cover it → carries the hash of their files and names', () => {
		const covered = report({
			mutants: [mutant({ id: '1', status: 'Survived', line: 1, coveredBy: ['1', '0'] })],
			testFiles: testFilesOf({ first: '0', second: '1' }),
		})
		expect(judgeReport({ report: covered, records: {} }).survivors).toEqual([
			expect.objectContaining({ testsHash: TESTS_HASH }),
		])
	})

	it('two reports numbering the same tests differently → the same tests hash', () => {
		function numbered(ids: { first: string; second: string }) {
			return report({
				mutants: [
					mutant({ id: '1', status: 'Survived', line: 1, coveredBy: [ids.first, ids.second] }),
				],
				testFiles: testFilesOf(ids),
			})
		}
		expect(
			judgeReport({ report: numbered({ first: '7', second: '3' }), records: {} }).survivors[0]
				?.testsHash,
		).toBe(
			judgeReport({ report: numbered({ first: '0', second: '1' }), records: {} }).survivors[0]
				?.testsHash,
		)
	})

	it.each([
		['an id the report does not resolve', ['0', '9'], testFilesOf({ first: '0', second: '1' })],
		['no testFiles in the report', ['0'], undefined],
	])(
		'a survivor covered by %s → no tests hash (its record keeps its reason)',
		(_label, coveredBy, testFiles) => {
			const covered = report({
				mutants: [mutant({ id: '1', status: 'Survived', line: 1, coveredBy })],
				testFiles,
			})
			expect(judgeReport({ report: covered, records: {} }).survivors[0]).not.toHaveProperty(
				'testsHash',
			)
		},
	)

	it('a survivor reported without covering tests → no tests hash', () => {
		expect(judgeReport({ report: FIRST, records: {} }).survivors[0]).not.toHaveProperty('testsHash')
	})

	it('a mutant no test runs → a survivor too', () => {
		const uncovered = report({ mutants: [mutant({ id: '1', status: 'NoCoverage', line: 1 })] })
		expect(judgeReport({ report: uncovered, records: {} }).survivors).toHaveLength(1)
	})

	it('a survivor recorded with a reason and a known family → listed', () => {
		expect(
			judgeReport({ report: FIRST, records: recorded({ keys: [FIRST_KEY] }) }).unlisted,
		).toEqual([])
	})

	it.each([
		['an empty reason', { reason: ' ' }],
		['a gap (not a family: a gap gets a test)', { family: 'gap' }],
		['an unknown family', { family: 'whatever' }],
	])('a survivor recorded with %s → unlisted', (_label, change) => {
		expect(
			judgeReport({
				report: FIRST,
				records: recorded({
					keys: [FIRST_KEY],
					record: record(change as Parameters<typeof record>[0]),
				}),
			}).unlisted,
		).toHaveLength(1)
	})

	it.each(MUTATION_FAMILIES.map((family) => [family] as const))(
		'a survivor recorded with the family %s → listed',
		(family) => {
			expect(
				judgeReport({
					report: FIRST,
					records: recorded({ keys: [FIRST_KEY], record: record({ family }) }),
				}).unlisted,
			).toEqual([])
		},
	)

	it('the same line twice in a file → the second numbered, whatever the run reports', () => {
		const second = report({ mutants: [mutant({ id: '2', status: 'Survived', line: 2 })] })
		expect(judgeReport({ report: second, records: {} }).survivors.map(({ key }) => key)).toEqual([
			`${FIRST_KEY}-1`,
		])
	})

	it('a line moved → the same key', () => {
		const moved = report({
			mutants: [mutant({ id: '1', status: 'Survived', line: 2 })],
			source: `\n${SOURCE}`,
		})
		expect(judgeReport({ report: moved, records: {} }).survivors.map(({ key }) => key)).toEqual([
			FIRST_KEY,
		])
	})

	it('the same change on another line → another key, never the recorded one', () => {
		const other = report({
			mutants: [mutant({ id: '3', status: 'Survived', line: 3, column: 8 })],
		})
		expect(judgeReport({ report: other, records: {} }).survivors.map(({ key }) => key)).toEqual([
			THIRD_KEY,
		])
	})

	it('a recorded mutant the run killed → stale; one the run did not reach → neither stale nor unlisted', () => {
		expect(
			judgeReport({
				report: report({ mutants: [mutant({ id: '1', status: 'Killed', line: 1 })] }),
				records: recorded({ keys: [FIRST_KEY, `${FIRST_KEY}-1`] }),
			}),
		).toEqual({
			survivors: [],
			unlisted: [],
			stale: [{ file: FILE, key: FIRST_KEY }],
		})
	})

	it('a file mutated whole → a recorded mutant the run no longer finds is stale', () => {
		expect(
			judgeReport({
				report: FIRST,
				records: recorded({ keys: [FIRST_KEY, 'gone'] }),
				wholeFiles: [FILE],
			}).stale,
		).toEqual([{ file: FILE, key: 'gone' }])
	})
})

describe('recordSurvivors', () => {
	it('keeps a written reason, family and hashes (line and change refreshed), adds a new survivor as unclassified with an empty reason, drops the stale, leaves other files', () => {
		const second = report({
			mutants: [
				mutant({ id: '1', status: 'Survived', line: 1 }),
				mutant({ id: '2', status: 'Survived', line: 2 }),
				mutant({ id: '3', status: 'Killed', line: 3, column: 8 }),
			],
		})
		const other = record({ reason: 'other reason', family: 'wording', line: 9 })
		const records: MutationRecords = {
			[FILE]: { [FIRST_KEY]: record({ line: 7 }), [THIRD_KEY]: record() },
			[OTHER]: { k: other },
		}
		expect(recordSurvivors({ records, verdict: judgeReport({ report: second, records }) })).toEqual(
			{
				[FILE]: {
					[FIRST_KEY]: record({ line: 1, mutation: 'ConditionalExpression: x === 1 -> true' }),
					[`${FIRST_KEY}-1`]: {
						line: 2,
						mutation: 'ConditionalExpression: x === 1 -> true',
						family: 'unclassified',
						reason: '',
						lineHash: hashLine({ text: LINE_ONE_HASH_TEXT }),
					},
				},
				[OTHER]: { k: other },
			},
		)
	})

	it('a new survivor reported with covering tests → its record gets the tests hash', () => {
		const covered = report({
			mutants: [mutant({ id: '1', status: 'Survived', line: 1, coveredBy: ['0', '1'] })],
			testFiles: testFilesOf({ first: '0', second: '1' }),
		})
		expect(
			recordSurvivors({
				records: {},
				verdict: judgeReport({ report: covered, records: {} }),
			}),
		).toEqual({
			[FILE]: {
				[FIRST_KEY]: {
					line: 1,
					mutation: 'ConditionalExpression: x === 1 -> true',
					family: 'unclassified',
					reason: '',
					lineHash: hashLine({ text: LINE_ONE_HASH_TEXT }),
					testsHash: TESTS_HASH,
				},
			},
		})
	})

	it('files and records come out sorted: files by name, records by line', () => {
		const records: MutationRecords = {
			[OTHER]: { z: record({ line: 5 }), y: record({ line: 2 }) },
			[FILE]: { x: record({ line: 8 }) },
		}
		const verdict = { survivors: [], unlisted: [], stale: [] }
		expect(Object.keys(recordSurvivors({ records, verdict }))).toEqual([FILE, OTHER])
		expect(Object.keys(recordSurvivors({ records, verdict })[OTHER] ?? {})).toEqual(['y', 'z'])
	})
})

describe('recordSurvivors: stale entries', () => {
	it('a file left with no record is dropped (scl)', () => {
		const records: MutationRecords = { [FILE]: { [FIRST_KEY]: record() }, [OTHER]: { k: record() } }
		expect(
			recordSurvivors({
				records,
				verdict: { survivors: [], unlisted: [], stale: [{ file: FILE, key: FIRST_KEY }] },
			}),
		).toEqual({ [OTHER]: { k: record() } })
	})
})

describe('withinTargets', () => {
	it('an incremental report also holds earlier runs → cut to the files and ranges asked for', () => {
		const incremental: MutationReport = {
			files: {
				[FILE]: {
					source: SOURCE,
					mutants: [
						mutant({ id: '1', status: 'Killed', line: 1 }),
						mutant({ id: '2', status: 'Survived', line: 2 }),
					],
				},
				[OTHER]: { source: SOURCE, mutants: [mutant({ id: '3', status: 'Survived', line: 1 })] },
			},
		}
		const targets = [
			{ file: FILE, range: { start: { line: 2, column: 0 }, end: { line: 2, column: 99 } } },
		]
		expect(Object.keys(withinTargets({ report: incremental, targets }).files)).toEqual([FILE])
		expect(statuses({ report: withinTargets({ report: incremental, targets }) })).toEqual([
			'Survived',
		])
	})

	it("a survivor's own range → holds that survivor", () => {
		const one = mutant({ id: '1', status: 'Survived', line: 1 })
		const targets = [
			{ file: FILE, range: { start: { line: 1, column: 10 }, end: { line: 1, column: 18 } } },
		]
		expect(
			statuses({ report: withinTargets({ report: report({ mutants: [one] }), targets }) }),
		).toEqual(['Survived'])
	})
})

describe('parseTarget', () => {
	it.each([
		['a file', 'src/a.ts', { file: 'src/a.ts' }],
		[
			'lines',
			'src/a.ts:2-4',
			{
				file: 'src/a.ts',
				range: { start: { line: 2, column: 0 }, end: { line: 4, column: Number.MAX_SAFE_INTEGER } },
			},
		],
		[
			'lines and columns',
			'src/a.ts:3:4-3:12',
			{ file: 'src/a.ts', range: { start: { line: 3, column: 4 }, end: { line: 3, column: 12 } } },
		],
	])('%s', (_label, target, expected) => {
		expect(parseTarget({ target })).toEqual(expected)
	})
})

describe('withLoneTimeouts', () => {
	it.each([
		['killed alone → killed', 'Killed', 'Killed'],
		['survives alone → a survivor', 'Survived', 'Survived'],
		['times out again → a timeout', 'Timeout', 'Timeout'],
	])('a timed-out mutant that %s', (_label, alone, expected) => {
		expect(
			statuses({
				report: withLoneTimeouts({
					report: report({
						mutants: [
							mutant({ id: '1', status: 'Timeout', line: 1 }),
							mutant({ id: '2', status: 'Survived', line: 2 }),
						],
					}),
					alone: report({ mutants: [mutant({ id: '9', status: alone, line: 1 })] }),
				}),
			}),
		).toEqual([expected, 'Survived'])
	})
})

describe('withFullRun', () => {
	it('a survivor the full tier kills → killed; one it does not → still a survivor', () => {
		expect(
			statuses({
				report: withFullRun({
					fast: report({
						mutants: [
							mutant({ id: '1', status: 'Survived', line: 1 }),
							mutant({ id: '2', status: 'NoCoverage', line: 2 }),
							mutant({ id: '3', status: 'Killed', line: 3, column: 8 }),
						],
					}),
					full: report({
						mutants: [
							mutant({ id: '7', status: 'Killed', line: 1 }),
							mutant({ id: '8', status: 'Survived', line: 2 }),
						],
					}),
				}),
			}),
		).toEqual(['Killed', 'NoCoverage', 'Killed'])
	})
})

describe('rangesOf', () => {
	it('the mutants of the selected statuses, each at its range, once each', () => {
		const run = report({
			mutants: [
				mutant({ id: '1', status: 'Timeout', line: 1 }),
				mutant({ id: '2', status: 'Timeout', line: 1 }),
				mutant({ id: '3', status: 'Killed', line: 2 }),
				mutant({ id: '4', status: 'Timeout', line: 3, column: 8 }),
			],
		})
		expect(rangesOf({ report: run, select: (status) => status === 'Timeout' })).toEqual([
			`${FILE}:1:10-1:17`,
			`${FILE}:3:7-3:14`,
		])
	})
})

describe('exactRange', () => {
	it('the report counts both columns from 1, --mutate counts both from 0', () => {
		const one = mutant({ id: '1', status: 'Survived', line: 3, column: 5 })
		expect(exactRange({ file: FILE, mutant: one })).toBe(`${FILE}:3:4-3:11`)
	})
})

describe('needsJudging', () => {
	it.each([
		['both hashes equal → no', { lineHash: 'line-hash', testsHash: 'tests-hash' }, false],
		['the line changed → yes', { lineHash: 'other', testsHash: 'tests-hash' }, true],
		['the tests changed → yes', { lineHash: 'line-hash', testsHash: 'other' }, true],
		['both changed → yes', { lineHash: 'other', testsHash: 'other' }, true],
	])('%s', (_label, hashes, expected) => {
		expect(needsJudging({ record: record(), ...hashes })).toBe(expected)
	})

	it('a record without testsHash (migrated) → no, even though the tests hash differs; it keeps its reason', () => {
		expect(needsJudging({ record: migrated(), lineHash: 'line-hash', testsHash: 'any' })).toBe(
			false,
		)
	})

	it('a migrated record whose line changed → yes', () => {
		expect(needsJudging({ record: migrated(), lineHash: 'other', testsHash: 'any' })).toBe(true)
	})
})

describe('hashLine', () => {
	it('ignores surrounding whitespace only', () => {
		expect(hashLine({ text: '\t  const a = 1  ' })).toBe(hashLine({ text: 'const a = 1' }))
		expect(hashLine({ text: 'const a  = 1' })).not.toBe(hashLine({ text: 'const a = 1' }))
		expect(hashLine({ text: 'const a = 2' })).not.toBe(hashLine({ text: 'const a = 1' }))
	})
})

describe('hashTests', () => {
	it('is independent of the order of the test ids, and depends on the ids', () => {
		expect(hashTests({ tests: ['b', 'a', 'c'] })).toBe(hashTests({ tests: ['a', 'c', 'b'] }))
		expect(hashTests({ tests: ['a', 'b'] })).not.toBe(hashTests({ tests: ['a', 'c'] }))
	})

	it('does not collide a split id with a joined one', () => {
		expect(hashTests({ tests: ['a', 'b'] })).not.toBe(hashTests({ tests: ['ab'] }))
	})

	it('a duplicated id → the hash of the deduplicated list', () => {
		expect(hashTests({ tests: ['a', 'b', 'a'] })).toBe(hashTests({ tests: ['a', 'b'] }))
	})
})
