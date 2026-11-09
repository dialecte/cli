import {
	OTHER_HOOK_LINE,
	SPLIT_SOURCE_FILE,
	VITEST_IMPORT,
} from '../../../test/moved-cases-fixture.constants.ts'
import {
	baseRunnerText,
	hookedText,
	locationOf,
	pathText,
	runnerText,
	suiteCaseName,
	suiteText,
} from '../../../test/moved-cases-fixture.ts'
import { MOVED_CASES_LARGE_TABLE_BOUND_MS } from '../../../test/test-timing.constants.ts'
import { findMovedByName, findMovedCases } from './moved-cases.ts'

import { describe, expect, it } from 'vitest'

import type {
	ChangedTestFile,
	MovedByNameCases,
	MovedCaseInput,
	MovedCases,
	NamedRegistration,
	TestCaseId,
} from './tdd.types.ts'

/** A new test file: its text, no base. */
function newFile(params: { file: string; text: string }): ChangedTestFile {
	return { file: params.file, text: params.text, baseText: undefined }
}

/** The label of a case: `<file>::<name>` and ` [project]` when a project runs it. */
function labelOf(testCase: TestCaseId): string {
	return `${testCase.file}::${testCase.name}${testCase.project ? ` [${testCase.project}]` : ''}`
}

/** What a result says, in a form that reads in a diff: sources, sorted case labels and targets, the flag. */
function summaryOf(result: MovedCases | MovedByNameCases): {
	groups: Array<{
		source: string
		cases: string[]
		targets: string[]
		surroundingsChanged: boolean
	}>
	ambiguous: Array<{ name: string; project: string; files: string[] }>
} {
	return {
		groups: result.groups.map((group) => ({
			source: group.source,
			cases: group.cases.map(labelOf).sort(),
			targets: [...group.targets].sort(),
			surroundingsChanged: group.surroundingsChanged,
		})),
		ambiguous: result.ambiguous.map((each) => ({
			name: each.name,
			project: each.project,
			files: [...each.files].sort(),
		})),
	}
}

/** The cases of a file of `suiteText`: one per group, located at its test call. */
function suiteCases(params: {
	file: string
	groups: readonly string[]
	project?: string
}): MovedCaseInput[] {
	const text = suiteText({ groups: params.groups })
	return params.groups.map((group) => ({
		file: params.file,
		name: suiteCaseName(group),
		project: params.project ?? '',
		location: locationOf({ text, needle: `it('keeps attribute a', () => { expect('${group}')` }),
	}))
}

const GROUPS = ['DD_1', 'DD_2', 'DD_3']
const TARGETS = ['src/dd-1.test.ts', 'src/dd-2.test.ts', 'src/dd-3.test.ts']

/** The three-way split of the base's `suiteText`: one new file per group. */
function splitFiles(params: {
	edit?: Record<string, (text: string) => string>
}): ChangedTestFile[] {
	return GROUPS.map((group, index) =>
		newFile({
			file: TARGETS[index],
			text: suiteText({ groups: [group], edit: params.edit }),
		}),
	)
}

/** Runs the match and tells its sources, how many cases it moved and whether it ran within the bound. */
function timedFacts(run: () => MovedCases): {
	sources: string[]
	moved: number
	withinBound: boolean
} {
	const started = performance.now()
	const result = run()
	const elapsed = performance.now() - started
	return {
		sources: result.groups.map((group) => group.source).sort(),
		moved: result.groups.reduce((total, group) => total + group.cases.length, 0),
		withinBound: elapsed < MOVED_CASES_LARGE_TABLE_BOUND_MS,
	}
}

/** The moved cases of a summary and whether each group is flagged. */
function flaggedFacts(summary: ReturnType<typeof summaryOf>): {
	cases: string[]
	flagged: boolean[]
} {
	return {
		cases: summary.groups.flatMap((group) => group.cases),
		flagged: summary.groups.map((group) => group.surroundingsChanged),
	}
}

describe('findMovedCases', () => {
	it('a file of three describes deleted, its cases split unchanged into three new files → one group for the source, three cases, three targets, nothing ambiguous', () => {
		expect(
			summaryOf(
				findMovedCases({
					files: splitFiles({}),
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: suiteText({ groups: GROUPS }) }],
					cases: GROUPS.flatMap((group, index) =>
						suiteCases({ file: TARGETS[index], groups: [group] }),
					),
				}),
			),
		).toEqual({
			groups: [
				{
					source: SPLIT_SOURCE_FILE,
					cases: GROUPS.map((group, index) => `${TARGETS[index]}::${suiteCaseName(group)}`),
					targets: TARGETS,
					surroundingsChanged: false,
				},
			],
			ambiguous: [],
		})
	})

	it("the same split with one case's body edited → that case is not moved; the other two are", () => {
		const edit = {
			DD_2: (text: string) => text.replace("toBe('DD_2')", "toBe('DD_2'.toString())"),
		}

		expect(
			summaryOf(
				findMovedCases({
					files: splitFiles({ edit }),
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: suiteText({ groups: GROUPS }) }],
					cases: GROUPS.flatMap((group, index) => ({
						file: TARGETS[index],
						name: suiteCaseName(group),
						project: '',
						location: locationOf({
							text: suiteText({ groups: [group], edit }),
							needle: "it('keeps attribute a'",
						}),
					})),
				}),
			).groups.map((group) => group.cases),
		).toEqual([
			[`${TARGETS[0]}::${suiteCaseName('DD_1')}`, `${TARGETS[2]}::${suiteCaseName('DD_3')}`],
		])
	})

	it('the same case, call and describe path in two new files → neither is moved, both files named as ambiguous; the case unique to a third file is moved', () => {
		const files = [
			newFile({ file: 'src/dd-a.test.ts', text: suiteText({ groups: ['DD_1'] }) }),
			newFile({ file: 'src/dd-b.test.ts', text: suiteText({ groups: ['DD_1'] }) }),
			newFile({ file: 'src/dd-c.test.ts', text: suiteText({ groups: ['DD_2'] }) }),
		]

		expect(
			summaryOf(
				findMovedCases({
					files,
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: suiteText({ groups: ['DD_1', 'DD_2'] }) }],
					cases: [
						...suiteCases({ file: 'src/dd-a.test.ts', groups: ['DD_1'] }),
						...suiteCases({ file: 'src/dd-b.test.ts', groups: ['DD_1'] }),
						...suiteCases({ file: 'src/dd-c.test.ts', groups: ['DD_2'] }),
					],
				}),
			),
		).toEqual({
			groups: [
				{
					source: SPLIT_SOURCE_FILE,
					cases: [`src/dd-c.test.ts::${suiteCaseName('DD_2')}`],
					targets: ['src/dd-c.test.ts'],
					surroundingsChanged: false,
				},
			],
			ambiguous: [
				{
					name: suiteCaseName('DD_1'),
					project: '',
					files: ['src/dd-a.test.ts', 'src/dd-b.test.ts'],
				},
			],
		})
	})

	it("a source kept but changed, one case cut out of it into a new file unchanged → that case is moved; the source's own case is not", () => {
		const files: ChangedTestFile[] = [
			{
				file: SPLIT_SOURCE_FILE,
				text: suiteText({ groups: ['DD_1'] }),
				baseText: suiteText({ groups: ['DD_1', 'DD_2'] }),
			},
			newFile({ file: 'src/dd-2.test.ts', text: suiteText({ groups: ['DD_2'] }) }),
		]

		expect(
			summaryOf(
				findMovedCases({
					files,
					deleted: [],
					cases: [
						...suiteCases({ file: SPLIT_SOURCE_FILE, groups: ['DD_1'] }),
						...suiteCases({ file: 'src/dd-2.test.ts', groups: ['DD_2'] }),
					],
				}),
			),
		).toEqual({
			groups: [
				{
					source: SPLIT_SOURCE_FILE,
					cases: [`src/dd-2.test.ts::${suiteCaseName('DD_2')}`],
					targets: ['src/dd-2.test.ts'],
					surroundingsChanged: false,
				},
			],
			ambiguous: [],
		})
	})

	it('two projects running the split files → each project case is moved on its own, labelled with its project, none ambiguous', () => {
		const cases = ['one', 'two'].flatMap((project) =>
			GROUPS.flatMap((group, index) =>
				suiteCases({ file: TARGETS[index], groups: [group], project }),
			),
		)

		expect(
			summaryOf(
				findMovedCases({
					files: splitFiles({}),
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: suiteText({ groups: GROUPS }) }],
					cases,
				}),
			),
		).toEqual({
			groups: [
				{
					source: SPLIT_SOURCE_FILE,
					cases: ['one', 'two']
						.flatMap((project) =>
							GROUPS.map(
								(group, index) => `${TARGETS[index]}::${suiteCaseName(group)} [${project}]`,
							),
						)
						.sort(),
					targets: TARGETS,
					surroundingsChanged: false,
				},
			],
			ambiguous: [],
		})
	})

	const PATH_CALL = "it('keeps attribute a'"

	it('the same call moved under a renamed describe (DD_1 → DD_9) → not moved: the describe path decides', () => {
		expect(
			summaryOf(
				findMovedCases({
					files: [newFile({ file: 'src/dd-9.test.ts', text: pathText('DD_9') })],
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: pathText('DD_1') }],
					cases: [
						{
							file: 'src/dd-9.test.ts',
							name: 'D > DD_9 > keeps attribute a',
							project: '',
							location: locationOf({ text: pathText('DD_9'), needle: PATH_CALL }),
						},
					],
				}),
			).groups,
		).toEqual([])
	})

	it('a call copied into a new file while the changed source still holds it under the same path → not moved: the source keeps it', () => {
		const source: ChangedTestFile = {
			file: SPLIT_SOURCE_FILE,
			text: `${pathText('DD_1')}// edited elsewhere\n`,
			baseText: pathText('DD_1'),
		}

		expect(
			summaryOf(
				findMovedCases({
					files: [source, newFile({ file: 'src/dd-copy.test.ts', text: pathText('DD_1') })],
					deleted: [],
					cases: [
						{
							file: 'src/dd-copy.test.ts',
							name: 'D > DD_1 > keeps attribute a',
							project: '',
							location: locationOf({ text: pathText('DD_1'), needle: PATH_CALL }),
						},
					],
				}),
			).groups,
		).toEqual([])
	})

	it('the same call in two files, each file run by one project only → both moved, nothing ambiguous', () => {
		const text = pathText('DD_1')
		const location = locationOf({ text, needle: PATH_CALL })

		expect(
			summaryOf(
				findMovedCases({
					files: [
						newFile({ file: 'src/dd-a.test.ts', text }),
						newFile({ file: 'src/dd-b.test.ts', text }),
					],
					deleted: [{ file: SPLIT_SOURCE_FILE, baseText: text }],
					cases: [
						{
							file: 'src/dd-a.test.ts',
							name: 'D > DD_1 > keeps attribute a',
							project: 'one',
							location,
						},
						{
							file: 'src/dd-b.test.ts',
							name: 'D > DD_1 > keeps attribute a',
							project: 'two',
							location,
						},
					],
				}),
			),
		).toEqual({
			groups: [
				{
					source: SPLIT_SOURCE_FILE,
					cases: [
						'src/dd-a.test.ts::D > DD_1 > keeps attribute a [one]',
						'src/dd-b.test.ts::D > DD_1 > keeps attribute a [two]',
					],
					targets: ['src/dd-a.test.ts', 'src/dd-b.test.ts'],
					surroundingsChanged: false,
				},
			],
			ambiguous: [],
		})
	})

	it('a table runner file split into two runner files over the same data → every row is moved: the rows share one test call', () => {
		const legs = [
			{ file: 'src/dd-runner-a.test.ts', leg: 'a', rows: [1, 2] },
			{ file: 'src/dd-runner-b.test.ts', leg: 'b', rows: [3, 4] },
		]
		const cases = legs.flatMap((leg) =>
			leg.rows.map((row) => ({
				file: leg.file,
				name: `D > DD_${row} keeps attribute a`,
				project: '',
				location: locationOf({
					text: runnerText({ leg: leg.leg }),
					needle: 'it(row.name,',
				}),
			})),
		)

		expect(
			summaryOf(
				findMovedCases({
					files: legs.map((leg) => newFile({ file: leg.file, text: runnerText({ leg: leg.leg }) })),
					deleted: [{ file: 'src/dd-runner.test.ts', baseText: baseRunnerText() }],
					cases,
				}),
			),
		).toEqual({
			groups: [
				{
					source: 'src/dd-runner.test.ts',
					cases: legs.flatMap((leg) =>
						leg.rows.map((row) => `${leg.file}::D > DD_${row} keeps attribute a`),
					),
					targets: legs.map((leg) => leg.file),
					surroundingsChanged: false,
				},
			],
			ambiguous: [],
		})
	})

	it('8,000 cases of a large table over 5 source files → every case matched to its source within the bound: the match is linear', () => {
		const sources = [1, 2, 3, 4, 5]
		/** A file of 1,600 distinct test calls, one per row, in a describe named for the source. */
		function tableText(index: number): string {
			return [
				VITEST_IMPORT,
				`describe('S${index}', () => {`,
				...Array.from(
					{ length: 1600 },
					(_, row) => `\tit('row ${row}', () => { expect(${row}).toBe(${row}) })`,
				),
				'})',
				'',
			].join('\n')
		}
		// row r is on line r + 3 (after the import and the describe), its call at column 2 (after the tab)
		const cases = sources.flatMap((index) =>
			Array.from({ length: 1600 }, (_, row) => ({
				file: `src/t${index}.test.ts`,
				name: `S${index} > row ${row}`,
				project: '',
				location: { line: row + 3, column: 2 },
			})),
		)

		expect(
			timedFacts(() =>
				findMovedCases({
					files: sources.map((index) =>
						newFile({ file: `src/t${index}.test.ts`, text: tableText(index) }),
					),
					deleted: sources.map((index) => ({
						file: `src/s${index}.test.ts`,
						baseText: tableText(index),
					})),
					cases,
				}),
			),
		).toEqual({
			sources: sources.map((index) => `src/s${index}.test.ts`),
			moved: 8000,
			withinBound: true,
		})
	})

	const HOOKED_CASES = ['DD_1 keeps attribute a', 'DD_2 keeps attribute b']

	/** What `findMovedCases` is given for the hooked source split into two files; `second` is the second hook line. */
	function hookedInput(params: { second?: string }): Parameters<typeof findMovedCases>[0] {
		const targets = [
			{ file: 'src/dd-1.test.ts', text: hookedText({ names: [HOOKED_CASES[0]] }) },
			{
				file: 'src/dd-2.test.ts',
				text: hookedText({ names: [HOOKED_CASES[1]], hook: params.second }),
			},
		]
		return {
			files: targets.map((target) => newFile(target)),
			deleted: [{ file: SPLIT_SOURCE_FILE, baseText: hookedText({ names: HOOKED_CASES }) }],
			cases: targets.map((target, index) => ({
				file: target.file,
				name: HOOKED_CASES[index],
				project: '',
				location: locationOf({ text: target.text, needle: `it('${HOOKED_CASES[index]}'` }),
			})),
		}
	}

	it('top-level it calls, their imports and a beforeEach kept in each of the two files the source is split into → moved, surroundings not flagged', () => {
		expect(
			summaryOf(findMovedCases(hookedInput({}))).groups.map((group) => group.surroundingsChanged),
		).toEqual([false])
	})

	it("the same split where one target's beforeEach has other tokens → still moved, the group flagged: test code changed around them", () => {
		expect(
			flaggedFacts(summaryOf(findMovedCases(hookedInput({ second: OTHER_HOOK_LINE })))),
		).toEqual({
			cases: HOOKED_CASES.map((name, index) => `src/dd-${index + 1}.test.ts::${name}`),
			flagged: [true],
		})
	})
})

/** A case registered by a runner call (`runner`) or by a direct test call (undefined). */
function registration(params: {
	file: string
	name: string
	runner?: string
	project?: string
}): NamedRegistration {
	return {
		file: params.file,
		name: params.name,
		project: params.project ?? '',
		runner: params.runner,
	}
}

const ROW_NAMES = [1, 2, 3, 4, 5, 6].map((row) => `D > DD_${row} keeps attribute a`)
const LEG_FILES = ['src/leg-a.test.ts', 'src/leg-b.test.ts', 'src/leg-c.test.ts']
const BASE_RUNNER = 'checkRow(row)'
const LEG_RUNNER = 'defineLeg({ subset: [1, 2] })'

/** The six rows registered at the base through `checkRow` in `src/dd-table.test.ts`. */
function baseRows(): NamedRegistration[] {
	return ROW_NAMES.map((name) =>
		registration({ file: 'src/dd-table.test.ts', name, runner: BASE_RUNNER }),
	)
}

/** The six rows now, two per leg, registered through `defineLeg`. */
function legRows(params: { rename?: Record<string, string> }): NamedRegistration[] {
	return ROW_NAMES.map((name, index) =>
		registration({
			file: LEG_FILES[Math.floor(index / 2)],
			name: params.rename?.[name] ?? name,
			runner: LEG_RUNNER,
		}),
	)
}

/** What a by-name result says: sources, targets, sorted moved case labels, ambiguous names, runner calls. */
function byNameFacts(result: MovedByNameCases): {
	sources: string[]
	targets: string[]
	moved: string[]
	movedCount: number
	ambiguous: ReturnType<typeof summaryOf>['ambiguous']
	runnerFrom: string[]
	runnerTo: string[]
} {
	const summary = summaryOf(result)
	const moved = summary.groups.flatMap((group) => group.cases).sort()
	return {
		sources: summary.groups.map((group) => group.source),
		targets: summary.groups.flatMap((group) => group.targets),
		moved,
		movedCount: moved.length,
		ambiguous: summary.ambiguous,
		runnerFrom: result.groups.map((group) => group.runnerFrom.join(' ')),
		runnerTo: result.groups.map((group) => group.runnerTo.join(' ')),
	}
}

describe('findMovedByName', () => {
	it('six rows registered by checkRow in one deleted file, now by defineLeg in three leg files → one group, six cases, three targets, the two runner calls listed', () => {
		expect(byNameFacts(findMovedByName({ cases: legRows({}), baseCases: baseRows() }))).toEqual({
			sources: ['src/dd-table.test.ts'],
			targets: LEG_FILES,
			moved: legRows({}).map(labelOf).sort(),
			movedCount: 6,
			ambiguous: [],
			runnerFrom: [expect.stringContaining('checkRow')],
			runnerTo: [expect.stringContaining('defineLeg')],
		})
	})

	it('one row renamed in a leg (a name the base never registered) → that case is not moved; the other five are', () => {
		const renamed = { [ROW_NAMES[4]]: 'D > DD_5 keeps attribute a, renamed' }

		expect(
			byNameFacts(findMovedByName({ cases: legRows({ rename: renamed }), baseCases: baseRows() }))
				.moved.map((label) => label.split('::')[1])
				.sort(),
		).toEqual(ROW_NAMES.filter((name) => name !== ROW_NAMES[4]).sort())
	})

	it('the same row registered by two legs → neither is moved, both files named as ambiguous; the other rows are', () => {
		const cases = [
			...legRows({}),
			registration({ file: 'src/leg-d.test.ts', name: ROW_NAMES[1], runner: LEG_RUNNER }),
		]

		expect(byNameFacts(findMovedByName({ cases, baseCases: baseRows() }))).toMatchObject({
			ambiguous: [{ name: ROW_NAMES[1], project: '', files: [LEG_FILES[0], 'src/leg-d.test.ts'] }],
			moved: legRows({})
				.filter((each) => each.name !== ROW_NAMES[1])
				.map(labelOf)
				.sort(),
		})
	})

	it('a name registered twice at the base (two source files) → not moved, both sources named as ambiguous', () => {
		const baseCases = [
			...baseRows(),
			registration({ file: 'src/dd-other.test.ts', name: ROW_NAMES[0], runner: BASE_RUNNER }),
		]

		expect(byNameFacts(findMovedByName({ cases: legRows({}), baseCases }))).toMatchObject({
			ambiguous: [
				{
					name: ROW_NAMES[0],
					project: '',
					files: ['src/dd-other.test.ts', 'src/dd-table.test.ts'],
				},
			],
			movedCount: 5,
		})
	})

	it('a kept base file that loses rows to legs → those rows moved by name; a row registered in the shrunk file and in a leg → ambiguous naming both, never moved; a row only in the shrunk file stays its own', () => {
		const stayed = [0, 1].map((index) =>
			registration({
				file: 'src/dd-table.test.ts',
				name: ROW_NAMES[index],
				runner: BASE_RUNNER,
			}),
		)
		const leg = [1, 2, 3, 4, 5].map((index) =>
			registration({ file: LEG_FILES[0], name: ROW_NAMES[index], runner: LEG_RUNNER }),
		)

		expect(
			byNameFacts(findMovedByName({ cases: [...stayed, ...leg], baseCases: baseRows() })),
		).toMatchObject({
			sources: ['src/dd-table.test.ts'],
			moved: leg
				.filter((each) => each.name !== ROW_NAMES[1])
				.map(labelOf)
				.sort(),
			ambiguous: [
				{ name: ROW_NAMES[1], project: '', files: ['src/dd-table.test.ts', LEG_FILES[0]] },
			],
		})
	})

	it('a base case written as a direct test call, the same name registered by a helper now → not moved by name', () => {
		const baseCases = ROW_NAMES.map((name) =>
			registration({ file: 'src/dd-direct.test.ts', name, runner: undefined }),
		)

		expect(byNameFacts(findMovedByName({ cases: legRows({}), baseCases })).moved).toEqual([])
	})

	it('a case now written as a direct test call, the same name registered by a runner at the base → not moved by name', () => {
		const cases = ROW_NAMES.map((name) =>
			registration({ file: LEG_FILES[0], name, runner: undefined }),
		)

		expect(byNameFacts(findMovedByName({ cases, baseCases: baseRows() })).moved).toEqual([])
	})

	it('the same names in two projects → each project case is moved on its own', () => {
		const names = ROW_NAMES.slice(0, 2)
		const baseCases = ['one', 'two'].flatMap((project) =>
			names.map((name) =>
				registration({ file: 'src/dd-table.test.ts', name, runner: BASE_RUNNER, project }),
			),
		)
		const cases = ['one', 'two'].flatMap((project) =>
			names.map((name) => registration({ file: LEG_FILES[0], name, runner: LEG_RUNNER, project })),
		)

		expect(byNameFacts(findMovedByName({ cases, baseCases }))).toMatchObject({
			ambiguous: [],
			moved: cases.map(labelOf).sort(),
		})
	})
})
