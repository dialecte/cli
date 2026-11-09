/**
 * `dialecte worktree prune`: the keep rule of the lot store (33S section 11). A worktree that a lot of the
 * repository's store names (`identity.worktree`, by real path) while the lot is not `committed` nor `canceled` is
 * kept, with the reason `lot <full name> <state>`, checked before every other rule; the store is read once for the
 * repository, no git process per lot. Every case sets the other keep reasons up so that they would NOT keep: the
 * branch's commit is merged into the base, its reflog holds two entries, no hygiene baseline stands in for its tip, no
 * `.dialecte/` folder, no link, nothing uncommitted.
 */
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { REMOVABLE } from '../../test/lot-keep-workspace.constants.ts'
import {
	addBareWorktree,
	addLotWithoutWorktree,
	addLotWorktree,
	markHandoverPending,
	pointIdentityAt,
	worktreeFatesOf,
} from '../../test/lot-keep-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LotKeepState } from '../../test/lot-keep-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ASKING = '0001-repo-asking'
const OTHER = '0002-repo-other'

/** The keep reason prune shows for a worktree on `branch` kept by the lot `name` in `state`. */
function lotReason(params: { branch: string; name: string; state: string }): string {
	return `${params.branch}: lot ${params.name} ${params.state}`
}

/** The number of git processes the trace file holds, each process once (its children left out). */
function gitProcessCount(traceFile: string): number {
	if (!existsSync(traceFile)) return 0
	return readFileSync(traceFile, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(function parse(line) {
			return JSON.parse(line) as { event: string; sid: string }
		})
		.filter((event) => event.event === 'start' && !event.sid.includes('/')).length
}

/** The fates of `worktreeFatesOf` with the git processes it started, counted from git's own trace. */
async function tracedFates(workspace: BriefWorkspace) {
	const traceFile = join(temporaryFolder('dialecte-prune-trace-'), 'trace.json')
	vi.stubEnv('GIT_TRACE2_EVENT', traceFile)
	// a trace nested in another process's session would count no top-level start: the counts must not depend on it
	vi.stubEnv('GIT_TRACE2_PARENT_SID', '')
	let fates: Record<string, string>
	try {
		fates = await worktreeFatesOf(workspace)
	} finally {
		vi.stubEnv('GIT_TRACE2_EVENT', '')
	}
	return { fates, gitProcesses: gitProcessCount(traceFile) }
}

describe('worktree prune: the lot keep rule', { timeout: STORE_CASE_TIMEOUT }, () => {
	const KEPT_STATES: LotKeepState[] = ['input-required', 'working', 'ready', 'failed']
	for (const state of KEPT_STATES)
		it(`a merged clean worktree of a lot ${state}, no other keep reason → kept, reason "lot <name> ${state}" (case 22)`, async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: ASKING, state })

			await expect(worktreeFatesOf(workspace)).resolves.toEqual({
				[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state }),
			})
		})

	const LISTED_STATES: LotKeepState[] = ['canceled', 'committed']
	for (const state of LISTED_STATES)
		it(`the same worktree with the lot ${state}, beside a worktree of a lot input-required → listed for removal, the other kept (case 22)`, async () => {
			const workspace = createBriefWorkspace()
			addLotWorktree({ workspace, name: ASKING, state })
			const asking = addLotWorktree({ workspace, name: OTHER, state: 'input-required' })

			await expect(worktreeFatesOf(workspace)).resolves.toEqual({
				[ASKING]: REMOVABLE,
				[OTHER]: lotReason({ branch: asking.branch, name: OTHER, state: 'input-required' }),
			})
		})

	it('a merged clean worktree that no lot names, beside one a working lot names and a lot whose worktree is gone → only the named one is kept', async () => {
		const workspace = createBriefWorkspace()
		const named = addLotWorktree({ workspace, name: ASKING, state: 'working' })
		addLotWithoutWorktree({ workspace, name: '0003-repo-gone', state: 'working' })
		addBareWorktree({ workspace, name: OTHER })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: named.branch, name: ASKING, state: 'working' }),
			[OTHER]: REMOVABLE,
		})
	})

	it('a worktree with a commit not in main, named by a working lot → the reason shown is the lot', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'working', merged: false })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'working' }),
		})
	})

	it('a worktree where a hand-over is pending, named by a ready lot → the reason shown is the lot, not "a hand-over is pending in it"', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'ready' })
		markHandoverPending(lot)

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'ready' }),
		})
	})

	it('a worktree with an uncommitted file, named by a lot input-required → the reason shown is the lot', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'input-required', dirty: true })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'input-required' }),
		})
	})

	it('a lot whose identity names its worktree through a symbolic link → kept all the same (compared by real path)', async () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: ASKING, state: 'input-required' })
		const link = join(temporaryFolder('dialecte-worktree-link-'), 'link')
		symlinkSync(lot.worktree, link)
		pointIdentityAt({ lotFolder: lot.lotFolder, worktree: link })

		await expect(worktreeFatesOf(workspace)).resolves.toEqual({
			[ASKING]: lotReason({ branch: lot.branch, name: ASKING, state: 'input-required' }),
		})
	})

	it('a store of several lots (a simulated one, ones whose worktree is gone, canceled and committed ones) → the same fates and the same git processes as a store of one lot', async () => {
		const single = createBriefWorkspace()
		const singleLot = addLotWorktree({ workspace: single, name: ASKING, state: 'input-required' })
		const singleRun = await tracedFates(single)

		const several = createBriefWorkspace()
		const open = addLotWorktree({ workspace: several, name: ASKING, state: 'input-required' })
		addLotWithoutWorktree({
			workspace: several,
			name: '0002-repo-simulated',
			state: 'working',
			simulated: true,
		})
		addLotWithoutWorktree({ workspace: several, name: '0003-repo-gone', state: 'input-required' })
		// closed lots naming the open lot's real worktree: a git process per lot would show, and they never override it
		addLotWithoutWorktree({
			workspace: several,
			name: '0004-repo-stopped',
			state: 'canceled',
			worktree: open.worktree,
		})
		addLotWithoutWorktree({
			workspace: several,
			name: '0005-repo-landed',
			state: 'committed',
			worktree: open.worktree,
		})
		addLotWithoutWorktree({ workspace: several, name: '0006-repo-waiting', state: 'working' })
		const severalRun = await tracedFates(several)

		expect(singleRun.gitProcesses).toBeGreaterThan(0)
		expect(severalRun).toEqual({
			fates: {
				[ASKING]: lotReason({ branch: singleLot.branch, name: ASKING, state: 'input-required' }),
			},
			gitProcesses: singleRun.gitProcesses,
		})
	})
})
