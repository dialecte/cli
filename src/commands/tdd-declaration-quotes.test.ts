/**
 * The entries of the lot declaration (`accept`, `revised`) match test titles with quotes folded: a straight
 * apostrophe or double quote in an entry names a case whose title holds the curly one, and the reverse. An entry
 * that still names nothing keeps its `unused accept` line, which names the closest title.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { entryNamesCase, findCaseEntry } from '../lib/tdd/lot-declaration.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { LotCaseList } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-11-09T12:00:00.000Z')

/** The package's gate is one passing step; the tdd step is added by the gate itself. */
const GATE_CONFIG = { gate: { fast: [{ name: 'check', run: 'true' }] } }

const TEST_FILE = 'src/quote.test.ts'

/** The same title spelled with each kind of quote, a straight one and its curly counterpart. */
const QUOTE_SPELLINGS = [
	{ kind: 'single', straight: "it's the plus", curly: 'it\u{2019}s the plus' },
	{ kind: 'single, opening', straight: "the 'plus' case", curly: 'the \u{2018}plus\u{2019} case' },
	{ kind: 'double', straight: 'the "plus" case', curly: 'the \u{201C}plus\u{201D} case' },
] as const

const QUOTED_LISTS: LotCaseList[] = ['accept', 'revised']

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

function gate(params: { cwd: string; argv: string[] }) {
	return runGate({ cwd: params.cwd, argv: params.argv })
}

describe('a lot declaration entry and the quotes of a title', () => {
	for (const list of QUOTED_LISTS)
		for (const { kind, straight, curly } of QUOTE_SPELLINGS) {
			it(`${list}: an entry with a straight ${kind} quote names the case whose title holds the curly one`, () => {
				const testCase = { file: TEST_FILE, name: curly, project: '' }
				const entry = `${TEST_FILE}::${straight}`

				expect({
					names: entryNamesCase({ entry, testCase, list }),
					found: findCaseEntry({ entries: [{ case: entry, reason: 'r' }], testCase, list })?.case,
				}).toEqual({ names: true, found: entry })
			})

			it(`${list}: an entry with a curly ${kind} quote names the case whose title holds the straight one`, () => {
				const testCase = { file: TEST_FILE, name: straight, project: '' }
				const entry = `${TEST_FILE}::${curly}`

				expect({
					names: entryNamesCase({ entry, testCase, list }),
					found: findCaseEntry({ entries: [{ case: entry, reason: 'r' }], testCase, list })?.case,
				}).toEqual({ names: true, found: entry })
			})
		}
})

describe('a lot declaration entry never names a title it differs from by more than quotes', () => {
	const NEGATIVES: Record<string, { entry: string; title: string }> = {
		"an entry with the apostrophe against a title without it (it's / its)": {
			entry: "it's the plus",
			title: 'its the plus',
		},
		'an entry with a backtick in place of the apostrophe': {
			entry: 'it`s the plus',
			title: "it's the plus",
		},
		'an entry with a prime in place of the apostrophe': {
			entry: 'it\u{2032}s the plus',
			title: "it's the plus",
		},
		'an entry in another letter case than the title': {
			entry: "It's the plus",
			title: "it's the plus",
		},
	}

	for (const list of QUOTED_LISTS)
		for (const [name, { entry, title }] of Object.entries(NEGATIVES))
			it(`${list}: ${name} → names nothing`, () => {
				const testCase = { file: TEST_FILE, name: title, project: '' }
				const full = `${TEST_FILE}::${entry}`

				expect({
					names: entryNamesCase({ entry: full, testCase, list }),
					found: findCaseEntry({ entries: [{ case: full, reason: 'r' }], testCase, list }),
				}).toEqual({ names: false, found: undefined })
			})
})

describe(
	'tdd red and the gate on declared entries with quotes',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		const ADD =
			'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
		const ADD_STUB =
			"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

		/** A test file of one case titled `title`, the title written as a string literal. */
		function testFileTitled(title: string): string {
			return [
				"import { add } from './add.ts'",
				"import { expect, it } from 'vitest'",
				`it(${JSON.stringify(title)}, () => { expect(add(1, 2)).toBe(3) })`,
				'',
			].join('\n')
		}

		it('a passing case with a curly apostrophe in its title, accepted by an entry with a straight one → red records it accepted', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'src/add.ts': ADD },
			})
			writeFiles({
				root,
				files: {
					'src/add.test.ts': testFileTitled('doesn\u{2019}t add wrongly'),
					'.dialecte/lot.json': JSON.stringify({
						accept: [
							{ case: "src/add.test.ts::doesn't add wrongly", reason: 'pins existing behaviour' },
						],
					}),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(red.output.split('\n')).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/^accepted +src\/add\.test\.ts::doesn\u{2019}t add wrongly\b/u),
				]),
			)
		})

		it('an accept entry that names no case but is close to a title → its unused accept line still stands and names that title', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'src/add.ts': ADD_STUB },
			})
			writeFiles({ root, files: { 'src/add.test.ts': testFileTitled('adds two numbers') } })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, 'src/add.ts'), ADD)
			await tdd({ cwd: root, argv: ['green'] })
			writeFiles({
				root,
				files: {
					'.dialecte/lot.json': JSON.stringify({
						accept: [{ case: 'src/add.test.ts::adds two numbres', reason: 'a typo' }],
					}),
				},
			})

			const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

			const unused = result.output.split('\n').find((line) => line.includes('unused accept'))
			expect(unused).toContain('src/add.test.ts::adds two numbres')
			expect(unused).toContain('src/add.test.ts::adds two numbers')
		})
	},
)
