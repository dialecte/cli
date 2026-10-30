import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { hashTestCode } from '../lib/tdd/tdd-files.ts'
import { runTdd } from './tdd.ts'

import { afterEach, describe, expect, it } from 'vitest'

import type { TddLedger, TddReceipt } from '../lib/tdd/tdd.types.ts'

const NOW = new Date('2026-10-29T12:00:00.000Z')

/** `tdd` in the package, its receipts dated NOW, its machine lock in a folder of the test's own. */
function tdd(params: {
	cwd: string
	argv: string[]
	lockPath?: string
	isAlive?: (pid: number) => boolean
}) {
	return runTdd({
		cwd: params.cwd,
		argv: params.argv,
		now: () => NOW,
		machineLock: {
			path: params.lockPath ?? join(temporaryFolder('dialecte-tdd-lock-'), 'heavy-run.lock'),
			clock: createFakeClock(),
			write: () => undefined,
			isAlive: params.isAlive,
		},
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
		.filter((line) => /^(red|refused|green|unchanged|kept|accepted) /.test(line))
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

	it('failures that are not a red, a matcher-less expect, a .only → refused with their kind; the red case of a file with refusals is recorded, nothing frozen', async () => {
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
		expect(readLedger(root).entries.filter((entry) => entry.kind === 'freeze')).toEqual([])
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

	it('a case weakened after its red, then a re-red of the file → refused: its test changed and it passes; the other case red again, recorded; the file stays unfrozen, green refused', async () => {
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
			'refused add > B two plus two',
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
			'red      src/add.test.ts::add > two plus two → four  not-implemented: not implemented: add',
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

	it('a package whose tests run in a browser, the machine lock held by another live process, --no-wait → refused, nothing run', async () => {
		const root = createVitestPackage({
			devDependencies: { '@vitest/browser-playwright': '^4.1.10' },
		})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		const lockPath = join(temporaryFolder('dialecte-tdd-lock-'), 'heavy-run.lock')
		writeFileSync(
			lockPath,
			JSON.stringify({
				pid: 1111,
				command: 'dialecte gate --full in /elsewhere',
				startedAt: '2026-10-29T10:00:00.000Z',
			}),
		)

		const red = await tdd({ cwd: root, argv: ['red', '--no-wait'], lockPath, isAlive: () => true })

		expect(red).toEqual({
			exitCode: 1,
			output:
				'tdd red: the machine lock is held (--no-wait): pid 1111 runs "dialecte gate --full in /elsewhere" since 2026-10-29T10:00:00.000Z',
		})
		expect(readLedger(root).entries).toEqual([])
	})
})

afterEach(function forgetTheFlag() {
	delete process.env.DIALECTE_TDD_FLIP
})
