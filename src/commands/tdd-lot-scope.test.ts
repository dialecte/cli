/**
 * What `tdd` takes for "the lot" and for "test code" on the branches real lots run on: a branch holding
 * earlier committed lots, a package whose `src/test` is a production entry, a formatter pass or a review
 * revision after the code exists, a file with one refused case.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

import type { TddLedger, TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-10-30T12:00:00.000Z')

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({
		cwd: params.cwd,
		argv: params.argv,
		now: () => NOW,
	})
}

function gate(params: { cwd: string; argv: string[] }) {
	return runGate({
		cwd: params.cwd,
		argv: params.argv,
	})
}

function readLedger(root: string): TddLedger {
	const path = join(root, '.git', 'dialecte-tdd.json')
	return existsSync(path)
		? (JSON.parse(readFileSync(path, 'utf8')) as TddLedger)
		: { version: 3, entries: [] }
}

/** The receipts of the ledger (its freezes left out), as `<kind> <name>`. */
function receiptLines(root: string): string[] {
	return readLedger(root)
		.entries.filter((entry): entry is TddReceipt => entry.kind !== 'freeze')
		.map((receipt) => `${receipt.kind} ${receipt.name}`)
}

/** The lines of an output that report a case or a file. */
function caseLines(output: string): string[] {
	return output
		.split('\n')
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted|revised) /.test(line))
}

const GATE_CONFIG = { gate: { fast: [{ name: 'check', run: 'true' }] } }

const ADD_STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

const ADD = 'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'})',
	'',
].join('\n')

const SUB_STUB =
	"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"

const SUB = 'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'

const SUB_TEST = [
	"import { sub } from './sub.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('sub', () => {",
	"\tit('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })",
	'})',
	'',
].join('\n')

/**
 * A branch of `main` whose first lot (add) is committed with its tests; the second lot (sub) is the
 * uncommitted work: a stub and a new test file.
 */
function branchWithCommittedLot(params: { dialecte?: Record<string, unknown> } = {}): string {
	const root = createVitestPackage({ dialecte: params.dialecte })
	git({ root, args: ['checkout', '-q', '-b', 'feat/lot-two'] })
	writeFiles({ root, files: { 'src/add.ts': ADD, 'src/add.test.ts': ADD_TEST } })
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'feat(add): add'] })
	writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })
	return root
}

describe('tdd on a branch holding an earlier committed lot', { timeout: 240_000 }, () => {
	it('status and red without --base → only the uncommitted work is the lot: the committed cases are neither changed nor missing a receipt', async () => {
		const root = branchWithCommittedLot()

		const before = await tdd({ cwd: root, argv: ['status'] })
		const red = await tdd({ cwd: root, argv: ['red'] })
		const after = await tdd({ cwd: root, argv: ['status'] })

		expect(before.output).toBe('missing receipt  src/sub.test.ts::sub > three minus one → two')
		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub',
		])
		expect(after.output).toBe('red  src/sub.test.ts::sub > three minus one → two')
	})

	it('status --base <ref> → the whole-branch view: the committed cases count again, missing their receipts', async () => {
		const root = branchWithCommittedLot()

		const whole = await tdd({ cwd: root, argv: ['status', '--base', 'main'] })

		expect(whole.output.split('\n')).toEqual([
			'missing receipt  src/add.test.ts::add > one plus two → three',
			'missing receipt  src/sub.test.ts::sub > three minus one → two',
		])
	})

	it('red --base <ref> → the committed test files are run again, their passing cases refused as proving nothing', async () => {
		const root = branchWithCommittedLot()

		const whole = await tdd({ cwd: root, argv: ['red', '--base', 'main'] })

		expect(whole.exitCode).toBe(1)
		expect(caseLines(whole.output)).toEqual([
			'refused  src/add.test.ts::add > one plus two → three  it ran green: this test proves nothing yet',
			'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub',
		])
	})

	it('the gate tdd step measures from HEAD by default; --base main and --full give the whole-branch view and ask the committed lot for its receipts', async () => {
		const step = [{ name: 'check', run: 'true' }]
		const root = branchWithCommittedLot({ dialecte: { gate: { fast: step, full: step } } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/sub.ts'), SUB)
		await tdd({ cwd: root, argv: ['green'] })

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })
		const base = await gate({ cwd: root, argv: ['--base', 'main', '--declare', 'src/'] })
		const full = await gate({ cwd: root, argv: ['--full', '--declare', 'src/'] })

		function tddLine(output: string): string | undefined {
			return output.split('\n').find((line) => line.includes('  tdd  '))
		}
		const failure = 'FAIL  tdd  test code changed outside tdd red: src/add.test.ts'
		expect(tddLine(result.output)).toBe('ok    tdd  1 case(s) of the change: 1 red then green')
		expect(tddLine(base.output)).toBe(failure)
		expect(tddLine(full.output)).toBe(failure)
	})
})

describe('tdd and the production entry a package declares', { timeout: 240_000 }, () => {
	const GATED_ADD = [
		"import { PLUS } from './test/values.ts'",
		'export function add(left: number, right: number): number {',
		'\treturn PLUS ? left + right : 0',
		'}',
		'',
	].join('\n')

	const TEST_ENTRY_FILES = {
		'src/add.ts': GATED_ADD,
		'src/test/values.ts': 'export const PLUS = false\n',
		'src/test/fixtures/data.ts': 'export const DATA = 1\n',
		'src/test/tool.script.ts': 'export const TOOL = 1\n',
	}

	const DECLARED = { tdd: { production: ['src/test'] } }

	async function redAfterTestStation(dialecte?: Record<string, unknown>): Promise<string> {
		const root = createVitestPackage({ files: TEST_ENTRY_FILES, dialecte })
		writeFiles({ root, files: { 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		return root
	}

	for (const spelling of ['./src/test', 'src/test/'])
		it(`declared as "${spelling}" → behaves like "src/test": the production edit is accepted by green`, async () => {
			const root = await redAfterTestStation({ tdd: { production: [spelling] } })
			writeFileSync(join(root, 'src/test/values.ts'), 'export const PLUS = true\n')

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(caseLines(green.output)).toEqual([
				'green    src/add.test.ts::add > one plus two → three',
			])
		})

	it('declared → an edit under src/test after red is production: green accepts it and nothing is unfrozen; undeclared → the same edit is test code, refused', async () => {
		const declared = await redAfterTestStation(DECLARED)
		writeFileSync(join(declared, 'src/test/values.ts'), 'export const PLUS = true\n')
		const undeclared = await redAfterTestStation()
		writeFileSync(join(undeclared, 'src/test/values.ts'), 'export const PLUS = true\n')

		const green = await tdd({ cwd: declared, argv: ['green'] })
		const status = await tdd({ cwd: declared, argv: ['status', '--json'] })
		const refused = await tdd({ cwd: undeclared, argv: ['green'] })

		expect(green.exitCode).toBe(0)
		expect(caseLines(green.output)).toEqual([
			'green    src/add.test.ts::add > one plus two → three',
		])
		expect(JSON.parse(status.output)).toMatchObject({ unfrozen: [], cases: [{ status: 'green' }] })
		expect(refused.exitCode).toBe(1)
		expect(refused.output).toBe(
			'tdd green: test code changed since the last red run: src/test/values.ts - tests are frozen after red; go back to the test station',
		)
	})

	it('declared → the fixtures and *.script.ts of src/test stay test code: green refuses them, naming only them', async () => {
		const root = await redAfterTestStation(DECLARED)
		writeFiles({
			root,
			files: {
				'src/test/values.ts': 'export const PLUS = true\n',
				'src/test/fixtures/data.ts': 'export const DATA = 2\n',
				'src/test/tool.script.ts': 'export const TOOL = 2\n',
			},
		})

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green).toEqual({
			exitCode: 1,
			output:
				'tdd green: test code changed since the last red run: src/test/fixtures/data.ts, src/test/tool.script.ts - tests are frozen after red; go back to the test station',
		})
	})

	it('declared → a test file under the prefix stays test code: edited after red, green refuses that case', async () => {
		const root = createVitestPackage({ files: TEST_ENTRY_FILES, dialecte: DECLARED })
		const valuesTest = [
			"import { PLUS } from './values.ts'",
			"import { expect, it } from 'vitest'",
			"it('the plus flag is on', () => { expect(PLUS).toBe(true) })",
			'',
		].join('\n')
		writeFiles({ root, files: { 'src/test/values.test.ts': valuesTest } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({
			root,
			files: {
				'src/test/values.ts': 'export const PLUS = true\n',
				'src/test/values.test.ts': valuesTest.replace('toBe(true)', 'toBeTruthy()'),
			},
		})

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(caseLines(green.output)).toEqual([
			'refused  src/test/values.test.ts::the plus flag is on  tests are frozen after red; go back to the test station',
		])
	})
})

describe(
	'a test file edited after red: formatting is trivia, meaning is not',
	{ timeout: 240_000 },
	() => {
		const BASE_TEST = [
			"import { add } from './add.ts'",
			"import { describe, expect, it } from 'vitest'",
			'',
			'// the sum',
			"describe('add', () => {",
			"\tit('one plus two → three', async () => {",
			"\t\tconst label = 'a b'",
			'\t\tconst total = 3',
			'\t\texpect(await add(1, 2)).toBe(total)',
			"\t\texpect(label).toEqual('a b')",
			'\t})',
			'})',
			'',
		].join('\n')

		const CASE_LINE = 'add > one plus two → three'

		const FORMAT_ONLY: Record<string, (text: string) => string> = {
			whitespace: (text) => text.replaceAll('\t', '    ').replace('describe(', '\n\ndescribe('),
			'quote style': (text) => text.replaceAll("'", '"'),
			semicolons: (text) => text.replace(/^(\s*(import|const|expect).*)$/gm, '$1;'),
			'trailing commas': (text) => text.replace('add(1, 2)', 'add(\n1,\n2,\n)'),
			'line breaks': (text) => text.replace(').toBe(total)', ')\n\t\t\t.toBe(total)'),
			'import order (whole statements)': (text) =>
				text.replace(
					"import { add } from './add.ts'\nimport { describe, expect, it } from 'vitest'",
					"import { describe, expect, it } from 'vitest'\nimport { add } from './add.ts'",
				),
			'a comment added': (text) =>
				text.replace('const total = 3', '// three\n\t\tconst total = 3 /* inline */'),
			'a comment removed': (text) => text.replace('// the sum\n', ''),
			'a comment changed': (text) => text.replace('// the sum', '// the total of both'),
		}

		const SEMANTIC: Record<string, (text: string) => string> = {
			"a string's inner whitespace": (text) =>
				text.replace("const label = 'a b'", "const label = 'ab'"),
			'an apostrophe added inside a string': (text) =>
				text.replace("const label = 'a b'", 'const label = "a b\'"'),
			'two statements swapped inside a case': (text) =>
				text.replace(
					"\t\tconst label = 'a b'\n\t\tconst total = 3\n",
					"\t\tconst total = 3\n\t\tconst label = 'a b'\n",
				),
			'a removed await': (text) => text.replace('await add', 'add'),
			'toBe → toEqual': (text) => text.replace('.toBe(total)', '.toEqual(total)'),
			'a removed expect': (text) => text.replace("\t\texpect(label).toEqual('a b')\n", ''),
			'a changed number': (text) => text.replace('add(1, 2)', 'add(1, 3)'),
		}

		async function afterEdit(edit: (text: string) => string): Promise<{
			cases: string[]
			unfrozen: string[]
		}> {
			const root = createVitestPackage({})
			writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': BASE_TEST } })
			await tdd({ cwd: root, argv: ['red'] })
			const edited = edit(BASE_TEST)
			expect(edited).not.toBe(BASE_TEST)
			writeFileSync(join(root, 'src/add.test.ts'), edited)
			const status = await tdd({ cwd: root, argv: ['status', '--json'] })
			const state = JSON.parse(status.output) as {
				cases: { name: string; status: string }[]
				unfrozen: string[]
			}
			return {
				cases: state.cases.map((line) => `${line.status}  ${line.name}`),
				unfrozen: state.unfrozen,
			}
		}

		for (const [name, edit] of Object.entries(FORMAT_ONLY))
			it(`${name} → still red-receipted, nothing unfrozen`, async () => {
				const state = await afterEdit(edit)
				expect(state).toEqual({ cases: [`red  ${CASE_LINE}`], unfrozen: [] })
			})

		for (const [name, edit] of Object.entries(SEMANTIC))
			it(`${name} → test edited after red`, async () => {
				const state = await afterEdit(edit)
				expect(state).toEqual({
					cases: [`test edited after red  ${CASE_LINE}`],
					unfrozen: ['src/add.test.ts'],
				})
			})

		it('a reformatted file goes green after the code', async () => {
			const root = createVitestPackage({})
			writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': BASE_TEST } })
			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(
				join(root, 'src/add.test.ts'),
				FORMAT_ONLY['quote style'](FORMAT_ONLY.semicolons(BASE_TEST)),
			)
			writeFileSync(join(root, 'src/add.ts'), ADD)

			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(caseLines(green.output)).toEqual([
				'green    src/add.test.ts::add > one plus two → three',
			])
		})
	},
)

describe('a test file with a refused case', { timeout: 240_000 }, () => {
	it('one case refused (a missing export), another red → the red is recorded, the refusal too, the file frozen for the red case, no "not recorded"', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': ADD_STUB,
				'src/add.test.ts': [
					"import { multiply } from './add.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('add', () => {",
					"\tit('asserts', () => { expect([1, 2].length).toBe(3) })",
					"\tit('calls a missing export', () => { expect(multiply(1, 2)).toBe(2) })",
					'})',
					'',
				].join('\n'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(red.output).not.toContain('not recorded')
		expect(receiptLines(root)).toEqual([
			'red add > asserts',
			'refused add > calls a missing export',
		])
		expect(
			readLedger(root).entries.flatMap((entry) =>
				entry.kind === 'freeze' ? Object.keys(entry.files) : [],
			),
		).toEqual(['src/add.test.ts'])
	})

	it('one case refused (a missing export), another red, then the refused case accepted and red run again → the red case is kept (no re-red), the refused case accepted', async () => {
		const root = createVitestPackage({})
		const testFile = [
			"import { add, multiply } from './add.ts'",
			"import { describe, expect, it } from 'vitest'",
			"describe('add', () => {",
			"\tit('asserts', () => { expect(add(1, 2)).toBe(3) })",
			"\tit('calls a missing export', () => { expect(multiply(1, 2)).toBe(2) })",
			'})',
			'',
		].join('\n')
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': testFile } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({
			root,
			files: {
				'src/add.ts': `${ADD}export function multiply(left: number, right: number): number {\n\treturn left * right\n}\n`,
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{
							case: 'src/add.test.ts::add > calls a missing export',
							reason: 'pins existing behaviour',
						},
					],
				}),
			},
		})

		const again = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(again.output)).toEqual([
			expect.stringMatching(/^kept +src\/add\.test\.ts::add > asserts\b/),
			expect.stringMatching(/^accepted +src\/add\.test\.ts::add > calls a missing export\b/),
		])
	})

	it('green on that file → the recorded red goes green, the refused case stays refused, the gate fails on it', async () => {
		const root = createVitestPackage({ dialecte: GATE_CONFIG })
		writeFiles({
			root,
			files: {
				'src/add.ts': ADD_STUB,
				'src/add.test.ts': [
					"import { add, multiply } from './add.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('add', () => {",
					"\tit('asserts', () => { expect(add(1, 2)).toBe(3) })",
					"\tit('calls a missing export', () => { expect(multiply(1, 2)).toBe(2) })",
					'})',
					'',
				].join('\n'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)

		const green = await tdd({ cwd: root, argv: ['green'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(green.exitCode).toBe(1)
		expect(caseLines(green.output)).toEqual([
			'green    src/add.test.ts::add > asserts',
			'refused  src/add.test.ts::add > calls a missing export  no red receipt: the test station runs tdd red first',
		])
		expect(result.output.split('\n')[1]).toMatch(/^FAIL {2}tdd /)
	})
})

describe('a case revised at review', { timeout: 240_000 }, () => {
	const CASE = 'src/add.test.ts::add > one plus two → three'
	const REASON = 'the review asked for the zero case'
	const REVISED_TEST = ADD_TEST.replace(
		'expect(add(1, 2)).toBe(3)',
		'expect(add(1, 2)).toBe(3); expect(add(0, 0)).toBe(0)',
	)

	/** Red, implemented, green; then the test edited at review and the lot file declaring it. */
	async function editedAtReview(params: { revised: unknown }): Promise<string> {
		const root = createVitestPackage({ dialecte: GATE_CONFIG })
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				'src/add.test.ts': REVISED_TEST,
				'.dialecte/lot.json': JSON.stringify({ revised: params.revised }),
			},
		})
		return root
	}

	it('declared → red records it as revised with its reason; status, the gate step and its details list it', async () => {
		const root = await editedAtReview({ revised: [{ case: CASE, reason: REASON }] })

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([`revised  ${CASE}  ${REASON}`])
		expect(status.output).toBe(`revised  ${CASE}`)
		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 revised',
			`        revised  ${CASE}  ${REASON}`,
		])
	})

	it('an entry without a reason → refused by red and by the gate, naming the expected shape', async () => {
		const root = await editedAtReview({ revised: [{ case: CASE }] })

		const red = await tdd({ cwd: root, argv: ['red'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(red.exitCode).toBe(1)
		expect(red.output).toBe(
			'tdd red: .dialecte/lot.json: each "revised" entry must be { "case": "<file>::<name>", "reason": "<why>" }',
		)
		expect(result.output.split('\n')[1]).toBe(
			'FAIL  tdd  .dialecte/lot.json: each "revised" entry must be { "case": "<file>::<name>", "reason": "<why>" }',
		)
	})

	it('an entry in the lot file but no red run after the edit → the gate fails: the lot file alone never excuses an edit', async () => {
		const root = await editedAtReview({ revised: [{ case: CASE, reason: REASON }] })

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')[1]).toBe(
			'FAIL  tdd  test code changed outside tdd red: src/add.test.ts',
		)
	})

	it('after a revised red the file is frozen again: a second edit → test edited after red', async () => {
		const root = await editedAtReview({ revised: [{ case: CASE, reason: REASON }] })
		const red = await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(
			join(root, 'src/add.test.ts'),
			REVISED_TEST.replace('toBe(0)', 'toBe(0); expect(add(2, 2)).toBe(4)'),
		)

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.exitCode).toBe(0)
		expect(status.output).toBe(`test edited after red  ${CASE}`)
	})

	it('a revised case that fails after its edit → recorded as a red, re-proven like any red', async () => {
		const root = await editedAtReview({ revised: [{ case: CASE, reason: REASON }] })
		writeFileSync(join(root, 'src/add.test.ts'), REVISED_TEST.replace('toBe(0)', 'toBe(1)'))

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			expect.stringMatching(new RegExp(`^red {6}${CASE}  assertion: expected \\+?0 to be 1`)),
		])
		expect(receiptLines(root).at(-1)).toBe('red add > one plus two → three')
		expect(status.output).toBe(`red  ${CASE}`)
	})

	/** Red then green, the test never edited, the lot file holding the entries. */
	async function provenCase(params: { revised: unknown }): Promise<string> {
		const root = await editedAtReview({ revised: params.revised })
		writeFileSync(join(root, 'src/add.test.ts'), ADD_TEST)
		return root
	}

	it('an entry for a case that was not edited → a note "unused revised entry" under the gate step, still passing', async () => {
		const root = await provenCase({ revised: [{ case: CASE, reason: REASON }] })

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 red then green',
			expect.stringMatching(
				/^ {8}unused revised entry {2}src\/add\.test\.ts::add > one plus two → three/,
			),
		])
	})

	it('an entry naming no case of the change → the same note naming it (like accept), not a failure', async () => {
		const root = await provenCase({
			revised: [{ case: 'src/add.test.ts::add > nope', reason: 'a typo' }],
		})

		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n')[2]).toMatch(
			/^ {8}unused revised entry {2}src\/add\.test\.ts::add > nope/,
		)
	})
})

describe('what counts as trivia in a .ts test file', { timeout: 240_000 }, () => {
	const CASE_LINE = 'add > one plus two → three'

	/** A test file holding `head` lines before its describe, red at the stub, then `edit` applied. */
	function testWith(head: string[]): string {
		return [
			"import { add } from './add.ts'",
			"import { describe, expect, it } from 'vitest'",
			...head,
			"describe('add', () => {",
			"\tit('one plus two → three', () => {",
			'\t\texpect(add(1, 2)).toBe(3)',
			'\t})',
			'})',
			'',
		].join('\n')
	}

	async function afterEdit(params: {
		head: string[]
		edit: (text: string) => string
		files?: Record<string, string>
	}): Promise<{ cases: string[]; unfrozen: string[] }> {
		const root = createVitestPackage({})
		const base = testWith(params.head)
		writeFiles({
			root,
			files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': base, ...params.files },
		})
		await tdd({ cwd: root, argv: ['red'] })
		const edited = params.edit(base)
		expect(edited).not.toBe(base)
		writeFileSync(join(root, 'src/add.test.ts'), edited)
		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		const state = JSON.parse(status.output) as {
			cases: { name: string; status: string }[]
			unfrozen: string[]
		}
		return {
			cases: state.cases.map((line) => `${line.status}  ${line.name}`),
			unfrozen: state.unfrozen,
		}
	}

	const TRIVIA = { cases: [`red  ${CASE_LINE}`], unfrozen: [] }
	const EDITED = { cases: [`test edited after red  ${CASE_LINE}`], unfrozen: ['src/add.test.ts'] }

	const ROWS: Record<
		string,
		{
			head: string[]
			edit: (text: string) => string
			files?: Record<string, string>
			expected: typeof TRIVIA | typeof EDITED
		}
	> = {
		'a type assertion <string>b, a formatting change elsewhere → trivia (parsed as .ts, not TSX)': {
			head: ["const value = <string>'b'"],
			edit: (text) => text.replace("'b'", '"b"'),
			expected: TRIVIA,
		},
		'a generic arrow <T>(x: T) => x, a formatting change elsewhere → trivia': {
			head: ['const identity = <T>(x: T) => x', 'identity(1)'],
			edit: (text) => text.replace('identity(1)', 'identity(1);'),
			expected: TRIVIA,
		},
		'two value imports reordered → trivia': {
			head: [],
			edit: (text) =>
				text.replace(
					"import { add } from './add.ts'\nimport { describe, expect, it } from 'vitest'",
					"import { describe, expect, it } from 'vitest'\nimport { add } from './add.ts'",
				),
			expected: TRIVIA,
		},
		'a side-effect import moved across another import → test edited after red': {
			head: ["import './setup.ts'"],
			edit: (text) => `import './setup.ts'\n${text.replace("import './setup.ts'\n", '')}`,
			files: { 'src/setup.ts': 'export {}\n' },
			expected: EDITED,
		},
		'an environment docblock comment added → test edited after red': {
			head: [],
			edit: (text) => `// @vitest-${'environment'} node\n${text}`,
			expected: EDITED,
		},
		'a /* @vite-ignore */ comment added inside an import() → test edited after red': {
			head: ["const load = () => import('./add.ts')"],
			edit: (text) => text.replace("import('./add.ts')", "import(/* @vite-ignore */ './add.ts')"),
			expected: EDITED,
		},
		'an ordinary comment added → trivia': {
			head: ['const label = 1'],
			edit: (text) => text.replace('const label = 1', 'const label = 1 // one'),
			expected: TRIVIA,
		},
		'String.raw with a backslash-n against a real newline → test edited after red': {
			head: ['const text = String.raw`a\\nb`'],
			edit: (text) => text.replace('a\\nb', 'a\nb'),
			expected: EDITED,
		},
		'[] against [,] → test edited after red': {
			head: ['const holes = []'],
			edit: (text) => text.replace('[]', '[,]'),
			expected: EDITED,
		},
		'a trailing comma after an element → trivia': {
			head: ['const list = [1, 2]'],
			edit: (text) => text.replace('[1, 2]', '[1, 2,]'),
			expected: TRIVIA,
		},
	}

	for (const [name, row] of Object.entries(ROWS))
		it(name, async () => {
			const state = await afterEdit(row)
			expect(state).toEqual(row.expected)
		})
})

describe('tdd on what cannot be measured', { timeout: 240_000 }, () => {
	it('a ledger written by the previous format (version 2) → refused truthfully, not read as every file edited', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST } })
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			JSON.stringify({ version: 2, entries: [] }),
		)

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(status.exitCode).toBe(1)
		expect(status.output).toMatch(
			/^tdd status: the receipts in .*dialecte-tdd\.json are not of this cli \(version 3 expected\); move it aside to start again$/,
		)
	})

	it('a repository with no commit yet → a one-line refusal naming the cause, no stack trace', async () => {
		const root = temporaryFolder('dialecte-no-commit-')
		git({ root, args: ['init', '-q', '-b', 'main'] })
		writeFiles({
			root,
			files: { 'package.json': JSON.stringify({ name: 'demo', type: 'module' }), 'a.test.ts': '' },
		})

		const status = await tdd({ cwd: root, argv: ['status'] }).catch((error: Error) => ({
			exitCode: -1,
			output: `threw: ${error.message}`,
		}))

		expect(status.exitCode).toBeGreaterThan(0)
		expect(status.output.split('\n')).toHaveLength(1)
		expect(status.output).toMatch(/^tdd status: .*commit/i)
	})
})

describe('a green case after the next file is red', { timeout: 240_000 }, () => {
	async function statusLines(root: string): Promise<string[]> {
		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		return (JSON.parse(status.output) as { cases: { name: string; status: string }[] }).cases.map(
			(line) => `${line.status}  ${line.name}`,
		)
	}

	it('add green, then sub red → add stays green; its helper edited then add re-red → add is red again', async () => {
		const root = createVitestPackage({
			files: { 'test/expected.ts': 'export const EXPECTED = 3\n' },
		})
		writeFiles({
			root,
			files: {
				'src/add.ts': ADD_STUB,
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add } from './add.ts'\nimport { EXPECTED } from '../test/expected.ts'",
				).replace('toBe(3)', 'toBe(EXPECTED)'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })

		await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })
		const afterSub = await statusLines(root)
		writeFileSync(join(root, 'test/expected.ts'), 'export const EXPECTED = 4\n')
		await tdd({ cwd: root, argv: ['red', 'src/add.test.ts'] })
		const afterHelper = await statusLines(root)

		expect(afterSub).toEqual([
			'green  add > one plus two → three',
			'red  sub > three minus one → two',
		])
		expect(afterHelper[0]).toBe('red  add > one plus two → three')
	})

	it('add green, then `tdd red` with no arguments (add kept, sub red) → add stays green; its assertion edited, red then green → add goes through red again', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })

		await tdd({ cwd: root, argv: ['red'] })
		const afterSub = await statusLines(root)
		writeFileSync(join(root, 'src/add.test.ts'), ADD_TEST.replace('toBe(3)', 'toBe(5)'))
		await tdd({ cwd: root, argv: ['red'] })
		const afterEdit = await statusLines(root)
		writeFileSync(join(root, 'src/add.ts'), ADD.replace('left + right', 'left + right + 2'))
		await tdd({ cwd: root, argv: ['green'] })
		const afterFix = await statusLines(root)

		expect(afterSub).toEqual([
			'green  add > one plus two → three',
			'red  sub > three minus one → two',
		])
		expect(afterEdit[0]).toBe('red  add > one plus two → three')
		expect(afterFix[0]).toBe('green  add > one plus two → three')
	})
})

describe('a revised case freezes the test code it depends on', { timeout: 240_000 }, () => {
	const CASE = 'src/add.test.ts::add > one plus two → three'
	const REASON = 'the review asked for the zero case'
	const FIXTURE = 'test/fixtures/expected.ts'
	const FIXTURE_TEST = ADD_TEST.replace(
		"import { add } from './add.ts'",
		"import { add } from './add.ts'\nimport { EXPECTED } from '../test/fixtures/expected.ts'",
	).replace('toBe(3)', 'toBe(EXPECTED)')
	const REVISED_FIXTURE_TEST = FIXTURE_TEST.replace(
		'expect(add(1, 2)).toBe(EXPECTED)',
		'expect(add(1, 2)).toBe(EXPECTED); expect(add(0, 0)).toBe(0)',
	)

	it('a proven case and its fixture edited at review, declared revised → red records it revised and freezes both; the gate tdd step passes', async () => {
		const root = createVitestPackage({ dialecte: GATE_CONFIG })
		writeFiles({
			root,
			files: {
				'src/add.ts': ADD_STUB,
				'src/add.test.ts': FIXTURE_TEST,
				[FIXTURE]: 'export const EXPECTED = 3\n',
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				'src/add.test.ts': REVISED_FIXTURE_TEST,
				[FIXTURE]: 'export const EXPECTED = 1 + 2\n',
				'.dialecte/lot.json': JSON.stringify({ revised: [{ case: CASE, reason: REASON }] }),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([`revised  ${CASE}  ${REASON}`])
		expect(red.output.split('\n').at(-1)).toMatch(
			/; frozen: src\/add\.test\.ts, test\/fixtures\/expected\.ts$/,
		)
		expect(result.output.split('\n')[1]).toBe('ok    tdd  1 case(s) of the change: 1 revised')
	})

	it('a case of the base and its fixture edited, declared revised → red records it revised (no receipt needed) and freezes both; the gate tdd step passes', async () => {
		const root = createVitestPackage({
			dialecte: GATE_CONFIG,
			files: {
				'src/add.ts': ADD,
				'src/add.test.ts': FIXTURE_TEST,
				[FIXTURE]: 'export const EXPECTED = 3\n',
			},
		})
		writeFiles({
			root,
			files: {
				'src/add.test.ts': REVISED_FIXTURE_TEST,
				[FIXTURE]: 'export const EXPECTED = 1 + 2\n',
				'.dialecte/lot.json': JSON.stringify({ revised: [{ case: CASE, reason: REASON }] }),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([`revised  ${CASE}  ${REASON}`])
		expect(red.output.split('\n').at(-1)).toMatch(
			/; frozen: src\/add\.test\.ts, test\/fixtures\/expected\.ts$/,
		)
		expect(result.output.split('\n').slice(1, 3)).toEqual([
			'ok    tdd  1 case(s) of the change: 1 revised',
			`        revised  ${CASE}  ${REASON}`,
		])
	})

	it('a fixture edited for a file whose only case is accepted → not frozen, the gate fails naming it; a revised base case of another file is frozen; a glob accept entry is reported unused', async () => {
		const SUB_CASE = 'src/sub.test.ts::sub > three minus one → two'
		const root = createVitestPackage({
			dialecte: GATE_CONFIG,
			files: { 'src/add.ts': ADD, 'src/sub.ts': SUB, 'src/sub.test.ts': SUB_TEST },
		})
		writeFiles({
			root,
			files: {
				'src/add.test.ts': FIXTURE_TEST,
				[FIXTURE]: 'export const EXPECTED = 3\n',
				'src/sub.test.ts': SUB_TEST.replace(
					'expect(sub(3, 1)).toBe(2)',
					'expect(sub(3, 1)).toBe(2); expect(sub(2, 0)).toBe(2)',
				),
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{ case: CASE, reason: 'pins existing behaviour' },
						{ case: 'src/**/*.test.ts', reason: 'a glob is never accepted' },
					],
					revised: [{ case: SUB_CASE, reason: REASON }],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

		expect(caseLines(red.output)).toEqual([
			`accepted  ${CASE}  pins existing behaviour`,
			`revised  ${SUB_CASE}  ${REASON}`,
		])
		expect(red.output.split('\n').at(-1)).toMatch(
			/; frozen: src\/add\.test\.ts, src\/sub\.test\.ts$/,
		)
		expect(result.exitCode).toBe(1)
		expect(result.output.split('\n')[1]).toBe(
			'FAIL  tdd  test code changed outside tdd red: test/fixtures/expected.ts',
		)
		expect(result.output.split('\n')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^ *unused accept {2}src\/\*\*\/\*\.test\.ts {2}.*a glob is never accepted/,
				),
			]),
		)
	})
})

describe(
	'revised for a case of the base: only what the base provably held',
	{ timeout: 240_000 },
	() => {
		const REASON = 'a mechanical rename across the file'

		/** The base holds `add` and its test `base`; the lot rewrites the test as `now`, the lot file as `declaration`. */
		function baseEditedAs(params: {
			base: string
			now: string
			declaration: Record<string, unknown>
			files?: Record<string, string>
			baseFiles?: Record<string, string>
		}): string {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'src/add.ts': ADD, 'src/add.test.ts': params.base, ...params.baseFiles },
			})
			writeFiles({
				root,
				files: {
					'src/add.test.ts': params.now,
					'.dialecte/lot.json': JSON.stringify(params.declaration),
					...params.files,
				},
			})
			return root
		}

		const EDITED_CALL = ADD_TEST.replace(
			'expect(add(1, 2)).toBe(3)',
			'expect(add(1, 2)).toBe(3); expect(add(2, 1)).toBe(3)',
		)

		/** The add test with a second case, `zero plus zero → zero`, that the lot never touches. */
		function withZeroCase(text: string): string {
			return text.replace(
				'\n})',
				"\n\tit('zero plus zero → zero', () => { expect(add(0, 0)).toBe(0) })\n})",
			)
		}

		const UNTOUCHED = 'unchanged  src/add.test.ts::add > zero plus zero → zero'

		it('a file entry → the edited base case is revised with its reason, an untouched one stays unchanged; a new title in the same file is still refused; an accept entry naming the file accepts nothing', async () => {
			const root = baseEditedAs({
				base: withZeroCase(ADD_TEST),
				now: withZeroCase(EDITED_CALL).replace(
					'toBe(0) })\n})',
					"toBe(0) })\n\tit('two plus two → four', () => { expect(add(2, 2)).toBe(4) })\n})",
				),
				declaration: {
					revised: [{ case: 'src/add.test.ts', reason: REASON }],
					accept: [{ case: 'src/add.test.ts', reason: 'pins existing behaviour' }],
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				`revised  src/add.test.ts::add > one plus two → three  ${REASON}`,
				UNTOUCHED,
				expect.stringMatching(/^refused {2}src\/add\.test\.ts::add > two plus two → four {2}/),
			])
		})

		it('a glob entry → the edited base case is revised, an untouched one stays unchanged; a case of a new file the glob matches is still refused', async () => {
			const root = baseEditedAs({
				base: withZeroCase(ADD_TEST),
				now: withZeroCase(EDITED_CALL),
				declaration: { revised: [{ case: 'src/**/*.test.ts', reason: REASON }] },
				files: { 'src/sub.ts': SUB, 'src/sub.test.ts': SUB_TEST },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				`revised  src/add.test.ts::add > one plus two → three  ${REASON}`,
				UNTOUCHED,
				expect.stringMatching(/^refused {2}src\/sub\.test\.ts::sub > three minus one → two {2}/),
			])
		})

		it('a table whose call is edited and a row added → the row of the base is revised, the added row is refused', async () => {
			function tableTest(params: { rows: string[]; call: string }): string {
				return [
					"import { add } from './add.ts'",
					"import { describe, expect, it } from 'vitest'",
					'const SUMS: Record<string, [number, number, number]> = {',
					...params.rows,
					'}',
					"describe('add', () => {",
					'\tfor (const [name, [left, right, total]] of Object.entries(SUMS))',
					`\t\tit(name, () => { ${params.call} })`,
					'})',
					'',
				].join('\n')
			}
			const root = baseEditedAs({
				base: tableTest({
					rows: ["\t'one plus two': [1, 2, 3],"],
					call: 'expect(add(left, right)).toBe(total)',
				}),
				now: tableTest({
					rows: ["\t'one plus two': [1, 2, 3],", "\t'two plus two': [2, 2, 4],"],
					call: 'expect(add(left, right)).toBe(total); expect(add(right, left)).toBe(total)',
				}),
				declaration: { revised: [{ case: 'src/add.test.ts', reason: REASON }] },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual([
				`revised  src/add.test.ts::add > one plus two  ${REASON}`,
				expect.stringMatching(/^refused {2}src\/add\.test\.ts::add > two plus two {2}/),
			])
		})

		it('a glob entry over a base case whose describe is renamed (same it title) and call edited → refused: a title of its name is not in the base; an edited base case of another file is revised', async () => {
			const root = baseEditedAs({
				base: ADD_TEST,
				now: EDITED_CALL.replace("describe('add'", "describe('sum'"),
				declaration: { revised: [{ case: 'src/**/*.test.ts', reason: REASON }] },
				baseFiles: { 'src/sub.ts': SUB, 'src/sub.test.ts': SUB_TEST },
				files: {
					'src/sub.test.ts': SUB_TEST.replace(
						'expect(sub(3, 1)).toBe(2)',
						'expect(sub(3, 1)).toBe(2); expect(sub(2, 0)).toBe(2)',
					),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(/^refused {2}src\/add\.test\.ts::sum > one plus two → three {2}/),
				`revised  src/sub.test.ts::sub > three minus one → two  ${REASON}`,
			])
		})

		it('a title the file computes (a template), not written as a string at the base → refused: not provably a case of the base', async () => {
			function computedTitleTest(call: string): string {
				return [
					"import { add } from './add.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('add', () => {",
					`\tfor (const total of [3]) it(\`sums to \${total}\`, () => { ${call} })`,
					'})',
					'',
				].join('\n')
			}
			const root = baseEditedAs({
				base: computedTitleTest('expect(add(1, 2)).toBe(total)'),
				now: computedTitleTest('expect(add(1, 2)).toBe(total); expect(add(2, 1)).toBe(total)'),
				declaration: {
					revised: [{ case: 'src/add.test.ts::add > sums to 3', reason: REASON }],
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(1)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^refused {2}src\/add\.test\.ts::add > sums to 3 {2}.*not provably a case of the base: accept it or prove it red/,
				),
			])
		})

		it('a proven case revised by a file entry, a file entry over a file of red-then-green cases and a glob matching nothing → the gate lists the case with the reason and the other two as unused', async () => {
			const CASE = 'src/add.test.ts::add > one plus two → three'
			const root = createVitestPackage({ dialecte: GATE_CONFIG })
			writeFiles({
				root,
				files: {
					'src/add.ts': ADD_STUB,
					'src/add.test.ts': ADD_TEST,
					'src/sub.ts': SUB_STUB,
					'src/sub.test.ts': SUB_TEST,
				},
			})
			await tdd({ cwd: root, argv: ['red'] })
			writeFiles({ root, files: { 'src/add.ts': ADD, 'src/sub.ts': SUB } })
			await tdd({ cwd: root, argv: ['green'] })
			writeFiles({
				root,
				files: {
					'src/add.test.ts': EDITED_CALL,
					'.dialecte/lot.json': JSON.stringify({
						revised: [
							{ case: 'src/add.test.ts', reason: REASON },
							{ case: 'src/sub.test.ts', reason: 'only red there' },
							{ case: 'lib/**/*.test.ts', reason: 'nothing there' },
						],
					}),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

			expect(caseLines(red.output)).toEqual([
				`revised  ${CASE}  ${REASON}`,
				expect.stringMatching(/^kept {5}src\/sub\.test\.ts::sub > three minus one → two/),
			])
			expect(result.exitCode).toBe(0)
			expect(result.output.split('\n').slice(1, 5)).toEqual([
				'ok    tdd  2 case(s) of the change: 1 red then green, 1 revised',
				`        revised  ${CASE}  ${REASON}`,
				expect.stringMatching(
					/^ {8}unused revised entry {2}src\/sub\.test\.ts {2}.*only red there/,
				),
				expect.stringMatching(
					/^ {8}unused revised entry {2}lib\/\*\*\/\*\.test\.ts {2}.*nothing there/,
				),
			])
		})
	},
)

describe('a test call of the base gone, declared in the lot file', { timeout: 240_000 }, () => {
	const REASON = 'the zero case moved into a table'
	const BASE_TEST = [
		"import { add } from './add.ts'",
		"import { describe, expect, it } from 'vitest'",
		"const ZERO_TITLE = 'zero plus zero → zero'",
		"describe('add', () => {",
		"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		'\tit(ZERO_TITLE, () => { expect(add(0, 0)).toBe(0) })',
		"\tit('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
		'})',
		'',
	].join('\n')

	it('an untitled call gone in a file the entry matches → "gone" with the reason in status and the gate; a titled call gone and a deleted test file stay "deleted"; an entry matching nothing is unused', async () => {
		const root = createVitestPackage({
			dialecte: GATE_CONFIG,
			files: {
				'src/add.ts': ADD,
				'src/add.test.ts': BASE_TEST,
				'src/sub.ts': SUB,
				'src/sub.test.ts': SUB_TEST,
			},
		})
		writeFiles({
			root,
			files: {
				'src/add.test.ts': ADD_TEST,
				'.dialecte/lot.json': JSON.stringify({
					gone: [
						{ file: 'src/**/*.test.ts', reason: REASON },
						{ file: 'lib/**/*.test.ts', reason: 'nothing there' },
					],
				}),
			},
		})
		rmSync(join(root, 'src/sub.test.ts'))
		await tdd({ cwd: root, argv: ['red'] })

		const status = await tdd({ cwd: root, argv: ['status'] })
		const result = await gate({ cwd: root, argv: ['--declare', 'src/'] })

		const gone = `gone  src/add.test.ts  a test call of the base is gone (${REASON})`
		const titled = 'deleted  src/add.test.ts  the test "two plus two → four" of the base is gone'
		const deletedFile = 'deleted  src/sub.test.ts  the test file of the base is deleted'
		expect(
			status.output
				.split('\n')
				.filter((line) => /^(gone|deleted) /.test(line))
				.sort(),
		).toEqual([deletedFile, titled, gone].sort())
		expect(result.exitCode).toBe(0)
		const details = result.output
			.split('\n')
			.filter((line) => line.startsWith('        '))
			.map((line) => line.trim())
		expect(details.filter((line) => !line.startsWith('unused')).sort()).toEqual(
			[deletedFile, titled, gone].sort(),
		)
		expect(details.filter((line) => line.startsWith('unused'))).toEqual([
			expect.stringMatching(/^unused gone entry {2}lib\/\*\*\/\*\.test\.ts {2}.*nothing there/),
		])
	})
})

describe('what a file or glob revised entry never covers', { timeout: 240_000 }, () => {
	const REASON = 'a mechanical rename across the file'
	const GLOB_ENTRY = { revised: [{ case: 'src/**/*.test.ts', reason: REASON }] }

	it('a new it reusing a title of the base inside another describe of the base, under a glob entry → refused, not revised', async () => {
		const MATH_TEST = [
			"import { add } from './add.ts'",
			"import { sub } from './sub.ts'",
			"import { describe, expect, it } from 'vitest'",
			"describe('add', () => { it('returns zero', () => { expect(add(0, 0)).toBe(0) }) })",
			"describe('sub', () => { it('one', () => { expect(sub(1, 0)).toBe(1) }) })",
			'',
		].join('\n')
		const root = createVitestPackage({
			dialecte: GATE_CONFIG,
			files: { 'src/add.ts': ADD, 'src/sub.ts': SUB, 'src/math.test.ts': MATH_TEST },
		})
		writeFiles({
			root,
			files: {
				'src/math.test.ts': MATH_TEST.replace(
					"it('one', () => { expect(sub(1, 0)).toBe(1) })",
					"it('one', () => { expect(sub(1, 0)).toBe(1) }); it('returns zero', () => { expect(sub(0, 0)).toBe(0) })",
				),
				'.dialecte/lot.json': JSON.stringify(GLOB_ENTRY),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output).filter((line) => line.includes('::sub > returns zero'))).toEqual([
			expect.stringMatching(/^refused {2}src\/math\.test\.ts::sub > returns zero {2}/),
		])
	})

	/** A case made red in this lot, then implemented (it passes) but never green; then its file edited outside its call. */
	async function redThenFileEdited(declaration: Record<string, unknown>): Promise<string> {
		const root = createVitestPackage({ dialecte: GATE_CONFIG })
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({
			root,
			files: {
				'src/add.ts': ADD,
				'src/add.test.ts': ADD_TEST.replace(
					"import { describe, expect, it } from 'vitest'",
					"import { describe, expect, it } from 'vitest'\nconst UNUSED = 1",
				),
				'.dialecte/lot.json': JSON.stringify(declaration),
			},
		})
		return root
	}

	it('a red case never green, its file then edited, under a glob entry → refused as without the entry; an exact entry naming it → revised', async () => {
		const CASE = 'src/add.test.ts::add > one plus two → three'
		const globbed = await redThenFileEdited(GLOB_ENTRY)
		const exact = await redThenFileEdited({ revised: [{ case: CASE, reason: REASON }] })

		const globRed = await tdd({ cwd: globbed, argv: ['red'] })
		const exactRed = await tdd({ cwd: exact, argv: ['red'] })

		expect(caseLines(globRed.output)).toEqual([
			`refused  ${CASE}  test code changed since its red and it passes`,
		])
		expect(caseLines(exactRed.output)).toEqual([`revised  ${CASE}  ${REASON}`])
	})

	it('a glob entry over a file: a case made red again after its green keeps "red after green"; only the case recorded revised drops it', async () => {
		const TWO_CASES = ADD_TEST.replace(
			'\n})',
			"\n\tit('zero plus zero → zero', () => { expect(add(0, 0)).toBe(0) })\n})",
		)
		const root = createVitestPackage({ dialecte: GATE_CONFIG })
		writeFiles({ root, files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': TWO_CASES } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), ADD)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				'src/add.test.ts': TWO_CASES.replace(
					'expect(add(1, 2)).toBe(3)',
					'expect(add(1, 2)).toBe(3); expect(add(2, 1)).toBe(3)',
				).replace('expect(add(0, 0)).toBe(0)', 'expect(add(0, 0)).toBe(1)'),
				'.dialecte/lot.json': JSON.stringify(GLOB_ENTRY),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			`revised  src/add.test.ts::add > one plus two → three  ${REASON}`,
			expect.stringMatching(
				/^red {6}src\/add\.test\.ts::add > zero plus zero → zero {2}assertion: .*flags: red after green$/,
			),
		])
	})
})
