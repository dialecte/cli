/**
 * A case main brought in through a merge into the lot is a case of the base: edited after the merge with a `revised`
 * entry, a red run records it revised at once, no review-round snapshot needed.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { git, writeFiles } from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runGate } from './gate.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-17T12:00:00.000Z')
const ADD = 'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
const ADD_TEST = [
	"import { add } from './add.ts'",
	"import { expect, it } from 'vitest'",
	"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
	'',
].join('\n')
const REVISED_TEST = ADD_TEST.replace(
	'expect(add(1, 2)).toBe(3)',
	'expect(add(1, 2)).toBe(3); expect(add(0, 0)).toBe(0)',
)
const CASE = 'src/add.test.ts::one plus two → three'

describe(
	'a revised case main brought in through a merge',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('the lot merged main holding the case, then edited it with a revised entry → red records it revised; the gate passes', async () => {
			const root = createVitestPackage({
				dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
			})
			git({ root, args: ['switch', '-q', '-c', 'feat/x'] })
			git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'feat: the lot'] })
			git({ root, args: ['switch', '-q', 'main'] })
			writeFiles({ root, files: { 'src/add.ts': ADD, 'src/add.test.ts': ADD_TEST } })
			git({ root, args: ['add', '-A'] })
			git({ root, args: ['commit', '-q', '-m', 'feat: add, landed on main'] })
			git({ root, args: ['switch', '-q', 'feat/x'] })
			git({ root, args: ['merge', '-q', '--no-edit', 'main'] })
			writeFileSync(join(root, 'src/add.test.ts'), REVISED_TEST)
			writeFiles({
				root,
				files: {
					'.dialecte/lot.json': JSON.stringify({
						revised: [{ case: CASE, reason: 'the review asked for the zero case' }],
					}),
				},
			})

			const red = await runTdd({ cwd: root, argv: ['red'], now: () => NOW })
			const result = await runGate({ cwd: root, argv: ['--declare', 'src/'] })

			expect(red.output.split('\n').at(-1)).toMatch(
				/^tdd red: 0 red, 0 unchanged, 0 kept, 0 accepted, 1 revised, 0 refused/,
			)
			expect(result.output.split('\n')[1]).toBe('ok    tdd  1 case(s) of the change: 1 revised')
		})
	},
)
