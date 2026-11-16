/**
 * An `accept`, `revised` or `gone` entry that matches nothing is named under the gate's tdd step with the closest real
 * label and the verb that drops it: a stale receipt never needs a hand edit of the lot file.
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
const STUB =
	"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
const IMPLEMENTED =
	'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')
const CASE = 'src/add.test.ts::one plus two → three'

/** A package whose `src/add.test.ts` was proven red then green, its lot file then written as `declaration`. */
async function provenPackage(declaration: unknown): Promise<string> {
	const root = createVitestPackage({
		dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
	})
	writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
	await runTdd({ cwd: root, argv: ['red'], now: () => NOW })
	writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
	await runTdd({ cwd: root, argv: ['green'], now: () => NOW })
	writeFiles({ root, files: { '.dialecte/lot.json': JSON.stringify(declaration) } })
	return root
}

/** The unused-entry lines under the gate's tdd step, trimmed. */
async function unusedLinesOf(root: string): Promise<string[]> {
	const result = await runGate({ cwd: root, argv: ['--declare', 'src/'] })
	return result.output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('unused '))
}

describe('the unused receipts of the lot file', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it.each([
		{
			list: 'accept',
			declaration: { accept: [{ case: 'src/add.test.ts::one plus two → tree', reason: 'a typo' }] },
			line: `unused accept  src/add.test.ts::one plus two → tree  no case of the change has that name; the closest: ${CASE} (a typo); drop it: dialecte lot accept --remove 'src/add.test.ts::one plus two → tree'`,
		},
		{
			list: 'revised',
			declaration: {
				revised: [{ case: 'src/add.test.ts::one plus two → tree', reason: 'a typo' }],
			},
			line: `unused revised entry  src/add.test.ts::one plus two → tree  no case of the change stands revised by a red run; the closest: ${CASE} (a typo); drop it: dialecte lot revised --remove 'src/add.test.ts::one plus two → tree'`,
		},
		{
			list: 'gone',
			declaration: { gone: [{ file: 'src/ad.test.ts', reason: 'a typo' }] },
			line: 'unused gone entry  src/ad.test.ts  no test call of the base gone without a title in a file it names; the closest: src/add.test.ts (a typo); drop it: dialecte lot gone --remove src/ad.test.ts',
		},
	])(
		'an unused $list entry → named with the closest real label and the --remove command',
		async ({ declaration, line }) => {
			const root = await provenPackage(declaration)

			const lines = await unusedLinesOf(root)

			expect(lines).toEqual([line])
		},
	)

	it('an unused moved entry → named with the closest test file and the --remove command of its to', async () => {
		const root = await provenPackage({
			moved: [{ from: 'src/old.test.ts', to: 'src/ad.test.ts', reason: 'a split' }],
		})

		const lines = await unusedLinesOf(root)

		expect(lines).toEqual([
			'unused moved entry  src/ad.test.ts  no case of the change carries a red from src/old.test.ts; the closest: src/add.test.ts (a split); drop it: dialecte lot moved --remove src/old.test.ts src/ad.test.ts',
		])
	})

	it('an unused entry close to nothing → named with its --remove command, no closest', async () => {
		const root = await provenPackage({
			gone: [{ file: 'lib/**/*.test.ts', reason: 'nothing there' }],
		})

		const lines = await unusedLinesOf(root)

		expect(lines).toEqual([
			"unused gone entry  lib/**/*.test.ts  no test call of the base gone without a title in a file it names (nothing there); drop it: dialecte lot gone --remove 'lib/**/*.test.ts'",
		])
	})
})
