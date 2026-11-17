/**
 * The suite's `handover run` helper and a rehearsal's background removal: recorded with the run, never started as a
 * detached `rm -rf` that would race the test's own removal of its folder (the suite guard's leftovers).
 */
import { runIn } from './handover-store-scenario.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from './scratch-checks.constants.ts'
import { damagedLotHandover } from './store-lot-guard-workspace.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('runIn and a rehearsal', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('--rehearse in a pooled workspace → its background removal recorded with the run, no detached process started', async () => {
		const lot = damagedLotHandover('unreadable')

		const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder, '--rehearse'] })

		expect(run.removals?.map((call) => call.command)).toEqual(['rm'])
	})
})
