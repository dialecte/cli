/** `dialecte bench` whose measure of the base tree throws: the base tree is removed all the same. */
import { readdirSync, realpathSync } from 'node:fs'

import { createBenchRepository } from '../../test/bench-repository.ts'
import { git } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runBench } from './bench.ts'

import { describe, expect, it, vi } from 'vitest'

/** The head's real folder: a measure of any other folder (the base tree) throws. */
const measured = vi.hoisted(function headHolder() {
	return { head: '' }
})

vi.mock('../lib/bench/measure-tree.ts', async function throwingBaseMeasure(importOriginal) {
	const original = await importOriginal<typeof import('../lib/bench/measure-tree.ts')>()
	return {
		...original,
		measureTree: function measureHeadOnly(params: Parameters<typeof original.measureTree>[0]) {
			if (realpathSync(params.root) !== measured.head)
				throw new Error('the measure of the base tree broke')
			return original.measureTree(params)
		},
	}
})

describe(
	'dialecte bench: a measure of the base tree that throws',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('→ the bench rejects or refuses, the base tree is removed, no worktree registered', async () => {
			const repository = createBenchRepository({ baseCount: 100, headCount: 103 })
			const { root, scratch } = repository
			measured.head = realpathSync(root)
			const worktrees = git({ root, args: ['worktree', 'list'] })

			/** What is left after the run, whether it refused or threw. */
			function leftBehind(outcome: string): Record<string, unknown> {
				return {
					outcome,
					scratch: readdirSync(scratch),
					worktrees: git({ root, args: ['worktree', 'list'] }),
				}
			}

			await expect(
				runBench({
					cwd: root,
					argv: ['--check'],
					environment: repository.environment,
				}).then(
					function refused(result) {
						return leftBehind(`exit ${result.exitCode}`)
					},
					function threw(error: unknown) {
						return leftBehind(`threw ${String(error)}`)
					},
				),
			).resolves.toEqual({
				outcome: expect.stringMatching(
					/^(exit 2|threw Error: the measure of the base tree broke)$/,
				),
				scratch: [],
				worktrees,
			})
		})
	},
)
