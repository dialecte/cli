/**
 * `dialecte contrib` and a default step (the docs build, the type bench) whose npm script the package lacks: it
 * fails before any row runs, the built-in rules row included, unless the package opts it out by name with a reason;
 * a declared step without its script fails too.
 */
import { createUnwiredPackage } from '../../test/rule-gaps-unwired.ts'
import { countRuns, createCounter } from '../../test/scratch-checks.ts'
import { parseContribJson, runContribIn } from '../../test/scratch-contrib.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { UNWIRED_NOT_RUN_REASON } from '../lib/gate/gate-config.constants.ts'

import { describe, expect, it } from 'vitest'

const CONTRIBUTOR = { profile: 'contributor' }
const NOT_RUN_DETAIL = UNWIRED_NOT_RUN_REASON

describe(
	'contrib: a default step without its npm script',
	{ timeout: HANDOVER_CASE_TIMEOUT },
	() => {
		it('docs without doc:build → docs fails not wired and every row is not run (rules and release included), nothing ran, exit 1', async () => {
			const counter = createCounter()
			const root = createUnwiredPackage({
				counter,
				scripts: ['type-bench:check'],
				dialecte: CONTRIBUTOR,
			})

			const result = await runContribIn({ cwd: root, argv: ['--json'] })

			expect({
				exitCode: result.exitCode,
				rows: parseContribJson(result.output).rows,
				runs: countRuns(counter),
			}).toEqual({
				exitCode: 1,
				rows: [
					{ name: 'rules', status: 'not-run', detail: NOT_RUN_DETAIL },
					{
						name: 'docs',
						status: 'failed',
						detail: 'not wired (no npm script "doc:build")',
					},
					{ name: 'type-bench', status: 'not-run', detail: NOT_RUN_DETAIL },
					{ name: 'release', status: 'not-run', detail: NOT_RUN_DETAIL },
				],
				runs: 0,
			})
		})

		it('the same package printed → the docs line reads FAIL not wired, and the verdict names docs', async () => {
			const root = createUnwiredPackage({
				counter: createCounter(),
				scripts: ['type-bench:check'],
				dialecte: CONTRIBUTOR,
			})

			const lines = (await runContribIn({ cwd: root })).output.split('\n')

			expect({
				docs: lines.find((line) => line.startsWith('FAIL  docs')),
				verdict: lines.find((line) => line.startsWith('contrib:')),
			}).toEqual({
				docs: 'FAIL  docs  not wired (no npm script "doc:build")',
				verdict: 'contrib: failed at docs',
			})
		})

		it('dialecte.contrib.skip.docs holds a reason → contrib is green, the docs line says opted out, the type bench ran', async () => {
			const counter = createCounter()
			const root = createUnwiredPackage({
				counter,
				scripts: ['type-bench:check'],
				dialecte: { ...CONTRIBUTOR, contrib: { skip: { docs: 'no docs build here' } } },
			})

			const result = await runContribIn({ cwd: root })

			expect({
				exitCode: result.exitCode,
				docs: result.output.split('\n').find((line) => line.startsWith('skip  docs')),
				runs: countRuns(counter),
			}).toEqual({
				exitCode: 0,
				docs: 'skip  docs  opted out: no docs build here',
				runs: 1,
			})
		})

		it('an opt-out that names no default step (a typo), or an empty reason → exit 2, the refusal names dialecte.contrib.skip and the name, no row ran', async () => {
			const counter = createCounter()
			const typo = createUnwiredPackage({
				counter,
				scripts: ['doc:build', 'type-bench:check'],
				dialecte: { ...CONTRIBUTOR, contrib: { skip: { dox: 'a typo' } } },
			})
			const empty = createUnwiredPackage({
				counter,
				scripts: ['type-bench:check'],
				dialecte: { ...CONTRIBUTOR, contrib: { skip: { docs: '' } } },
			})

			const first = await runContribIn({ cwd: typo })
			const second = await runContribIn({ cwd: empty })

			expect({ first, second, runs: countRuns(counter) }).toEqual({
				first: { exitCode: 2, output: expect.stringMatching(/dialecte\.contrib\.skip.*dox/s) },
				second: { exitCode: 2, output: expect.stringMatching(/dialecte\.contrib\.skip.*docs/s) },
				runs: 0,
			})
		})

		it('a declared contrib step naming a script the package lacks → fails declared but not wired, the other rows not run', async () => {
			const counter = createCounter()
			const root = createUnwiredPackage({
				counter,
				scripts: ['bench'],
				dialecte: {
					...CONTRIBUTOR,
					contrib: {
						steps: [
							{ name: 'bench', run: 'npm run bench' },
							{ name: 'docs', run: 'npm run doc:build' },
						],
					},
				},
			})

			const result = await runContribIn({ cwd: root, argv: ['--json'] })

			expect({
				exitCode: result.exitCode,
				rows: parseContribJson(result.output).rows.map(({ name, status, detail }) => ({
					name,
					status,
					detail,
				})),
				runs: countRuns(counter),
			}).toEqual({
				exitCode: 1,
				rows: [
					{ name: 'rules', status: 'not-run', detail: NOT_RUN_DETAIL },
					{ name: 'bench', status: 'not-run', detail: NOT_RUN_DETAIL },
					{
						name: 'docs',
						status: 'failed',
						detail: 'declared but not wired (no npm script "doc:build")',
					},
					{ name: 'release', status: 'not-run', detail: NOT_RUN_DETAIL },
				],
				runs: 0,
			})
		})
	},
)
