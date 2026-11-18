/** `lot approve` holds the lot to its design (DESIGN-GATE section 3): a design not letting the lot go on is a reason. */
import { STORE_GLOB, STORE_NEED } from '../../test/design-workspace.constants.ts'
import { approvedDesign, gatedLot } from '../../test/design-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { approvalRefusals } from './lot-approve.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GatedLot } from '../../test/design-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What `lot approve` would refuse the lot for, its pull request open and green at the head it landed. */
function refusalsOf(lot: GatedLot): string[] {
	const head = git({ root: lot.root, args: ['rev-parse', 'HEAD'] }).trim()
	return approvalRefusals({
		place: {
			lot: lot.name,
			lotFolder: lot.lotFolder,
			worktree: lot.root,
			branch: 'main',
			baseRef: 'main',
			state: 'working',
		},
		pullRequest: {
			number: 7,
			url: 'https://host.test/pull/7',
			title: 'feat: x',
			body: '',
			state: 'open',
			draft: true,
			queued: false,
			head,
		},
		checks: { head, state: 'green', failing: [], pending: [] },
		landed: head,
	})
}

describe('lot approve - the design', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a design missing -> its reasons hold design missing and why', () => {
		expect(refusalsOf(gatedLot({ declared: [STORE_GLOB] }))).toEqual([
			`design missing (shared ${STORE_GLOB})`,
		])
	})

	it('a design approved for the need -> no design reason', () => {
		const lot = gatedLot({ declared: [STORE_GLOB] })
		approvedDesign({ lot, need: STORE_NEED })

		expect(refusalsOf(lot)).toEqual([])
	})
})
