/**
 * `dialecte worktree prune` keeps the lot keep rule as it was: the worktree of a lot whose hand-over was committed
 * outside its folder and whose branch is on main stays, with the reason `lot <full name> working`; only `lot close` and
 * `plan next` read such a lot as landed.
 */
import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { LANDED_LOT } from '../../test/landed-store-lot-workspace.constants.ts'
import { addLandedLot } from '../../test/landed-store-lot-workspace.ts'
import { worktreeFatesOf } from '../../test/lot-keep-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('worktree prune: landed lots', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the worktree of a lot whose hand-over was committed elsewhere and whose branch is on main → kept, reason "lot <name> working"', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[LANDED_LOT]: `${lot.branch}: lot ${LANDED_LOT} working`,
		})
	})
})
