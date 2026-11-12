import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	PROOF_KIND_ACCEPT_REASON,
	PROOF_KIND_CASE_LABEL,
	PROOF_KIND_CASE_NAME,
	PROOF_KIND_REVISED_REASON,
	PROOF_KIND_TEST_FILE,
	PROOF_KIND_TEST_TEXT,
} from '../../test/proof-kind-fixture.constants.ts'
import {
	createProofKindPackage,
	provenLedgerEntries,
	readProofKindLedger,
	reportedLedgerEntries,
	staleAcceptanceLedgerEntries,
	writeProofKindLedger,
	writeProofKindLot,
} from '../../test/proof-kind-fixture.ts'
import { git, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { checkTddReceipts } from '../lib/tdd/check-tdd-receipts.ts'
import { hashTestCode, hashText } from '../lib/tdd/tdd-files.ts'
import { ROLLBACK_LINE } from '../lib/tdd/tdd.constants.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TddEntry, TddFreeze, TddLedger, TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-10-29T12:00:00.000Z')

/** `tdd` in the package, its receipts dated NOW. */
function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
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

/** The hash a receipt records for the add test file: the cli's own, of its tokens. */
function testHash(root: string): string {
	return hashTestCode({ root, file: 'src/add.test.ts' })
}

const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"

const IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'

const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('add', () => {",
	"\tit('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'})',
	'',
].join('\n')

/** A test file of `add` holding the given `it(...)` lines. */
function addTest(cases: string[]): string {
	return [
		"import { add } from './add.ts'",
		"import { describe, expect, it } from 'vitest'",
		"describe('add', () => {",
		...cases.map((line) => `\t${line}`),
		'})',
		'',
	].join('\n')
}

/** The table test of `mul` the base of a package holds, as in the house table style. */
function mulTest(rows: string[]): string {
	return [
		"import { mul } from './mul.ts'",
		"import { describe, expect, it } from 'vitest'",
		'const CASES = [',
		...rows.map((row) => `\t${row},`),
		']',
		"describe('mul', () => {",
		'\tfor (const row of CASES) it(row.title, () => { expect(mul(row.left, row.right)).toBe(row.expected) })',
		'})',
		'',
	].join('\n')
}

const MUL = 'export function mul(left: number, right: number): number {\n\treturn left * right\n}\n'

const MUL_ROWS = [
	"{ title: 'two by three', left: 2, right: 3, expected: 6 }",
	"{ title: 'zero', left: 0, right: 3, expected: 0 }",
]

describe('runTdd: red, green, status on a scratch package', { timeout: 240_000 }, () => {
	it('stub → red (receipt, freeze) → test edited after red refused at green → restored → implemented → green → status green', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			'red      src/add.test.ts::add > one plus two → three  not-implemented: not implemented: add',
		])
		expect(readLedger(root).entries).toEqual([
			{
				kind: 'red',
				file: 'src/add.test.ts',
				name: 'add > one plus two → three',
				project: '',
				testFileHash: testHash(root),
				caseHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				productionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
				message: 'not implemented: add',
				at: NOW.toISOString(),
			},
			{ kind: 'freeze', files: { 'src/add.test.ts': testHash(root) }, at: NOW.toISOString() },
		])

		writeFileSync(
			join(root, 'src/add.test.ts'),
			ADD_TEST.replace('toBe(3)', 'toBeTypeOf("number")'),
		)
		const edited = await tdd({ cwd: root, argv: ['green'] })

		expect(edited.exitCode).toBe(1)
		expect(edited.output).toContain(
			'refused  src/add.test.ts::add > one plus two → three  tests are frozen after red; go back to the test station',
		)

		writeFileSync(join(root, 'src/add.test.ts'), ADD_TEST)
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		const green = await tdd({ cwd: root, argv: ['green'] })
		const status = await tdd({ cwd: root, argv: ['status', '--json'] })

		expect(green.exitCode).toBe(0)
		expect(caseLines(green.output)).toEqual([
			'green    src/add.test.ts::add > one plus two → three',
		])
		expect(JSON.parse(status.output)).toMatchObject({
			cases: [
				{
					file: 'src/add.test.ts',
					name: 'add > one plus two → three',
					project: '',
					status: 'green',
					flags: [],
				},
			],
			unfrozen: [],
			findings: [],
		})
	})

	it('a test green before any code → refused at red: it proves nothing yet; the refusal is in the ledger, nothing frozen', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(red.output).toContain(
			'refused  src/add.test.ts::add > one plus two → three  it ran green: this test proves nothing yet',
		)
		expect(readLedger(root).entries.map((entry) => entry.kind)).toEqual(['refused'])
	})

	it('failures that are not a red, a matcher-less expect, a .only → refused with their kind; the red case of a file with refusals is recorded, its file frozen for it', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add.test.ts': [
					"import { add, multiply } from './add.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('add', () => {",
					"\tit('asserts', () => { expect([1, 2].length).toBe(3) })",
					"\tit('calls a missing export', () => { expect(multiply(1, 2)).toBe(2) })",
					"\tit('calls the stub before asserting', () => { const sum = add(1, 2); expect(sum).toBe(3) })",
					"\tit('has no matcher', () => { expect(add(1, 2)) })",
					"\tit('runs out of time', async () => { await new Promise((resolve) => setTimeout(resolve, 2000)) }, 50)",
					'})',
					'',
				].join('\n'),
				'src/at-import.test.ts': [
					"import { add } from './add.ts'",
					"import { expect, it } from 'vitest'",
					'const sum = add(1, 2)',
					"it('sums', () => { expect(sum).toBe(3) })",
					'',
				].join('\n'),
				'src/focused.test.ts': [
					"import { add } from './add.ts'",
					"import { expect, it } from 'vitest'",
					"it.only('sums', () => { expect(add(1, 2)).toBe(3) })",
					'',
				].join('\n'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output)).toEqual(
			expect.arrayContaining([
				'red      src/add.test.ts::add > asserts  assertion: expected 2 to be 3 // Object.is equality',
				'refused  src/add.test.ts::add > calls a missing export  missing-export (not a red): multiply is not a function',
				'refused  src/add.test.ts::add > calls the stub before asserting  not-implemented-outside-assertion (not a red): not implemented: add',
				'refused  src/add.test.ts::add > has no matcher  not-implemented-outside-assertion (not a red): not implemented: add',
				expect.stringMatching(
					/^refused {2}src\/add\.test\.ts::add > runs out of time {2}timeout \(not a red\): Test timed out in 50ms/,
				),
				expect.stringMatching(
					/^refused {2}src\/at-import\.test\.ts {2}cannot list its cases: not-implemented-at-import \(not a red\): not implemented: add/,
				),
				'refused  src/focused.test.ts  remove the focus markers first (.only, only: true), line 3: vitest skips the other cases',
			]),
		)
		expect(
			readLedger(root)
				.entries.filter((entry) => entry.kind === 'red')
				.map((entry) => (entry as TddReceipt).name),
		).toEqual(['add > asserts'])
		expect(
			readLedger(root).entries.flatMap((entry) =>
				entry.kind === 'freeze' ? Object.keys(entry.files) : [],
			),
		).toEqual(['src/add.test.ts'])
	})

	it('red runs every case of the changed files: a new failing case red, a base case unchanged; a named case of an unchanged file is not run', async () => {
		const root = createVitestPackage({
			files: { 'src/mul.ts': MUL, 'src/mul.test.ts': mulTest(MUL_ROWS) },
		})
		writeFileSync(
			join(root, 'src/mul.test.ts'),
			mulTest([...MUL_ROWS, "{ title: 'two by two', left: 2, right: 2, expected: 5 }"]),
		)

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			'unchanged  src/mul.test.ts::mul > two by three',
			'unchanged  src/mul.test.ts::mul > zero',
			'red      src/mul.test.ts::mul > two by two  assertion: expected 4 to be 5 // Object.is equality',
		])
		expect(receiptLines(root)).toEqual([
			'unchanged mul > two by three',
			'unchanged mul > zero',
			'red mul > two by two',
		])
	})

	it('a case weakened after its red, then a re-red of the file → refused: its test changed and it passes; the other case red again, recorded; the file frozen again for it, green passes it and refuses the weakened one', async () => {
		const root = createVitestPackage({})
		const both = addTest([
			"it('A one plus two', () => { expect(add(1, 2)).toBe(3) })",
			"it('B two plus two', () => { expect(add(2, 2)).toBe(4) })",
		])
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': both } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(
			join(root, 'src/add.test.ts'),
			both.replace('expect(add(1, 2)).toBe(3)', 'expect(1).toBe(1)'),
		)

		const reRed = await tdd({ cwd: root, argv: ['red', 'src/add.test.ts'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(reRed.exitCode).toBe(1)
		expect(caseLines(reRed.output)).toEqual([
			'refused  src/add.test.ts::add > A one plus two  its test changed since its receipt and it passes: this test proves nothing yet',
			'red      src/add.test.ts::add > B two plus two  not-implemented: not implemented: add',
		])
		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			'refused  src/add.test.ts::add > A one plus two  tests are frozen after red; go back to the test station',
		)
		expect(receiptLines(root)).toEqual([
			'red add > A one plus two',
			'red add > B two plus two',
			'refused add > A one plus two',
			'red add > B two plus two',
			'refused add > A one plus two',
			'green add > B two plus two',
		])
	})

	it('a test helper (test/expected.ts) edited after red → green refused naming it', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'test/expected.ts': 'export const EXPECTED = 3\n',
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add } from './add.ts'\nimport { EXPECTED } from '../test/expected.ts'",
				).replace('toBe(3)', 'toBe(EXPECTED)'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED.replace('left + right', 'left * right'))
		writeFileSync(join(root, 'test/expected.ts'), 'export const EXPECTED = 2\n')

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			'tdd green: test code changed since the last red run: test/expected.ts - tests are frozen after red; go back to the test station',
		)
		expect(receiptLines(root)).not.toContain('green add > one plus two → three')
	})

	it('a snapshot test: red on the stub, green never writes the snapshot', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB.replace("throw new Error('not implemented: add')", 'return 0'),
				'src/add.test.ts': ADD_TEST.replace('toBe(3)', 'toMatchSnapshot()'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/add.test.ts::add > one plus two → three  assertion: Snapshot `add > one plus two → three 1` mismatched',
		])
		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			'still fails: assertion: Snapshot `add > one plus two → three 1` mismatched',
		)
		expect(existsSync(join(root, 'src/__snapshots__'))).toBe(false)
	})

	it('green with nothing changed in production since red → refused', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': IMPLEMENTED,
				'src/flip.test.ts': [
					"import { expect, it } from 'vitest'",
					"it('reads the flag', () => { expect(process.env.DIALECTE_TDD_FLIP).toBe('on') })",
					'',
				].join('\n'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		process.env.DIALECTE_TDD_FLIP = 'on'

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			'refused  src/flip.test.ts::reads the flag  nothing in production changed since red',
		)
	})

	it('a red after a green on the same file, at a production rolled back → flagged in the receipt and in status', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(join(root, 'src/add.ts'), STUB)
		writeFileSync(
			join(root, 'src/add.test.ts'),
			ADD_TEST.replace(
				/\}\)\n$/,
				"\tit('two plus two → four', () => { expect(add(2, 2)).toBe(4) })\n})\n",
			),
		)

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/add.test.ts::add > one plus two → three  not-implemented: not implemented: add  flags: rollback',
			'red      src/add.test.ts::add > two plus two → four  not-implemented: not implemented: add  flags: rollback',
		])
		expect(status.output).toContain(
			'red  src/add.test.ts::add > one plus two → three  flags: rollback',
		)
	})

	it('status --flags → only the flagged cases, one line each with their flags', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(join(root, 'src/add.ts'), STUB)
		writeFileSync(
			join(root, 'src/add.test.ts'),
			ADD_TEST.replace(
				/\}\)\n$/,
				"\tit('two plus two → four', () => { expect(add(2, 2)).toBe(4) })\n})\n",
			),
		)
		await tdd({ cwd: root, argv: ['red'] })

		const flagged = await tdd({ cwd: root, argv: ['status', '--flags'] })

		expect(flagged.output.split('\n')).toEqual([
			'red  src/add.test.ts::add > one plus two → three  flags: rollback',
			'red  src/add.test.ts::add > two plus two → four  flags: rollback',
		])
	})

	it('a green case made red again by its own test, production as at its green → flagged red after green', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(join(root, 'src/add.test.ts'), ADD_TEST.replace('toBe(3)', 'toBe(4)'))

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/add.test.ts::add > one plus two → three  assertion: expected 3 to be 4 // Object.is equality  flags: red after green',
		])
	})

	it('a helper edited after a refused green, then a re-red where the case passes → refused, nothing frozen, green still refused', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'test/expected.ts': 'export const EXPECTED = 3\n',
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add } from './add.ts'\nimport { EXPECTED } from '../test/expected.ts'",
				).replace('toBe(3)', 'toBe(EXPECTED)'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED.replace('left + right', 'left * right'))
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(join(root, 'test/expected.ts'), 'export const EXPECTED = 2\n')

		const reRed = await tdd({ cwd: root, argv: ['red'] })
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(reRed.exitCode).toBe(1)
		expect(caseLines(reRed.output)).toEqual([
			'refused  src/add.test.ts::add > one plus two → three  test code changed since its red and it passes',
		])
		expect(reRed.output).toContain('nothing frozen')
		expect(green.exitCode).toBe(1)
	})

	it('a const of the test file edited after red, then a re-red where the case passes → refused', async () => {
		const root = createVitestPackage({})
		const withConst = ADD_TEST.replace(
			"describe('add'",
			"const EXPECTED = 3\ndescribe('add'",
		).replace('toBe(3)', 'toBe(EXPECTED)')
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': withConst } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED.replace('left + right', 'left * right'))
		writeFileSync(join(root, 'src/add.test.ts'), withConst.replace('EXPECTED = 3', 'EXPECTED = 2'))

		const reRed = await tdd({ cwd: root, argv: ['red'] })

		expect(reRed.exitCode).toBe(1)
		expect(caseLines(reRed.output)).toEqual([
			'refused  src/add.test.ts::add > one plus two → three  test code changed since its red and it passes',
		])
	})

	it('a case added to a green file (the next step): the green case kept and flagged, the new one red; both green after', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts':
					STUB +
					"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n",
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add, sub } from './add.ts'",
				),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(
			join(root, 'src/add.ts'),
			IMPLEMENTED +
				"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n",
		)
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(
			join(root, 'src/add.test.ts'),
			readFileSync(join(root, 'src/add.test.ts'), 'utf8').replace(
				/\}\)\n$/,
				"\tit('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })\n})\n",
			),
		)

		const red = await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(
			join(root, 'src/add.ts'),
			IMPLEMENTED +
				'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n',
		)
		const green = await tdd({ cwd: root, argv: ['green'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			'kept     src/add.test.ts::add > one plus two → three  proven before (green)  flags: test code changed around it',
			'red      src/add.test.ts::add > three minus one → two  not-implemented: not implemented: sub',
		])
		expect(green.exitCode).toBe(0)
		expect(status.output).toContain(
			'green  src/add.test.ts::add > one plus two → three  flags: test code changed around it',
		)
	})

	it('a helper no failing case of a red run imports → not frozen; one an imported failing file uses → frozen', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'test/expected.ts': "export { EXPECTED } from './values.ts'\n",
				'test/values.ts': 'export const EXPECTED = 3\n',
				'test/unused.ts': 'export const UNUSED = 1\n',
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add } from './add.ts'\nimport { EXPECTED } from '../test/expected.ts'",
				).replace('toBe(3)', 'toBe(EXPECTED)'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.output).toContain('frozen: src/add.test.ts, test/expected.ts, test/values.ts')
		expect(status.output).toContain('test code changed outside tdd red: test/unused.ts')
	})

	/** A package that imports its test helpers as `@/test`, mapped like core: tsconfig paths and a vite alias. */
	function aliasPackage(files: Record<string, string> = {}): string {
		return createVitestPackage({
			files: {
				'tsconfig.json': JSON.stringify({
					compilerOptions: {
						module: 'ESNext',
						moduleResolution: 'Bundler',
						paths: { '@/*': ['./src/*'] },
					},
				}),
				'vite.config.ts': [
					"import { fileURLToPath } from 'node:url'",
					"export default { resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }",
					'',
				].join('\n'),
				'src/test/index.ts': "export * from './values.ts'\n",
				'src/test/values.ts': 'export const THREE = 3\n',
				...files,
			},
		})
	}

	const ALIAS_TEST = ADD_TEST.replace(
		"import { add } from './add.ts'",
		"import { add } from './add.ts'\nimport { FOUR, THREE } from '@/test'",
	).replace(/\}\)\n$/, "\tit('two plus two → four', () => { expect(add(2, 2)).toBe(FOUR) })\n})\n")

	it('a shared helper imported as @/test changed by the test station: red freezes it, green and status pass', async () => {
		const root = aliasPackage({
			'src/add.ts': IMPLEMENTED.replace('left + right', 'left + right + (left === 2 ? 1 : 0)'),
			'src/add.test.ts': ADD_TEST,
		})
		writeFiles({
			root,
			files: {
				'src/test/values.ts': 'export const THREE = 3\nexport const FOUR = 4\n',
				'src/add.test.ts': ALIAS_TEST,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		const green = await tdd({ cwd: root, argv: ['green'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.output).toContain('frozen: src/add.test.ts, src/test/values.ts')
		expect(green.exitCode).toBe(0)
		expect(status.output).not.toContain('test code changed outside tdd red')
	})

	it('the @/test helper edited after a refused green, then a re-red → refused', async () => {
		const root = aliasPackage({ 'src/add.ts': STUB })
		writeFiles({
			root,
			files: {
				'src/test/values.ts': 'export const THREE = 3\nexport const FOUR = 4\n',
				'src/add.test.ts': ALIAS_TEST.replace('toBe(3)', 'toBe(THREE)'),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED.replace('left + right', 'left * right'))
		await tdd({ cwd: root, argv: ['green'] })
		writeFileSync(
			join(root, 'src/test/values.ts'),
			'export const THREE = 2\nexport const FOUR = 4\n',
		)

		const reRed = await tdd({ cwd: root, argv: ['red'] })

		expect(reRed.exitCode).toBe(1)
		expect(caseLines(reRed.output)).toContain(
			'refused  src/add.test.ts::add > one plus two → three  test code changed since its red and it passes',
		)
	})

	it('an alias vitest resolves but the cli cannot (no tsconfig paths, a computed vite alias) → the file refused, naming it', async () => {
		const root = createVitestPackage({
			files: {
				'vite.config.ts': [
					"const SOURCE = new URL('./src/', import.meta.url).pathname",
					'export default { resolve: { alias: [{ find: /^@\\//, replacement: SOURCE }] } }',
					'',
				].join('\n'),
				'src/test/index.ts': 'export const THREE = 3\n',
			},
		})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add.test.ts': ADD_TEST.replace(
					"import { add } from './add.ts'",
					"import { add } from './add.ts'\nimport { THREE } from '@/test'",
				).replace('toBe(3)', 'toBe(THREE)'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output)).toEqual([
			'refused  src/add.test.ts  cannot resolve the import "@/test": map it in a tsconfig "paths" or a vite resolve.alias',
		])
	})

	it('a case the lot accepts → accepted with its reason at red, its file frozen despite it passing', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': IMPLEMENTED,
				'src/add.test.ts': ADD_TEST,
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{
							case: 'src/add.test.ts::add > one plus two → three',
							reason: 'pins behaviour that already exists',
						},
					],
				}),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toEqual([
			'accepted  src/add.test.ts::add > one plus two → three  pins behaviour that already exists',
		])
		expect(status.output).toContain('accepted  src/add.test.ts::add > one plus two → three')
	})

	it('a case run by two projects is two cases: one failing project refuses its own green', async () => {
		const root = createVitestPackage({
			files: {
				'vitest.config.ts': [
					"import { defineConfig } from 'vitest/config'",
					'export default defineConfig({ test: { projects: [',
					"\t{ test: { name: 'one', include: ['src/**/*.test.ts'], env: { MODE: 'one' } } },",
					"\t{ test: { name: 'two', include: ['src/**/*.test.ts'], env: { MODE: 'two' } } },",
					'] } })',
					'',
				].join('\n'),
			},
		})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(
			join(root, 'src/add.ts'),
			"export function add(left: number, right: number): number {\n\treturn process.env.MODE === 'one' ? left + right : 0\n}\n",
		)

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(1)
		expect(caseLines(green.output)).toEqual([
			'green    src/add.test.ts::add > one plus two → three [one]',
			'refused  src/add.test.ts::add > one plus two → three [two]  still fails: assertion: expected +0 to be 3 // Object.is equality',
		])
	})

	it('green on a case without a red receipt → refused; status lists each case', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		const status = await tdd({ cwd: root, argv: ['status'] })
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(status.output).toContain('missing receipt  src/add.test.ts::add > one plus two → three')
		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			'refused  src/add.test.ts::add > one plus two → three  no red receipt: the test station runs tdd red first',
		)
	})

	it('a ledger that cannot be read → a refusal naming it, no stack trace', async () => {
		const root = createVitestPackage({})
		writeFileSync(join(root, '.git', 'dialecte-tdd.json'), '{ not json')

		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(status.exitCode).toBe(1)
		expect(status.output).toMatch(
			/^tdd status: the receipts in .*dialecte-tdd\.json cannot be read \(not JSON\); move it aside to start again$/,
		)
	})

	/** `add` implemented and `sub` a stub, as a base may hold them. */
	const ADD_AND_SUB_STUB =
		IMPLEMENTED +
		"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"

	const NO_FLAG_CASES: Record<
		string,
		{
			base: Record<string, string>
			firstRed: Record<string, string>
			secondRed: Record<string, string>
			/** The case lines of the second red. */
			lines: string[]
		}
	> = {
		'its test file edited again (a case C added)': {
			base: {
				'src/add.ts': ADD_AND_SUB_STUB,
				'src/add.test.ts': addTest([
					"it('A one plus two', () => { expect(add(1, 2)).toBe(3) })",
				]).replace("import { add } from './add.ts'", "import { add, sub } from './add.ts'"),
			},
			firstRed: {
				'src/add.test.ts': addTest([
					"it('A one plus two', () => { expect(add(1, 2)).toBe(3) })",
					"it('B three minus one', () => { expect(sub(3, 1)).toBe(2) })",
				]).replace("import { add } from './add.ts'", "import { add, sub } from './add.ts'"),
			},
			secondRed: {
				'src/add.test.ts': addTest([
					"it('A one plus two', () => { expect(add(1, 2)).toBe(3) })",
					"it('B three minus one', () => { expect(sub(3, 1)).toBe(2) })",
					"it('C five minus two', () => { expect(sub(5, 2)).toBe(3) })",
				]).replace("import { add } from './add.ts'", "import { add, sub } from './add.ts'"),
			},
			lines: [
				'kept     src/add.test.ts::add > A one plus two  proven before (unchanged)',
				'red      src/add.test.ts::add > B three minus one  not-implemented: not implemented: sub',
				'red      src/add.test.ts::add > C five minus two  not-implemented: not implemented: sub',
			],
		},
		'a helper its test file imports edited': {
			base: {
				'src/add.ts': ADD_AND_SUB_STUB,
				'test/expected.ts': 'export const THREE = 3\n',
				'src/add.test.ts': addTest([
					"it('A one plus two', () => { expect(add(1, 2)).toBe(THREE) })",
				]).replace(
					"import { add } from './add.ts'",
					"import { add, sub } from './add.ts'\nimport { THREE } from '../test/expected.ts'",
				),
			},
			firstRed: {
				'src/add.test.ts': addTest([
					"it('A one plus two', () => { expect(add(1, 2)).toBe(THREE) })",
					"it('B three minus one', () => { expect(sub(3, 1)).toBe(2) })",
				]).replace(
					"import { add } from './add.ts'",
					"import { add, sub } from './add.ts'\nimport { THREE } from '../test/expected.ts'",
				),
			},
			secondRed: { 'test/expected.ts': 'export const THREE = 3\nexport const TWO = 2\n' },
			lines: [
				'kept     src/add.test.ts::add > A one plus two  proven before (unchanged)',
				'red      src/add.test.ts::add > B three minus one  not-implemented: not implemented: sub',
			],
		},
	}

	for (const [name, row] of Object.entries(NO_FLAG_CASES))
		it(`a case of the base never proven green (only unchanged), ${name} at a second red → kept without a flag, no receipt for it, status unchanged, no flag listed`, async () => {
			const root = createVitestPackage({ files: row.base })
			writeFiles({ root, files: row.firstRed })
			await tdd({ cwd: root, argv: ['red'] })
			writeFiles({ root, files: row.secondRed })

			const red = await tdd({ cwd: root, argv: ['red'] })
			const status = await tdd({ cwd: root, argv: ['status'] })
			const flagged = await tdd({ cwd: root, argv: ['status', '--flags'] })

			expect(caseLines(red.output)).toEqual(row.lines)
			expect(receiptLines(root).filter((line) => line.endsWith('A one plus two'))).toEqual([
				'unchanged add > A one plus two',
			])
			expect(status.output).toContain('unchanged  src/add.test.ts::add > A one plus two')
			expect(flagged.output).toBe('tdd status: no case of the change carries a flag')
		})

	/** A second test file of `add`, holding one new case. */
	const ADD_MORE_TEST = addTest(["it('two plus two → four', () => { expect(add(2, 2)).toBe(4) })"])

	/** A test file of `sub`, holding one case. */
	const SUB_TEST = [
		"import { sub } from './sub.ts'",
		"import { describe, expect, it } from 'vitest'",
		"describe('sub', () => {",
		"\tit('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })",
		'})',
		'',
	].join('\n')

	const SUB_STUB =
		"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n"

	const SUB_IMPLEMENTED =
		'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'

	/** A production file an experiment adds, then removes. */
	const EXTRA = 'export const EXTRA = 1\n'

	const MUL_STUB =
		"export function mul(left: number, right: number): number {\n\tthrow new Error('not implemented: mul')\n}\n"

	/** red on the stub, then green on the implementation of `add`. */
	async function proveAdd(root: string): Promise<void> {
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ cwd: root, argv: ['green'] })
	}

	it('a new test file red at production put back to the stub after a green, a green case of sub kept beside → the new case flagged rollback, the case with its own rollback flagged once, the kept case without a flag nor a receipt, the line naming src/add.ts alone before the summary; the ledger keeps each production state', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add.test.ts': ADD_TEST,
				'src/sub.ts': SUB_STUB,
				'src/sub.test.ts': SUB_TEST,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/sub.ts': SUB_IMPLEMENTED } })
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add-more.test.ts': ADD_MORE_TEST } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output).sort()).toEqual([
			'kept     src/sub.test.ts::sub > three minus one → two  proven before (green)',
			'red      src/add-more.test.ts::add > two plus two → four  not-implemented: not implemented: add  flags: rollback',
			'red      src/add.test.ts::add > one plus two → three  not-implemented: not implemented: add  flags: rollback',
		])
		expect(red.output.split('\n').slice(-2)).toEqual([
			ROLLBACK_LINE.replace('{files}', 'src/add.ts'),
			expect.stringMatching(/^tdd red: 2 red, /),
		])
		expect(receiptLines(root).filter((line) => line.startsWith('kept '))).toEqual([])
		const receipts = readLedger(root).entries.filter(
			(entry): entry is TddReceipt => entry.kind !== 'freeze',
		)
		const atStub = receipts.find((receipt) => receipt.kind === 'red')?.productionHash ?? ''
		const atImplementation =
			receipts.find((receipt) => receipt.kind === 'green')?.productionHash ?? ''
		const movedBack = receipts.at(-1)?.productionHash ?? ''
		const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
		expect(readLedger(root).production).toEqual({
			[base]: {
				[atStub]: { 'src/add.ts': hashText(STUB), 'src/sub.ts': hashText(SUB_STUB) },
				[atImplementation]: {
					'src/add.ts': hashText(IMPLEMENTED),
					'src/sub.ts': hashText(SUB_IMPLEMENTED),
				},
				[movedBack]: { 'src/add.ts': hashText(STUB), 'src/sub.ts': hashText(SUB_IMPLEMENTED) },
			},
		})
	})

	it('a lot proven then committed (HEAD moved, the ledger kept), the next lot red at a new stub file → no flag, no rollback line', async () => {
		const root = createVitestPackage({})
		await proveAdd(root)
		git({ root, args: ['add', '-A'] })
		git({ root, args: ['commit', '-q', '-m', 'feat: add'] })
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub',
		])
		expect(red.output).not.toContain('rollback')
	})

	it('production put back after a green, a run whose only new case is refused (it passes there), then that case made to fail → red flagged rollback with the line; restored and green, a later red at the restored production → no flag', async () => {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add.test.ts': ADD_TEST,
				'src/sub.ts': SUB_STUB,
				'src/sub.test.ts': SUB_TEST,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/sub.ts': SUB_IMPLEMENTED } })
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add-more.test.ts': addTest([
					"it('two plus two → four', () => { expect(2 + 2).toBe(4) })",
				]),
			},
		})
		await tdd({ cwd: root, argv: ['red', 'src/add-more.test.ts'] })
		writeFiles({ root, files: { 'src/add-more.test.ts': ADD_MORE_TEST } })

		const rolledBack = await tdd({ cwd: root, argv: ['red', 'src/add-more.test.ts'] })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED } })
		await tdd({ cwd: root, argv: ['green', 'src/add-more.test.ts'] })
		writeFiles({
			root,
			files: {
				'src/add-wrong.test.ts': addTest([
					"it('one plus one → three', () => { expect(add(1, 1)).toBe(3) })",
				]),
			},
		})
		const restored = await tdd({ cwd: root, argv: ['red', 'src/add-wrong.test.ts'] })

		expect({
			rolledBack: caseLines(rolledBack.output),
			rolledBackEnd: rolledBack.output.split('\n').slice(-2),
			restored: caseLines(restored.output),
			restoredFlagged: restored.output.includes('rollback'),
		}).toEqual({
			rolledBack: [
				'red      src/add-more.test.ts::add > two plus two → four  not-implemented: not implemented: add  flags: rollback',
			],
			rolledBackEnd: [
				ROLLBACK_LINE.replace('{files}', 'src/add.ts'),
				expect.stringMatching(/^tdd red: 1 red, /),
			],
			restored: [
				'red      src/add-wrong.test.ts::add > one plus one → three  assertion: expected 2 to be 3 // Object.is equality',
			],
			restoredFlagged: false,
		})
	})

	it('an experiment undone and kept (a file added at a green, then removed): the next step red flagged rollback naming it, green; the step after red without a flag', async () => {
		const root = createVitestPackage({})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/extra.ts': EXTRA } })
		await tdd({ cwd: root, argv: ['green'] })
		unlinkSync(join(root, 'src/extra.ts'))
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })

		const undone = await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })
		writeFiles({ root, files: { 'src/sub.ts': SUB_IMPLEMENTED } })
		await tdd({ cwd: root, argv: ['green', 'src/sub.test.ts'] })
		writeFiles({
			root,
			files: { 'src/mul.ts': MUL_STUB, 'src/mul.test.ts': mulTest([MUL_ROWS[0]]) },
		})
		const next = await tdd({ cwd: root, argv: ['red', 'src/mul.test.ts'] })

		expect({
			undone: caseLines(undone.output),
			undoneEnd: undone.output.split('\n').slice(-2),
			next: caseLines(next.output),
			nextFlagged: next.output.includes('rollback'),
		}).toEqual({
			undone: [
				'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub  flags: rollback',
			],
			undoneEnd: [
				ROLLBACK_LINE.replace('{files}', 'src/extra.ts'),
				expect.stringMatching(/^tdd red: 1 red, /),
			],
			next: ['red      src/mul.test.ts::mul > two by three  not-implemented: not implemented: mul'],
			nextFlagged: false,
		})
	})

	it('a green taken at production put back (add.ts back to the stub, sub implemented) → the green flagged rollback with the line; the next red at that code without a flag', async () => {
		const root = createVitestPackage({})
		await proveAdd(root)
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })
		await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/sub.ts': SUB_IMPLEMENTED } })

		const green = await tdd({ cwd: root, argv: ['green', 'src/sub.test.ts'] })
		writeFiles({ root, files: { 'src/add-more.test.ts': ADD_MORE_TEST } })
		const next = await tdd({ cwd: root, argv: ['red', 'src/add-more.test.ts'] })

		expect({
			green: caseLines(green.output),
			greenEnd: green.output.split('\n').slice(-2),
			next: caseLines(next.output),
			nextFlagged: next.output.includes('rollback'),
		}).toEqual({
			green: ['green    src/sub.test.ts::sub > three minus one → two  flags: rollback'],
			greenEnd: [
				ROLLBACK_LINE.replace('{files}', 'src/add.ts'),
				expect.stringMatching(/^tdd green: 1 green, /),
			],
			next: [
				'red      src/add-more.test.ts::add > two plus two → four  not-implemented: not implemented: add',
			],
			nextFlagged: false,
		})
	})

	it('a new test file red at a production never seen (a new stub file, add.ts untouched) after a green → no flag, no rollback line', async () => {
		const root = createVitestPackage({})
		await proveAdd(root)
		writeFiles({
			root,
			files: {
				'src/sub.ts': SUB_STUB,
				'src/sub.test.ts': SUB_TEST,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })

		expect(caseLines(red.output)).toEqual([
			'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub',
		])
		expect(red.output).not.toContain('rollback')
	})

	it('a ledger written without production states (an older run), production put back to the stub → the new case red without a flag, no failure', async () => {
		const root = createVitestPackage({})
		await proveAdd(root)
		const older = { version: 3, entries: readLedger(root).entries }
		writeFileSync(join(root, '.git', 'dialecte-tdd.json'), `${JSON.stringify(older, null, '\t')}\n`)
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add-more.test.ts': ADD_MORE_TEST } })

		const red = await tdd({ cwd: root, argv: ['red', 'src/add-more.test.ts'] })

		expect({ exitCode: red.exitCode, cases: caseLines(red.output) }).toEqual({
			exitCode: 0,
			cases: [
				'red      src/add-more.test.ts::add > two plus two → four  not-implemented: not implemented: add',
			],
		})
		expect(red.output).not.toContain('rollback')
	})

	/** A helper the green of `add` adds, the refactor after it drops. */
	const HELPER =
		'export function plus(left: number, right: number): number {\n\treturn left + right\n}\n'

	/** `add` through the helper. */
	const HELPED = `import { plus } from './helper.ts'\nexport function add(left: number, right: number): number {\n\treturn plus(left, right)\n}\n`

	/** A production file of the base the green of `add` edits, the refactor after it puts back. */
	const FORMAT = "export const SEPARATOR = ', '\n"

	/** red of `add` on the stub, then green with `add` through a new `src/helper.ts`. */
	async function proveAddWithHelper(root: string): Promise<void> {
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({ root, files: { 'src/add.ts': HELPED, 'src/helper.ts': HELPER } })
		await tdd({ cwd: root, argv: ['green'] })
	}

	it('a refactor after a green dropping the file the green added (src/helper.ts inlined), tdd green → green without a flag, no rollback line, no flag in tdd status', async () => {
		const root = createVitestPackage({})
		await proveAddWithHelper(root)
		unlinkSync(join(root, 'src/helper.ts'))
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED } })

		const green = await tdd({ cwd: root, argv: ['green'] })
		const flagged = await tdd({ cwd: root, argv: ['status', '--flags'] })

		expect({
			exitCode: green.exitCode,
			cases: caseLines(green.output),
			rollback: green.output.includes('rollback'),
			flagged: flagged.output,
		}).toEqual({
			exitCode: 0,
			cases: ['green    src/add.test.ts::add > one plus two → three'],
			rollback: false,
			flagged: 'tdd status: no case of the change carries a flag',
		})
	})

	it('a refactor after a green putting a file of the base back to its content at the base, tdd green → green without a flag, no rollback line', async () => {
		const root = createVitestPackage({ files: { 'src/format.ts': FORMAT } })
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({
			root,
			files: { 'src/add.ts': IMPLEMENTED, 'src/format.ts': `${FORMAT}export const PLUS = '+'\n` },
		})
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({ root, files: { 'src/format.ts': FORMAT } })

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect({
			exitCode: green.exitCode,
			cases: caseLines(green.output),
			rollback: green.output.includes('rollback'),
		}).toEqual({
			exitCode: 0,
			cases: ['green    src/add.test.ts::add > one plus two → three'],
			rollback: false,
		})
	})

	it('a green at code put back (src/helper.ts dropped) proving a case for the first time → flagged rollback, the line naming src/helper.ts before the summary', async () => {
		const root = createVitestPackage({})
		await proveAddWithHelper(root)
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })
		await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })
		unlinkSync(join(root, 'src/helper.ts'))
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED, 'src/sub.ts': SUB_IMPLEMENTED } })

		const green = await tdd({ cwd: root, argv: ['green', 'src/sub.test.ts'] })

		expect({
			cases: caseLines(green.output),
			end: green.output.split('\n').slice(-2),
		}).toEqual({
			cases: ['green    src/sub.test.ts::sub > three minus one → two  flags: rollback'],
			end: [
				ROLLBACK_LINE.replace('{files}', 'src/helper.ts'),
				expect.stringMatching(/^tdd green: 1 green, /),
			],
		})
	})

	it('a red at code put back after a green (src/helper.ts dropped) → flagged rollback, the line naming src/helper.ts before the summary', async () => {
		const root = createVitestPackage({})
		await proveAddWithHelper(root)
		unlinkSync(join(root, 'src/helper.ts'))
		writeFiles({
			root,
			files: { 'src/add.ts': IMPLEMENTED, 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST },
		})

		const red = await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })

		expect({
			cases: caseLines(red.output),
			end: red.output.split('\n').slice(-2),
		}).toEqual({
			cases: [
				'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub  flags: rollback',
			],
			end: [
				ROLLBACK_LINE.replace('{files}', 'src/helper.ts'),
				expect.stringMatching(/^tdd red: 1 red, /),
			],
		})
	})

	it('green A with src/helper.ts, a refactor dropping it green A again (no flag), red B there (no flag), then src/helper.ts back at its content before the refactor and green B → B flagged rollback, the line naming src/helper.ts', async () => {
		const root = createVitestPackage({})
		await proveAddWithHelper(root)
		unlinkSync(join(root, 'src/helper.ts'))
		writeFiles({ root, files: { 'src/add.ts': IMPLEMENTED } })
		const refactored = await tdd({ cwd: root, argv: ['green', 'src/add.test.ts'] })
		writeFiles({ root, files: { 'src/sub.ts': SUB_STUB, 'src/sub.test.ts': SUB_TEST } })
		const red = await tdd({ cwd: root, argv: ['red', 'src/sub.test.ts'] })
		writeFiles({ root, files: { 'src/helper.ts': HELPER, 'src/sub.ts': SUB_IMPLEMENTED } })

		const green = await tdd({ cwd: root, argv: ['green', 'src/sub.test.ts'] })

		expect({
			refactored: caseLines(refactored.output),
			refactoredFlagged: refactored.output.includes('rollback'),
			red: caseLines(red.output),
			redFlagged: red.output.includes('rollback'),
			green: caseLines(green.output),
			greenEnd: green.output.split('\n').slice(-2),
		}).toEqual({
			refactored: ['green    src/add.test.ts::add > one plus two → three'],
			refactoredFlagged: false,
			red: [
				'red      src/sub.test.ts::sub > three minus one → two  not-implemented: not implemented: sub',
			],
			redFlagged: false,
			green: ['green    src/sub.test.ts::sub > three minus one → two  flags: rollback'],
			greenEnd: [
				ROLLBACK_LINE.replace('{files}', 'src/helper.ts'),
				expect.stringMatching(/^tdd green: 1 green, /),
			],
		})
	})

	it('a package whose tests run in a browser, the old machine lock file held by a live process, --no-wait → red and status run, its vitest names no holder', async () => {
		const cache = temporaryFolder('dialecte-tdd-cache-')
		writeFileSync(
			join(cache, 'heavy-run.lock'),
			JSON.stringify({
				pid: process.ppid,
				command: 'elsewhere',
				startedAt: '2026-10-29T10:00:00.000Z',
			}),
		)
		vi.stubEnv('DIALECTE_CACHE_DIR', cache)
		// a run under an older cli that still names a holder must not decide this case
		vi.stubEnv('DIALECTE_MACHINE_LOCK_HOLDER', undefined)
		const root = createVitestPackage({
			devDependencies: { '@vitest/browser-playwright': '^4.1.10' },
		})
		const holderFile = join(root, 'holder.txt')
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				'src/add.test.ts': ADD_TEST,
				'src/holder.test.ts': `import { writeFileSync } from 'node:fs'\nimport { expect, it } from 'vitest'\n\nit('records the holder', () => {\n\twriteFileSync(${JSON.stringify(holderFile)}, process.env.DIALECTE_MACHINE_LOCK_HOLDER ?? '')\n\texpect(1).toBe(2)\n})\n`,
			},
		})

		const red = await tdd({ cwd: root, argv: ['red', '--no-wait'] })
		const status = await tdd({ cwd: root, argv: ['status', '--no-wait'] })

		expect(red.exitCode).toBe(0)
		expect(readLedger(root).entries).toContainEqual(expect.objectContaining({ kind: 'red' }))
		// its vitest runs as the holder of no lock
		expect(existsSync(holderFile) ? readFileSync(holderFile, 'utf8') : undefined).toBe('')
		expect(status.output).not.toContain('machine lock')
	})
})

afterEach(function forgetTheFlag() {
	delete process.env.DIALECTE_TDD_FLIP
	vi.unstubAllEnvs()
})

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

/** The cli run in `cwd` as a process whose output is a pipe, `$COLUMNS` set to `columns`. */
function runCli(params: { argv: string[]; cwd: string; columns: number }): {
	exitCode: number | null
	lines: string[]
} {
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		cwd: params.cwd,
		encoding: 'utf8',
		env: { ...process.env, COLUMNS: String(params.columns) },
	})
	return {
		exitCode: result.status,
		lines: `${result.stdout}${result.stderr}`.trimEnd().split('\n'),
	}
}

describe('tdd status --legend', { timeout: 60_000 }, () => {
	it('tdd status --legend in a folder holding no package → exit 0, the tdd terms of the hand-over legend, line for line (from exempt to the noise flag)', () => {
		const cwd = temporaryFolder('dialecte-tdd-legend-')

		const legend = runCli({ argv: ['tdd', 'status', '--legend'], cwd, columns: 300 })
		const handover = runCli({ argv: ['handover', '--legend'], cwd, columns: 300 })

		const first = handover.lines.findIndex((line) => line.startsWith('exempt  '))
		const last = handover.lines.findIndex((line) =>
			line.startsWith('helper code changed near unchanged cases (noise)  '),
		)
		expect({
			exitCodes: [legend.exitCode, handover.exitCode],
			first: first >= 0,
			terms: last - first,
		}).toEqual({
			exitCodes: [0, 0],
			first: true,
			terms: 26,
		})
		expect(legend.lines).toEqual(handover.lines.slice(first, last + 2))
	})
})

describe('a `revised` entry naming a test helper', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	const HELPER = 'test/expected.ts'
	const REASON = 'the helper gained a constant at review'
	const CASE = 'src/add.test.ts::add > one plus two → three'
	const HELPER_TEXT = 'export const EXPECTED = 3\n'
	const EDITED_HELPER_TEXT = `${HELPER_TEXT}export const SPARE = 4\n`
	const HELPER_TEST = ADD_TEST.replace(
		"import { add } from './add.ts'",
		"import { add } from './add.ts'\nimport { EXPECTED } from '../test/expected.ts'",
	).replace('toBe(3)', 'toBe(EXPECTED)')

	/** The freeze entries of the ledger, oldest first. */
	function freezes(root: string): TddFreeze[] {
		return readLedger(root).entries.filter((entry): entry is TddFreeze => entry.kind === 'freeze')
	}

	/** The hashes the ledger froze `file` at, oldest first. */
	function frozenHashes(params: { root: string; file: string }): string[] {
		return freezes(params.root).flatMap((freeze) => {
			const hash = freeze.files[params.file]
			return hash === undefined ? [] : [hash]
		})
	}

	/** The lot file naming `entries` as `revised`. */
	function lotFile(entries: unknown): Record<string, string> {
		return { '.dialecte/lot.json': JSON.stringify({ revised: entries }) }
	}

	/**
	 * A package whose `add` test reads `EXPECTED` from the helper: red at the stub (the helper frozen),
	 * the production implemented and `tdd green`; then the helper edited (a constant the production still
	 * satisfies) and the lot file written when given. With `green: false` the green run is left out: the
	 * case stays a red waiting for its green.
	 */
	async function helperEdited(
		params: { lot?: unknown; green?: boolean; files?: Record<string, string> } = {},
	): Promise<string> {
		const root = createVitestPackage({})
		writeFiles({
			root,
			files: {
				'src/add.ts': STUB,
				[HELPER]: HELPER_TEXT,
				'src/add.test.ts': HELPER_TEST,
				...params.files,
			},
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		if (params.green !== false) await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				[HELPER]: EDITED_HELPER_TEXT,
				...(params.lot !== undefined && lotFile(params.lot)),
			},
		})
		return root
	}

	it('every dependent case green, an entry naming the helper → red freezes it at its new hash, prints `revised  <helper>  <reason>`, counts it', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output)).toContain(`revised  ${HELPER}  ${REASON}`)
		expect(red.output).toMatch(/^tdd red: .*, 1 revised, 0 refused; frozen: /m)
		expect(red.output.split('\n').find((line) => line.startsWith('tdd red:'))).toContain(HELPER)
		expect(freezes(root).at(-1)).toEqual({
			kind: 'freeze',
			files: {
				'src/add.test.ts': hashTestCode({ root, file: 'src/add.test.ts' }),
				[HELPER]: hashTestCode({ root, file: HELPER }),
			},
			revised: [HELPER],
			at: NOW.toISOString(),
		})
	})

	it('the same, then tdd green → exit 0, the dependent case green again against the new helper', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })
		await tdd({ cwd: root, argv: ['red'] })

		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(green.exitCode).toBe(0)
		expect(caseLines(green.output)).toEqual([`green    ${CASE}`])
	})

	it('the same, then the gate step and status → passed, details `revised  <helper>  <reason>`, no unused entry, no unfrozen helper', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })
		await tdd({ cwd: root, argv: ['red'] })
		const beforeGreen = await tdd({ cwd: root, argv: ['status'] })
		await tdd({ cwd: root, argv: ['green'] })

		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })
		const status = await tdd({ cwd: root, argv: ['status'] })

		expect(
			beforeGreen.output
				.split('\n')
				.some((line) => line === `red  ${CASE}` || line.startsWith(`red  ${CASE}  `)),
		).toBe(true)
		expect(beforeGreen.output).not.toContain(`green  ${CASE}`)
		expect(check.status).toBe('passed')
		expect(check.details).toContain(`revised  ${HELPER}  ${REASON}`)
		expect(check.details?.filter((line) => line.startsWith('unused revised entry'))).toEqual([])
		expect(status.output).not.toContain('test code changed outside tdd red')
	})

	it('a glob over files without `::` (test/*.ts) → names every helper it matches, one `revised` line each, both frozen', async () => {
		const root = await helperEdited({
			lot: [{ case: 'test/*.ts', reason: REASON }],
			files: {
				'test/other.ts': 'export const OTHER = 1\n',
				'src/add.test.ts': HELPER_TEST.replace(
					"import { EXPECTED } from '../test/expected.ts'",
					"import { EXPECTED } from '../test/expected.ts'\nimport { OTHER } from '../test/other.ts'\nvoid OTHER",
				),
			},
		})
		writeFiles({
			root,
			files: { 'test/other.ts': 'export const OTHER = 1\nexport const MORE = 2\n' },
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output).filter((line) => line.startsWith('revised'))).toEqual([
			`revised  ${HELPER}  ${REASON}`,
			`revised  test/other.ts  ${REASON}`,
		])
		expect(freezes(root).at(-1)?.revised).toEqual([HELPER, 'test/other.ts'])
	})

	it('a `<file>::<name>` entry never names a helper → the helper is not frozen, green refused as without an entry', async () => {
		const root = await helperEdited({ lot: [{ case: `${HELPER}::EXPECTED`, reason: REASON }] })

		const red = await tdd({ cwd: root, argv: ['red'] })
		const green = await tdd({ cwd: root, argv: ['green'] })

		expect(red.output).not.toContain(`revised  ${HELPER}`)
		expect(frozenHashes({ root, file: HELPER })).not.toContain(hashTestCode({ root, file: HELPER }))
		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			`tdd green: test code changed since the last red run: ${HELPER} - tests are frozen after red; go back to the test station`,
		)
	})

	it('no entry for the helper (guard) → red does not freeze it, green and the gate refuse naming it', async () => {
		const root = await helperEdited()

		const red = await tdd({ cwd: root, argv: ['red'] })
		const green = await tdd({ cwd: root, argv: ['green'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(frozenHashes({ root, file: HELPER })).not.toContain(hashTestCode({ root, file: HELPER }))
		expect(red.output).not.toContain(`revised  ${HELPER}`)
		expect(green.exitCode).toBe(1)
		expect(green.output).toContain(
			`tdd green: test code changed since the last red run: ${HELPER} - tests are frozen after red; go back to the test station`,
		)
		expect(check).toMatchObject({
			status: 'failed',
			reason: `test code changed outside tdd red: ${HELPER}`,
		})
	})

	it('an entry, but a dependent case is a red still waiting for its green (guard) → that case refused, its file and the helper not frozen', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }], green: false })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(caseLines(red.output)).toEqual([
			`refused  ${CASE}  test code changed since its red and it passes`,
		])
		expect(frozenHashes({ root, file: HELPER })).not.toContain(hashTestCode({ root, file: HELPER }))
		expect(freezes(root)).toHaveLength(1)
	})

	it('an entry, but a test file depending on the helper is refused in the run (guard) → the helper is not frozen', async () => {
		const root = await helperEdited({
			lot: [{ case: HELPER, reason: REASON }],
			files: {
				'src/sub.test.ts': [
					"import { add } from './add.ts'",
					"import { EXPECTED } from '../test/expected.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('sub', () => {",
					"\tit('two plus one → three', () => { expect(add(2, 1)).toBe(EXPECTED) })",
					'})',
					'',
				].join('\n'),
			},
		})
		writeFiles({
			root,
			files: {
				'src/sub.test.ts': readFileSync(join(root, 'src/sub.test.ts'), 'utf8').replace(
					"\tit('two",
					"\tit.only('two",
				),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(1)
		expect(frozenHashes({ root, file: HELPER })).not.toContain(hashTestCode({ root, file: HELPER }))
		expect(red.output).not.toContain(`revised  ${HELPER}`)
	})

	it('an entry naming a helper no changed test file depends on → the entry freezes it, the revised line printed', async () => {
		const root = await helperEdited({
			lot: [{ case: 'test/unused.ts', reason: REASON }],
			files: { 'test/unused.ts': 'export const UNUSED = 1\n' },
		})
		await tdd({ cwd: root, argv: ['red'] })
		writeFiles({ root, files: { 'test/unused.ts': 'export const UNUSED = 2\n' } })

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(caseLines(red.output)).toContain(`revised  test/unused.ts  ${REASON}`)
		expect(frozenHashes({ root, file: 'test/unused.ts' })).toContain(
			hashTestCode({ root, file: 'test/unused.ts' }),
		)
	})

	it('an entry whose freeze was superseded by a later freeze of the helper at another hash (guard) → the gate keeps `unused revised entry  <helper>  ...`', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })
		const ledgerPath = join(root, '.git', 'dialecte-tdd.json')
		const ledger = readLedger(root)
		ledger.entries.push(
			{
				kind: 'freeze',
				files: { [HELPER]: hashText('an earlier state of the helper') },
				revised: [HELPER],
				at: NOW.toISOString(),
			},
			{
				kind: 'freeze',
				files: { [HELPER]: hashTestCode({ root, file: HELPER }) },
				at: NOW.toISOString(),
			},
		)
		writeFileSync(ledgerPath, JSON.stringify(ledger))

		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect([...(check.details ?? []), ...(check.lines ?? [])]).toContain(
			`unused revised entry  ${HELPER}  no case of the change stands revised by a red run (${REASON})`,
		)
	})

	it('an entry for a helper unchanged since its freeze (guard) → the gate details keep `unused revised entry  <helper>  ...`', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })
		writeFiles({ root, files: { [HELPER]: HELPER_TEXT } })

		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(check.status).toBe('passed')
		expect(check.details).toContain(
			`unused revised entry  ${HELPER}  no case of the change stands revised by a red run (${REASON})`,
		)
	})

	it('a targeted red, a changed test file outside the run depends on the helper with a red awaiting its green → the entry does not freeze it, a line names that file', async () => {
		const root = await helperEdited({
			lot: [{ case: HELPER, reason: REASON }],
			files: {
				'src/sub.ts':
					"export function sub(left: number, right: number): number {\n\tthrow new Error('not implemented: sub')\n}\n",
				'src/sub.test.ts': [
					"import { sub } from './sub.ts'",
					"import { EXPECTED } from '../test/expected.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('sub', () => {",
					"\tit('five minus two → three', () => { expect(sub(5, 2)).toBe(EXPECTED) })",
					'})',
					'',
				].join('\n'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red', 'src/add.test.ts'] })

		expect(red.output).not.toContain(`revised  ${HELPER}`)
		expect(frozenHashes({ root, file: HELPER })).not.toContain(hashTestCode({ root, file: HELPER }))
		expect(red.output.split('\n')).toContain(
			`unfrozen  ${HELPER}  a changed test file outside this run depends on it: src/sub.test.ts`,
		)
	})

	it('a second red at the same helper hash (guard) → no second `revised` line, one freeze lists the helper revised', async () => {
		const root = await helperEdited({ lot: [{ case: HELPER, reason: REASON }] })
		await tdd({ cwd: root, argv: ['red'] })

		const again = await tdd({ cwd: root, argv: ['red'] })

		expect(again.output).not.toContain(`revised  ${HELPER}`)
		expect(freezes(root).filter((freeze) => freeze.revised !== undefined)).toHaveLength(1)
	})

	it('a test file under test/ the helper glob matches (guard) → only the helper is a revised helper, the test file is no helper', async () => {
		const root = await helperEdited({
			lot: [{ case: 'test/*.ts', reason: REASON }],
			files: {
				'test/extra.test.ts': [
					"import { add } from '../src/add.ts'",
					"import { describe, expect, it } from 'vitest'",
					"describe('extra', () => {",
					"\tit('two plus two → four', () => { expect(add(2, 2)).toBe(4) })",
					'})',
					'',
				].join('\n'),
			},
		})

		const red = await tdd({ cwd: root, argv: ['red'] })

		expect(red.exitCode).toBe(0)
		expect(caseLines(red.output).filter((line) => line.startsWith('revised'))).toEqual([
			`revised  ${HELPER}  ${REASON}`,
		])
		expect(freezes(root).at(-1)?.revised).toEqual([HELPER])
	})
})

describe(
	'an acceptance never overrides a proof, a receipt counts only while its declaration holds',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		const REVISION_REASON = 'the review asked for the attribute to be read'
		const PROVEN_BEFORE_IT = /proven red\W+(then\W+)?green before it/
		const NO_LONGER_DECLARED = /no longer declared/
		/** A second case in the fixture's test file: the file changes around the proven one. */
		const SECOND_CASE =
			"\tit('DD_2 keeps attribute a', () => { expect(keepAttribute({ a: 'x' })).toBe('y') })\n"

		/** The fixture's package with its case proven red then green, frozen as it is, `lot` declared. */
		function provenPackage(lot: {
			accept?: Array<{ case: string; reason: string }>
			revised?: Array<{ case: string; reason: string }>
		}): { root: string; receiptsBefore: string[] } {
			const fixture = createProofKindPackage()
			writeProofKindLedger({ root: fixture.root, entries: provenLedgerEntries(fixture) })
			writeProofKindLot({ root: fixture.root, ...lot })
			return { root: fixture.root, receiptsBefore: receiptLines(fixture.root) }
		}

		/** The lines of an output that name the fixture's case and an accepted receipt: the skipped ones. */
		function skippedAcceptanceLines(output: string): string[] {
			return output
				.split('\n')
				.filter((line) => line.includes(PROOF_KIND_CASE_LABEL) && /accepted/.test(line))
		}

		/** The reported history in a scratch package whose lot file holds `lot`. */
		function reportedPackage(params: {
			accept?: Array<{ case: string; reason: string }>
			revised?: Array<{ case: string; reason: string }>
		}): { root: string; before: TddEntry[] } {
			const fixture = createProofKindPackage()
			const before = reportedLedgerEntries(fixture)
			writeProofKindLedger({ root: fixture.root, entries: before })
			writeProofKindLot({ root: fixture.root, ...params })
			return { root: fixture.root, before }
		}

		/** The entries the ledger held before, as written, and the receipts a run appended since. */
		function sinceTheRun(params: { root: string; before: TddEntry[] }): {
			earlier: string[]
			newReceipts: TddEntry[]
		} {
			const { entries } = readProofKindLedger(params.root)
			return {
				earlier: entries.slice(0, params.before.length).map((entry) => JSON.stringify(entry)),
				newReceipts: entries.slice(params.before.length).filter((entry) => entry.kind !== 'freeze'),
			}
		}

		/** The status of the fixture's case, from `tdd status --json`. */
		async function fixtureStatus(root: string): Promise<string | undefined> {
			const status = await tdd({ cwd: root, argv: ['status', '--json'] })
			return (JSON.parse(status.output) as { cases: Array<{ status: string }> }).cases[0]?.status
		}

		it('a case red then green, its accept entry still declared, a red run → kept, saying the acceptance is not needed and can be removed from the lot file; no accepted receipt appended', async () => {
			const { root, receiptsBefore } = provenPackage({
				accept: [{ case: PROOF_KIND_CASE_LABEL, reason: PROOF_KIND_ACCEPT_REASON }],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^kept {5}src\/dd-element\.test\.ts::D > DD_1 keeps attribute a {2}.*acceptance (is )?not needed.*lot file/i,
				),
			])
			expect(receiptLines(root)).toEqual(receiptsBefore)
		})

		it('a case red then green, its test file changed around it since (a case added), its accept entry declared → still kept, flagged `test code changed around it`, no accepted receipt', async () => {
			const { root } = provenPackage({
				accept: [{ case: PROOF_KIND_CASE_LABEL, reason: PROOF_KIND_ACCEPT_REASON }],
			})
			writeFiles({
				root,
				files: {
					[PROOF_KIND_TEST_FILE]: PROOF_KIND_TEST_TEXT.replace('\n})\n', `\n${SECOND_CASE}})\n`),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(caseLines(red.output)).toEqual(
				expect.arrayContaining([
					expect.stringMatching(
						/^kept {5}src\/dd-element\.test\.ts::D > DD_1 keeps attribute a {2}.*flags: test code changed around it/,
					),
				]),
			)
			expect(receiptLines(root).filter((line) => line.startsWith('accepted'))).toEqual([])
		})

		it('a proven case, unchanged, a `revised` entry naming it, a red run → kept carrying the entry reason and saying the revision is not needed; no receipt appended; the gate lists the entry as unused', async () => {
			const { root, receiptsBefore } = provenPackage({
				revised: [{ case: PROOF_KIND_CASE_LABEL, reason: REVISION_REASON }],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(
					/^kept {5}src\/dd-element\.test\.ts::D > DD_1 keeps attribute a {2}.*(revision (is )?not needed.*the review asked|the review asked.*revision (is )?not needed)/,
				),
			])
			expect(receiptLines(root)).toEqual(receiptsBefore)
			expect(check.details).toContain(
				`unused revised entry  ${PROOF_KIND_CASE_LABEL}  no case of the change stands revised by a red run (${REVISION_REASON})`,
			)
		})

		it('red, green, the file edited, a stale accepted receipt at its new hash, no entry → `tdd green` records a green for the case, no test edit', async () => {
			const fixture = createProofKindPackage()
			writeProofKindLedger({
				root: fixture.root,
				entries: staleAcceptanceLedgerEntries(fixture),
			})
			writeProofKindLot({ root: fixture.root })

			const green = await tdd({ cwd: fixture.root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(caseLines(green.output)).toEqual([`green    ${PROOF_KIND_CASE_LABEL}`])
			expect(receiptLines(fixture.root).at(-1)).toBe(`green ${PROOF_KIND_CASE_NAME}`)
		})

		it('red, green, the file edited, a revised receipt of the same case hash at its new hash (a whole-file entry, since removed) → `tdd green` records a green for the case', async () => {
			const fixture = createProofKindPackage()
			const entries = staleAcceptanceLedgerEntries(fixture).map((entry): TddEntry =>
				entry.kind === 'accepted'
					? { ...entry, kind: 'revised', reason: PROOF_KIND_REVISED_REASON }
					: entry,
			)
			writeProofKindLedger({ root: fixture.root, entries })
			writeProofKindLot({ root: fixture.root })

			const green = await tdd({ cwd: fixture.root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
			expect(caseLines(green.output)).toEqual([`green    ${PROOF_KIND_CASE_LABEL}`])
			expect(receiptLines(fixture.root).at(-1)).toBe(`green ${PROOF_KIND_CASE_NAME}`)
		})

		it('the reported history, the accept entry still declared → red: kept, acceptance not needed, no accepted receipt; green: green; status: green, the accepted receipt named as skipped (a proof stands before it); the earlier entries untouched', async () => {
			const { root, before } = reportedPackage({
				accept: [{ case: PROOF_KIND_CASE_LABEL, reason: PROOF_KIND_ACCEPT_REASON }],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const redLedger = sinceTheRun({ root, before })
			const green = await tdd({ cwd: root, argv: ['green'] })
			const status = await tdd({ cwd: root, argv: ['status'] })
			const greenStatus = await fixtureStatus(root)
			const afterGreen = sinceTheRun({ root, before })

			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(/^kept {5}src\/dd-element\.test\.ts::.*acceptance (is )?not needed/i),
			])
			expect(redLedger.newReceipts).toEqual([])
			expect(caseLines(green.output)).toEqual([`green    ${PROOF_KIND_CASE_LABEL}`])
			expect(greenStatus).toBe('green')
			expect(skippedAcceptanceLines(status.output)).toEqual([
				expect.stringMatching(PROVEN_BEFORE_IT),
			])
			expect(afterGreen.earlier).toEqual(before.map((entry) => JSON.stringify(entry)))
		})

		it('the reported history, the accept entry removed and a `revised` entry declared for the case → red: kept, revision not needed, no receipt; green: green; status: green; the earlier entries untouched', async () => {
			const { root, before } = reportedPackage({
				revised: [{ case: PROOF_KIND_CASE_LABEL, reason: PROOF_KIND_REVISED_REASON }],
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const redLedger = sinceTheRun({ root, before })
			const green = await tdd({ cwd: root, argv: ['green'] })
			const greenStatus = await fixtureStatus(root)
			const afterGreen = sinceTheRun({ root, before })

			expect(caseLines(red.output)).toEqual([
				expect.stringMatching(/^kept {5}src\/dd-element\.test\.ts::.*revision (is )?not needed/i),
			])
			expect(redLedger.newReceipts).toEqual([])
			expect(caseLines(green.output)).toEqual([`green    ${PROOF_KIND_CASE_LABEL}`])
			expect(greenStatus).toBe('green')
			expect(afterGreen.earlier).toEqual(before.map((entry) => JSON.stringify(entry)))
		})

		it('the reported history, the accept entry removed, nothing declared → status names the skipped accepted receipt (no longer declared); green: green; status: green; the gate counts it red then green and lists the skipped receipt; the earlier entries untouched', async () => {
			const { root, before } = reportedPackage({})

			const owed = await tdd({ cwd: root, argv: ['status'] })
			const owedStatus = await fixtureStatus(root)
			const green = await tdd({ cwd: root, argv: ['green'] })
			const greenStatus = await fixtureStatus(root)
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })
			const { earlier } = sinceTheRun({ root, before })

			expect(skippedAcceptanceLines(owed.output)).toEqual([
				expect.stringMatching(NO_LONGER_DECLARED),
			])
			expect(owedStatus).toBe('red')
			expect(caseLines(green.output)).toEqual([`green    ${PROOF_KIND_CASE_LABEL}`])
			expect(greenStatus).toBe('green')
			expect(check.status).toBe('passed')
			expect(check.note).toContain('1 red then green')
			expect(
				(check.details ?? []).filter(
					(line) => line.includes(PROOF_KIND_CASE_LABEL) && /accepted/.test(line),
				),
			).toEqual([expect.stringMatching(NO_LONGER_DECLARED)])
			expect(earlier).toEqual(before.map((entry) => JSON.stringify(entry)))
		})
	},
)

describe(
	'a test file importing a vite worker with a query',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a new test file importing ./x.worker?worker&url, its case failing on the stub → red recorded, the import is not refused as unresolvable', async () => {
			const root = createVitestPackage({})
			writeFiles({
				root,
				files: {
					'src/add.ts': STUB,
					'src/x.worker.ts': 'export {}\n',
					'src/add.test.ts': [
						"import { add } from './add.ts'",
						"import workerUrl from './x.worker?worker&url'",
						"import { describe, expect, it } from 'vitest'",
						"describe('add', () => {",
						"\tit('one plus two → three', () => { expect(workerUrl).toBeTypeOf('string'); expect(add(1, 2)).toBe(3) })",
						'})',
						'',
					].join('\n'),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(red.exitCode).toBe(0)
			expect(caseLines(red.output)).toEqual([
				'red      src/add.test.ts::add > one plus two → three  not-implemented: not implemented: add',
			])
		})
	},
)

describe('test code moved without an edit', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	const SELF_CONTAINED_TEST = [
		"import { describe, expect, it } from 'vitest'",
		"describe('one', () => {",
		"\tit('one is one', () => { expect(1).toBe(1) })",
		'})',
		'',
	].join('\n')

	/** The package with `base` committed; each `from` then removed and its text written at its `to` (nothing committed). */
	function movedPackage(params: {
		base: Record<string, string>
		moves: Array<{ from: string; to: string; text?: string }>
	}): string {
		const root = createVitestPackage({ files: params.base })
		for (const move of params.moves) {
			const text = readFileSync(join(root, move.from), 'utf8')
			unlinkSync(join(root, move.from))
			writeFiles({ root, files: { [move.to]: move.text ?? text } })
		}
		return root
	}

	const MOVED_TEST_FILES: Array<{
		name: string
		base: Record<string, string>
		from: string
		to: string
		caseName: string
	}> = [
		{
			name: 'renamed in its folder',
			base: { 'src/add.ts': IMPLEMENTED, 'src/add.test.ts': ADD_TEST },
			from: 'src/add.test.ts',
			to: 'src/add-moved.test.ts',
			caseName: 'add > one plus two → three',
		},
		{
			name: 'moved to another folder',
			base: { 'src/a/one.test.ts': SELF_CONTAINED_TEST },
			from: 'src/a/one.test.ts',
			to: 'src/b/one.test.ts',
			caseName: 'one > one is one',
		},
	]

	for (const { name, base, from, to, caseName } of MOVED_TEST_FILES)
		it(`a test file ${name}, its bytes as at the base → its case unchanged, no deleted case for the old path, the gate's tdd check passes, no red or green recorded`, async () => {
			const root = movedPackage({ base, moves: [{ from, to }] })

			const status = await tdd({ cwd: root, argv: ['status', '--json'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			expect(JSON.parse(status.output)).toMatchObject({
				cases: [{ file: to, name: caseName, status: 'unchanged' }],
				unfrozen: [],
				findings: [],
			})
			expect(check).toMatchObject({ status: 'passed' })
			expect(readLedger(root).entries).toEqual([])
		})

	const MOVED_HELPERS = [
		{
			name: 'helper',
			from: 'src/test/helper.ts',
			to: 'src/test/support/helper.ts',
			text: 'export const HELPER = 1\n',
		},
		{
			name: 'fixture',
			from: 'src/test/fixtures/a.xml',
			to: 'src/test/fixtures/old/a.xml',
			text: '<a/>\n',
		},
	]

	for (const { name, from, to, text } of MOVED_HELPERS)
		it(`a test ${name} moved without an edit → not test code waiting for a freeze: status lists no unfrozen file, the gate's tdd check passes`, async () => {
			const root = movedPackage({ base: { [from]: text }, moves: [{ from, to }] })

			const status = await tdd({ cwd: root, argv: ['status', '--json'] })
			const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

			expect(JSON.parse(status.output)).toMatchObject({ unfrozen: [], findings: [] })
			expect(check).toMatchObject({ status: 'passed' })
		})

	it('a helper and a fixture moved, the helper with an edit → only the edited helper is test code waiting for a freeze; the unchanged fixture is not, the gate check fails naming the helper', async () => {
		const root = movedPackage({
			base: {
				'src/test/helper.ts': 'export const HELPER = 1\n',
				'src/test/fixtures/a.xml': '<a/>\n',
			},
			moves: [
				{
					from: 'src/test/helper.ts',
					to: 'src/test/support/helper.ts',
					text: 'export const HELPER = 2\n',
				},
				{ from: 'src/test/fixtures/a.xml', to: 'src/test/fixtures/old/a.xml' },
			],
		})

		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(JSON.parse(status.output)).toMatchObject({ unfrozen: ['src/test/support/helper.ts'] })
		expect(check).toMatchObject({
			status: 'failed',
			reason: expect.stringContaining('src/test/support/helper.ts'),
		})
		expect(check).not.toMatchObject({ reason: expect.stringContaining('a.xml') })
	})

	it('a test file renamed to a non-test name with its bytes (src/a.test.ts → src/a.test.ts.off) → its base case listed deleted, the gate check reports the deleted file', async () => {
		const root = movedPackage({
			base: { 'src/a.test.ts': SELF_CONTAINED_TEST },
			moves: [{ from: 'src/a.test.ts', to: 'src/a.test.ts.off' }],
		})

		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(JSON.parse(status.output)).toMatchObject({
			findings: [{ verb: 'deleted', file: 'src/a.test.ts' }],
		})
		expect(check).toMatchObject({
			details: [expect.stringContaining('deleted  src/a.test.ts')],
		})
	})

	it('a non-test file renamed to a test name with its bytes (src/b.test.ts.off → src/b.test.ts) → its cases are a new file needing red and green: missing receipt, the gate check fails', async () => {
		const root = movedPackage({
			base: { 'src/b.test.ts.off': SELF_CONTAINED_TEST },
			moves: [{ from: 'src/b.test.ts.off', to: 'src/b.test.ts' }],
		})

		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(JSON.parse(status.output)).toMatchObject({
			cases: [{ file: 'src/b.test.ts', name: 'one > one is one', status: 'missing receipt' }],
		})
		expect(check).toMatchObject({ status: 'failed' })
	})

	const SUB_TEST_BASE = [
		"import { sub } from './sub.ts'",
		"import { describe, expect, it } from 'vitest'",
		"describe('sub', () => {",
		"\tit('three minus one → two', () => { expect(sub(3, 1)).toBe(2) })",
		"\tit('five minus two → three', () => { expect(sub(5, 2)).toBe(3) })",
		'})',
		'',
	].join('\n')

	const SUB_IMPLEMENTED =
		'export function sub(left: number, right: number): number {\n\treturn left - right\n}\n'

	it('two test files moved, one with its bytes and one with a case edited → the first unchanged; the second a new file whose cases need red and green, its old path listed deleted', async () => {
		const root = movedPackage({
			base: {
				'src/add.ts': IMPLEMENTED,
				'src/add.test.ts': ADD_TEST,
				'src/sub.ts': SUB_IMPLEMENTED,
				'src/sub.test.ts': SUB_TEST_BASE,
			},
			moves: [
				{ from: 'src/add.test.ts', to: 'src/add-moved.test.ts' },
				{
					from: 'src/sub.test.ts',
					to: 'src/sub-moved.test.ts',
					text: SUB_TEST_BASE.replace('toBe(2)', 'toBe(3 - 1)'),
				},
			],
		})

		const status = await tdd({ cwd: root, argv: ['status', '--json'] })
		const text = await tdd({ cwd: root, argv: ['status'] })
		const check = await checkTddReceipts({ root, packageJson: readPackageJson(root) })

		expect(JSON.parse(status.output)).toMatchObject({
			cases: [
				{ file: 'src/add-moved.test.ts', name: 'add > one plus two → three', status: 'unchanged' },
				{
					file: 'src/sub-moved.test.ts',
					name: 'sub > three minus one → two',
					status: 'missing receipt',
				},
				{
					file: 'src/sub-moved.test.ts',
					name: 'sub > five minus two → three',
					status: 'unchanged',
				},
			],
			findings: [
				{
					verb: 'deleted',
					file: 'src/sub.test.ts',
					detail: 'the test file of the base is deleted',
				},
			],
		})
		expect(text.output).toMatch(/^moved {2}1 case\(s\) {2}src\/sub\.test\.ts → 1 file\(s\)/m)
		expect(check).toMatchObject({ status: 'failed' })
	})
})
