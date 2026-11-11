/**
 * The vitest `setupFiles` of a package are test code no test imports: tdd counts them, from the package's vitest
 * config, as a dependency of every test file of a red run.
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

/** The setup file the package's vitest config names, and the config naming it. */
const SETUP_FILE = 'test/setup.ts'
const VITEST_CONFIG = `export default { test: { setupFiles: ['./${SETUP_FILE}'] } }\n`

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

const CASE = 'src/add.test.ts::add > one plus two → three'
const REASON = 'the review asked for the zero case'
const SETUP_REASON = 'the setup file counts the runs'

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
	'tdd and the setup files of the vitest config',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('a setup file new in the lot, a test file red → red freezes both; green passes and the gate tdd step passes', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'vitest.config.ts': VITEST_CONFIG },
			})
			writeFiles({
				root,
				files: { 'src/add.ts': ADD_STUB, 'src/add.test.ts': ADD_TEST, [SETUP_FILE]: SETUP_TEXT },
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			writeFileSync(join(root, 'src/add.ts'), ADD)
			const green = await tdd({ cwd: root, argv: ['green'] })
			const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

			expect(frozenFilesOf(red.output)).toEqual(['src/add.test.ts', SETUP_FILE])
			expect(green.exitCode).toBe(0)
			expect(result.output.split('\n')[1]).toBe(
				'ok    tdd  1 case(s) of the change: 1 red then green',
			)
		})

		it('the setup file edited at review with a revised entry naming it, the test file revised too → red revises and freezes both; the gate tdd step passes', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: {
					'vitest.config.ts': VITEST_CONFIG,
					'src/add.ts': ADD,
					'src/add.test.ts': ADD_TEST,
					[SETUP_FILE]: SETUP_TEXT,
				},
			})
			writeFiles({
				root,
				files: {
					'src/add.test.ts': ADD_TEST.replace(
						'expect(add(1, 2)).toBe(3)',
						'expect(add(1, 2)).toBe(3); expect(add(0, 0)).toBe(0)',
					),
					[SETUP_FILE]: EDITED_SETUP_TEXT,
					'.dialecte/lot.json': JSON.stringify({
						revised: [
							{ case: CASE, reason: REASON },
							{ case: SETUP_FILE, reason: SETUP_REASON },
						],
					}),
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })
			const result = await gate({ cwd: root, argv: ['--declare', 'src/', '--declare', 'test/'] })

			expect(frozenFilesOf(red.output)).toEqual(['src/add.test.ts', SETUP_FILE])
			expect(result.output.split('\n')[1]).toBe('ok    tdd  1 case(s) of the change: 1 revised')
		})

		it('a changed test/other.ts that is neither a setup file nor imported, beside a new setup file → red freezes the test file and the setup file, never test/other.ts', async () => {
			const root = createVitestPackage({
				dialecte: GATE_CONFIG,
				files: { 'vitest.config.ts': VITEST_CONFIG },
			})
			writeFiles({
				root,
				files: {
					'src/add.ts': ADD_STUB,
					'src/add.test.ts': ADD_TEST,
					[SETUP_FILE]: SETUP_TEXT,
					'test/other.ts': 'export const other = 1\n',
				},
			})

			const red = await tdd({ cwd: root, argv: ['red'] })

			expect(frozenFilesOf(red.output)).toEqual(['src/add.test.ts', SETUP_FILE])
		})

		it('the setup file edited, a red with no case red and no revised entry naming it → not frozen, green refused naming it', async () => {
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

			const red = await tdd({ cwd: root, argv: ['red'] })
			const green = await tdd({ cwd: root, argv: ['green'] })

			expect({
				frozen: frozenFilesOf(red.output).filter(Boolean),
				greenExitCode: green.exitCode,
				greenNamesIt: green.output.includes(SETUP_FILE),
			}).toEqual({ frozen: [], greenExitCode: 1, greenNamesIt: true })
		})
	},
)
