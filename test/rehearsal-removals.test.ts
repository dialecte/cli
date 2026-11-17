/**
 * The suite's `handover run` helpers and a rehearsal's background removal: recorded with the run, never started as a
 * detached `rm -rf` that would race the test's own removal of its folder (the suite guard's leftovers).
 */
import { dirname, join } from 'node:path'

import { runIn } from './handover-store-scenario.ts'
import { runFolder } from './mutation-hooks.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from './scratch-checks.constants.ts'
import { damagedLotHandover } from './store-lot-guard-workspace.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Each recorded removal's command, and whether the path it removes lies in the workspace trash of `worktree`. */
function removalsOf(params: {
	removals: readonly { command: string; args: string[] }[]
	worktree: string
}): { command: string; inTrash: boolean }[] {
	const trash = join(dirname(params.worktree), '_trash')
	return params.removals.map((call) => ({
		command: call.command,
		inTrash: String(call.args.at(-1)).startsWith(`${trash}/`),
	}))
}

describe(
	'the handover run helpers and a rehearsal',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('runIn of a --rehearse in a pooled workspace → its background removal recorded, the path in the test workspace trash', async () => {
			const lot = damagedLotHandover('unreadable')

			const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder, '--rehearse'] })

			expect(removalsOf({ removals: run.removals, worktree: lot.worktree })).toEqual([
				{ command: 'rm', inTrash: true },
			])
		})

		it('runFolder of a --rehearse in a pooled workspace → its background removal recorded, the path in the test workspace trash', async () => {
			const lot = damagedLotHandover('unreadable')

			const run = await runFolder({ out: lot.lotFolder, argv: ['--rehearse'] })

			expect(removalsOf({ removals: run.removals, worktree: lot.worktree })).toEqual([
				{ command: 'rm', inTrash: true },
			])
		})
	},
)
