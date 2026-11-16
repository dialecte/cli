/**
 * An `accept` entry names one case in one project: a red run records that case x project accepted beside the other
 * projects' red and green receipts of the same case, and the gate reads it so.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')

/** Two projects running the same test file, each with its own SIDE. */
const TWO_SIDES_CONFIG = [
	"import { defineConfig } from 'vitest/config'",
	'export default defineConfig({ test: { projects: [',
	"\t{ test: { name: 'one', include: ['src/**/*.test.ts'], env: { SIDE: 'one' } } },",
	"\t{ test: { name: 'two', include: ['src/**/*.test.ts'], env: { SIDE: 'two' } } },",
	'] } })',
	'',
].join('\n')

/** Production that already answers on side two only: the case is red on one, passes on two. */
const HALF_DONE =
	"export function add(left: number, right: number): number {\n\tif (process.env.SIDE === 'two') return left + right\n\tthrow new Error('not implemented: add')\n}\n"
const DONE =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')
const CASE_TWO = 'src/add.test.ts::one plus two → three [two]'

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => NOW })
}

describe('an accept entry of one case x project', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('red on project one, passing on two; green; then two accepted and red again → the gate passes: 1 red then green, 1 accepted', async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			files: { 'vitest.config.ts': TWO_SIDES_CONFIG },
		})
		writeFiles({ root, files: { 'src/add.ts': HALF_DONE, 'src/add.test.ts': ADD_TEST } })
		await tdd({ cwd: root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), DONE)
		await tdd({ cwd: root, argv: ['green'] })
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					accept: [{ case: CASE_TWO, reason: 'side two answered before the lot' }],
				}),
			},
		})
		await tdd({ cwd: root, argv: ['red'] })

		const result = await runGate({ cwd: root, argv: ['--declare', 'src/'] })

		expect(result.output.split('\n')[1]).toBe(
			'ok    tdd  2 case(s) of the change: 1 red then green, 1 accepted',
		)
	})
})
