/**
 * The suite's infrastructure is the production side of a lot that fixes it: the vitest config's `setupFiles` and
 * `globalSetup` and the test helpers they import. A red run never freezes them; a fix there after the red is the
 * green side, as any production change.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-09T12:00:00.000Z')

/** The package's gate is one passing step; the tdd step is added by the gate itself. */
const GATE_CONFIG = { gate: { fast: [{ name: 'check', run: 'true' }] } }

/** The setup file and the global setup the package's vitest config names, and the configs naming them. */
const SETUP_FILE = 'test/setup.ts'
const GLOBAL_SETUP_FILE = 'test/guard/guard.setup.ts'
const VITEST_CONFIG = `export default { test: { setupFiles: ['./${SETUP_FILE}'] } }\n`
const GUARD_CONFIG = `export default { test: { setupFiles: ['./${SETUP_FILE}'], globalSetup: ['./${GLOBAL_SETUP_FILE}'] } }\n`

/** The global setup runs the guard's check, a helper the guard's own test reads too. */
const GUARD_FILE = 'test/guard/leftovers.ts'
const GLOBAL_SETUP_TEXT =
	"import { leftovers } from './leftovers.ts'\nexport function teardown() { leftovers([]) }\n"
const GUARD_STUB = "export function leftovers(names: string[]): string {\n\treturn 'none'\n}\n"
const GUARD =
	"export function leftovers(names: string[]): string {\n\treturn names.length === 0 ? 'none' : names.join(', ')\n}\n"
const GUARD_TEST = [
	"import { leftovers } from './leftovers.ts'",
	"import { describe, expect, it } from 'vitest'",
	"describe('leftovers', () => {",
	"\tit('two names → both listed', () => { expect(leftovers(['a', 'b'])).toBe('a, b') })",
	'})',
	'',
].join('\n')
const GUARD_TEST_FILE = 'test/guard/leftovers.test.ts'

const SETUP_TEXT = 'globalThis.setupMark = 1\n'
const EDITED_SETUP_TEXT = 'globalThis.setupMark = 2\n'

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

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

function gate(params: { cwd: string; argv: string[] }) {
	return runGate({ cwd: params.cwd, argv: params.argv })
}

/** The files the summary line of a red run says it froze, sorted. */
function frozenFilesOf(output: string): string[] {
	const summary = output.split('\n').at(-1) ?? ''
	return (/; frozen: (.*)$/.exec(summary)?.[1] ?? '').split(', ').sort()
}

describe(
	'tdd and the suite infrastructure of the vitest config',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it("a guard helper the global setup imports, its test red, the helper fixed after → green passes: the fix is the lot's production side", async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: {
					'vitest.config.ts': GUARD_CONFIG,
					[SETUP_FILE]: SETUP_TEXT,
					[GLOBAL_SETUP_FILE]: GLOBAL_SETUP_TEXT,
					[GUARD_FILE]: GUARD_STUB,
				},
			})
			writeFiles({ root, files: { [GUARD_TEST_FILE]: GUARD_TEST } })

			const red = await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, GUARD_FILE), GUARD)
			const green = await tdd({ cwd: root, argv: ['green'] })
			const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

			expect(frozenFilesOf(red.output)).toEqual([GUARD_TEST_FILE])
			expect(green.exitCode).toBe(0)
			expect(result.output.split('\n')[1]).toBe(
				'ok    tdd  1 case(s) of the change: 1 red then green',
			)
		})

		it('a setup file new in the lot, a test file red → red freezes the test file only, never the setup file', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'vitest.config.ts': VITEST_CONFIG },
			})
			writeFiles({
				root,
				files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST, [SETUP_FILE]: SETUP_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(frozenFilesOf(red.output)).toEqual(['src/add.test.ts'])
		})

		it('a changed test/other.ts no setup file imports, which the test file imports → still test code: frozen with the test file', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'vitest.config.ts': VITEST_CONFIG, [SETUP_FILE]: SETUP_TEXT },
			})
			writeFiles({
				root,
				files: {
					'src/add.ts': ADD_STUB,
					'src/add.test.ts': `import { other } from '../test/other.ts'\n${ADD_TEST}`,
					'test/other.ts': 'export const other = 1\n',
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(frozenFilesOf(red.output)).toEqual(['src/add.test.ts', 'test/other.ts'])
		})

		it('the setup file edited alone, no test changed → nothing for green to refuse, the gate tdd step passes', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: {
					'vitest.config.ts': VITEST_CONFIG,
					'src/add.ts': ADD,
					'src/add.test.ts': ADD_TEST,
					[SETUP_FILE]: SETUP_TEXT,
				},
			})
			writeFiles({ root, files: { [SETUP_FILE]: EDITED_SETUP_TEXT } })

			const green = await tdd({ cwd: root, argv: ['green'] })
			const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

			expect({
				green: green.output,
				gate: result.output.split('\n')[1]?.startsWith('ok    tdd'),
			}).toEqual({
				green: 'tdd green: no test file new or changed since the base (or among the files named)',
				gate: true,
			})
		})

		it('setupFiles and globalSetup written through same-file consts and a spread → read as written: the guard helper is production', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: {
					'vitest.config.ts': [
						`const SETUP = './${SETUP_FILE}'`,
						'const SETUP_FILES = [SETUP]',
						`const GLOBAL_SETUP = ['./${GLOBAL_SETUP_FILE}']`,
						'export default { test: { setupFiles: [...SETUP_FILES], globalSetup: GLOBAL_SETUP } }',
						'',
					].join('\n'),
					[SETUP_FILE]: SETUP_TEXT,
					[GLOBAL_SETUP_FILE]: GLOBAL_SETUP_TEXT,
					[GUARD_FILE]: GUARD_STUB,
				},
			})
			writeFiles({ root, files: { [GUARD_TEST_FILE]: GUARD_TEST } })

			await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, GUARD_FILE), GUARD)
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect(green.exitCode).toBe(0)
		})

		it('a setupFiles value tdd cannot read (a call) → tdd status names it, its files counted as test code', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: {
					'vitest.config.ts': `function setupList() { return ['./${SETUP_FILE}'] }\nexport default { test: { setupFiles: setupList() } }\n`,
					[SETUP_FILE]: SETUP_TEXT,
				},
			})
			writeFiles({ root, files: { 'src/add.ts': ADD, 'src/add.test.ts': ADD_TEST } })

			const status = await tdd({ cwd: root, argv: ['status'] })

			expect(status.output.split('\n')).toContain(
				'unread  vitest.config.ts setupFiles  setupList(): tdd cannot read which files it names; they count as test code',
			)
		})
	},
)
